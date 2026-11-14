"""Deterministic native MCP executor (obscura default, Lightpanda kept); no Playwright import/install."""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time

from urllib.parse import urlsplit

from browser import DOM_SCRIPT, READ_ACTIONS, PlaywrightBrowserSession, _origin
from mcp_client import McpClient, McpTransportError, result_json, result_text

SKILL_DIR = Path(__file__).resolve().parents[1]

# Native tool names differ between browser engines. check/scroll are absent on
# obscura; those dispatch through the shared DOM helper instead (atomic: the
# helper rechecks preconditions, dispatches once, and verifies the outcome).
DIALECTS = {
    "lightpanda": {
        "engine": "lightpanda-mcp", "owned_session": True, "close_tool": "session_close",
        "goto": "goto", "evaluate": "evaluate", "wait": "waitForScript",
        "requests": None, "storage_state": None, "wait_selector": "waitForSelector",
        "actions": {"click": "click", "fill": "fill", "select": "selectOption",
                    "check": "setChecked", "press": "press", "scroll": "scroll"},
        "required": {"evaluate", "waitForScript", "goto", "session_close"},
    },
    "obscura": {
        "engine": "obscura-mcp", "owned_session": False, "close_tool": "browser_close",
        "goto": "browser_navigate", "evaluate": "browser_evaluate", "wait": "browser_wait_for_function",
        "requests": "browser_network_requests", "storage_state": "browser_set_storage_state",
        "actions": {"click": "browser_click", "fill": "browser_fill",
                    "select": "browser_select_option", "press": "browser_press_key"},
        "required": {"browser_navigate", "browser_evaluate", "browser_wait_for_function",
                     "browser_network_requests", "browser_close"},
    },
}

_LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def _obscura_binary(config):
    candidates = [config.get("obscura_bin"), os.getenv("WEBTEST_OBSCURA_BIN")]
    candidates += [SKILL_DIR / "bin" / "obscura" / ("obscura.exe" if os.name == "nt" else "obscura"),
                   shutil.which("obscura")]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    return None


def _reachable(host, port, timeout=0.4):
    try:
        with socket.create_connection((host, port), timeout):
            return True
    except OSError:
        return False


class NativeBrowserSession(PlaywrightBrowserSession):
    def __init__(self, frontend_url, config=None, auth=None, token=""):
        super().__init__(frontend_url, {"backend": "obscura", **(config or {})}, auth, token)
        self.dialect = DIALECTS[self.config["backend"]]
        self.engine = self.dialect["engine"]
        self.client = None
        self._process = None
        self._process_log = None
        self._action_deadline = None
        self._storage_ready = False

    def _remaining(self):
        return max(0.01, self._action_deadline - time.monotonic()) if self._action_deadline else self.timeout / 1000

    def _spawn(self, url):
        """Start the bundled obscura on a refused loopback endpoint; never touches other services."""
        binary = _obscura_binary(self.config)
        if not binary:
            raise McpTransportError(
                "No native MCP at " + url.geturl() + " and no obscura binary found; "
                "expected SKILL_DIR/bin/obscura, browser.obscura_bin or WEBTEST_OBSCURA_BIN")
        log_dir = SKILL_DIR / ".webtest"
        try:
            log_dir.mkdir(parents=True, exist_ok=True)
            target = log_dir / f"obscura-mcp-{os.getpid()}-{int(time.time())}.log"
            self._process_log = target.open("ab")
        except OSError:
            target = Path(tempfile.gettempdir()) / f"obscura-mcp-{os.getpid()}-{int(time.time())}.log"
            self._process_log = target.open("ab")
        env = {**os.environ, "OBSCURA_ALLOW_PRIVATE_NETWORK": "1"}
        argv = [binary, "mcp", "--http", "--host", url.hostname, "--port", str(url.port)]
        options = {"creationflags": subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
        try:
            self._process = subprocess.Popen(argv, env=env, stdin=subprocess.DEVNULL,
                                           stdout=self._process_log, stderr=subprocess.STDOUT, **options)
        except OSError as exc:
            raise McpTransportError("Bundled obscura could not be started: " + type(exc).__name__) from exc
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if self._process.poll() is not None:
                raise McpTransportError(f"Bundled obscura exited with {self._process.returncode}; inspect {target}")
            if _reachable(url.hostname, url.port):
                return
            time.sleep(0.15)
        raise McpTransportError(f"Bundled obscura did not open its MCP port; inspect {target}")

    async def _connect(self):
        url = self.config.get("mcp_url", "http://127.0.0.1:8000/mcp")
        parts = urlsplit(url)
        if (self.config["backend"] == "obscura" and self.config.get("auto_start", True)
                and parts.hostname in _LOOPBACK and parts.port and not _reachable(parts.hostname, parts.port)):
            self._spawn(parts)
        self.client = McpClient(url, self.config.get("mcp_token_env"),
                                require_session=self.dialect["owned_session"],
                                close_tool=self.dialect["close_tool"])
        if self._process is not None:
            deadline = time.monotonic() + 10
            while True:
                try:
                    await self.client.connect(self.timeout / 1000)
                    break
                except McpTransportError:
                    if self._process.poll() is not None or time.monotonic() >= deadline:
                        raise
                    self.client = McpClient(url, self.config.get("mcp_token_env"),
                                            require_session=self.dialect["owned_session"],
                                            close_tool=self.dialect["close_tool"])
                    time.sleep(0.3)
        else:
            await self.client.connect(self.timeout / 1000)
        missing = self.dialect["required"] - self.client.tools.keys()
        if missing:
            raise McpTransportError("Native MCP lacks required tools: " + ", ".join(sorted(missing)))
        self._page = self  # Shared executor's owned-session marker, not a Playwright page.

    async def _tool(self, name, arguments):
        return await self.client.tool(name, arguments, self._remaining())

    async def _js(self, script):
        # Engines return bare strings as text, objects as JSON. An object
        # envelope keeps strings, booleans and objects unambiguous on the wire.
        tool = self.dialect["evaluate"]
        key = "script" if self.config["backend"] == "lightpanda" else "expression"
        result = result_json(await self._tool(tool, {
            key: "({value: (" + script + ")})",
            "timeoutMs" if key == "expression" else "timeout": max(1, int(self._remaining() * 1000) - 20)}))
        if not isinstance(result, dict) or "value" not in result:
            raise McpTransportError("Native MCP evaluate did not return the expected value envelope")
        return result["value"]

    def _expression(self, action, operation, data=None, prepare=False):
        payload = {"id": action.get("selector", "")[1:], "operation": operation, "data": data,
                   "maxNodes": action.get("max_nodes", 30), "prepare": prepare}
        return "(" + DOM_SCRIPT + ")(" + json.dumps(payload, ensure_ascii=False) + ")"

    async def _evaluate(self, action, operation, data=None):
        result = await self._js(self._expression(action, operation, data))
        if not isinstance(result, dict):
            raise McpTransportError("Native MCP DOM evaluation did not return an object")
        return result

    def _state(self, result):
        self.last_evidence["last_state"] = {key: result[key] for key in
            ("count", "tag", "visible", "enabled", "readonly", "error") if key in result}
        if result.get("error") and not result.get("retryable", False):
            raise AssertionError(result["error"])

    async def _wait(self, expression, predicate):
        timeout = max(1, int(self._remaining() * 1000) - 20)
        if self.config["backend"] == "obscura":
            # wait_for_function polls an expression; a throw may only read as
            # falsy. Surface permanent errors as truthy so the re-evaluation
            # after the wait raises the real error instead of a bare timeout.
            script = "(() => { const s = " + expression + "; if(s.error && !s.retryable) return true; return " + predicate + "; })()"
            await self._tool(self.dialect["wait"], {"function": script, "timeout": timeout, "pollIntervalMs": 100})
        else:
            script = "(() => { const s = " + expression + "; if(s.error && !s.retryable) throw new Error(s.error); return " + predicate + "; })()"
            await self._tool(self.dialect["wait"], {"script": script, "timeout": timeout})

    async def _read_assertion(self, action):
        name = action["action"]
        data = {"assertion": name, "text": str(action.get("text", "")), "value": str(action.get("value", "")),
                "exact": action.get("exact", False)}
        expression = self._expression(action, "read", data)
        result = await self._js(expression)
        self._state(result)
        if self._condition(action, result):
            return {"ok": True}
        if name == "wait_for":
            predicate = {"attached": "!s.error", "detached": "s.count===0",
                "visible": "!s.error && s.visible", "hidden": "s.count===0 || (!s.error && !s.visible)",
                "enabled": "!s.error && s.visible && s.enabled"}[action.get("state", "attached")]
        elif name in {"assert_text", "assert_value"}:
            predicate = "!s.error && s.matches"
        elif name == "assert_checked":
            predicate = "!s.error && s.checkable && s.checked===" + json.dumps(action.get("checked", True))
        else:
            predicate = "!s.error && s.visible"
        await self._wait(expression, predicate)
        result = await self._js(expression)
        self._state(result)
        if not self._condition(action, result):
            raise AssertionError("Native MCP wait returned before the assertion was satisfied")
        return {"ok": True}

    async def _main_document_status(self, target, actual):
        tool = self.dialect["requests"]
        if tool is None:
            return None  # Lightpanda reports status in the goto result itself.
        text = result_text(await self._tool(tool, {}))
        entries = re.findall(r"\[(\d{3})\]\s+\S+\s+(\S+)", text)
        for wanted in (actual, target):
            for status, url in entries:
                if url == wanted:
                    return int(status)
        return -1 if entries else None

    async def _goto(self, target):
        if self.config["backend"] == "obscura":
            result = await self._tool(self.dialect["goto"], {"url": target, "waitUntil": "domcontentloaded"})
        else:
            result = await self._tool(self.dialect["goto"], {"url": target, "waitUntil": "domcontentloaded",
                                                           "timeout": max(1, int(self._remaining() * 1000) - 20)})
        text = result_text(result)
        structured = result.get("structuredContent", {})
        status = structured.get("httpStatus") if isinstance(structured, dict) else None
        match = re.search(r"\bHTTP\s+(\d{3})\b", text, re.I)
        status = status if type(status) is int else int(match[1]) if match else None
        actual = await self._js("location.href")
        if status is None:
            status = await self._main_document_status(target, actual)
        if status is None:
            raise McpTransportError("Native MCP goto returned no HTTP status; upgrade the service rather than accepting an unverified navigation")
        if status == -1:
            raise McpTransportError("Native MCP request log lacks the navigated document; cannot verify HTTP status")
        if status >= 400:
            raise AssertionError("Page returned HTTP " + str(status))
        if re.search(r"navigation (?:started|timed?\s*out)|did not finish loading", text, re.I):
            raise AssertionError("Native MCP navigation did not finish; no automatic replay")
        if not isinstance(actual, str) or _origin(actual) != _origin(self.frontend_url):
            raise AssertionError("Native MCP navigation left the configured frontend origin")

    async def _seed_storage(self):
        storage = {area: {key: str(value).replace("${token}", self.token) for key, value in entries.items()}
                   for area, entries in self.config.get("storage", {}).items()}
        if self._storage_ready or not storage:
            return
        parts = urlsplit(self.frontend_url)
        origin = parts.scheme + "://" + parts.netloc
        if self.dialect["storage_state"] in self.client.tools:
            state = {"origins": [{"origin": origin, **{area: [[key, value] for key, value in entries.items()]
                                                         for area, entries in storage.items() if entries}}]}
            await self._tool(self.dialect["storage_state"], {"state": state})
            self._storage_ready = True
            return
        # Lightpanda has no pre-navigation storage hook. Load the same origin,
        # seed app storage, then navigate again so app scripts see the values.
        await self._goto(self._url("/"))
        payload = {"origin": origin, "storage": storage}
        ok = await self._js("(payload => { if(location.origin !== payload.origin) return false; "
            "for(const area of ['localStorage','sessionStorage']) for(const [key,value] of Object.entries(payload.storage[area]||{})) "
            "window[area].setItem(key,String(value)); return true; })(" + json.dumps(payload, ensure_ascii=False) + ")")
        if ok is not True:
            raise AssertionError("Native MCP could not seed storage on the frontend origin")
        self._storage_ready = True

    async def _dom_dispatch(self, action, name, data):
        """Dispatch through the shared DOM helper: rechecks, dispatches once, verifies."""
        result = await self._evaluate(action, name, data)
        self._state(result)
        if result.get("error"):
            raise AssertionError(result["error"])
        return result

    async def _action(self, action):
        self._action_deadline = time.monotonic() + action.get("timeout_ms", self.timeout) / 1000
        if self.client.broken:
            raise McpTransportError("Native MCP session is uncertain; actions will not be replayed")
        name = action["action"]
        if name == "goto":
            await self._seed_storage()
            await self._goto(self._url(action["path"]))
            return {"ok": True}
        if name == "snapshot":
            result = await self._evaluate(action, "snapshot")
            self._state(result)
            if result.get("error"):
                await self._wait(self._expression(action, "snapshot"), "!s.error")
                result = await self._evaluate(action, "snapshot")
                self._state(result)
                if result.get("error"):
                    raise AssertionError("Native MCP snapshot root is still unavailable")
            return result
        if name in READ_ACTIONS:
            return await self._read_assertion(action)
        if name == "assert_url":
            expected = self._url(action["path"])
            expression = "location.href === " + json.dumps(expected)
            if await self._js(expression) is not True:
                self.last_evidence["last_state"] = {"url_matches": False}
                await self._wait(expression, "s")
                if await self._js(expression) is not True:
                    raise AssertionError("Native MCP URL assertion was not satisfied")
            return {"ok": True}
        data = (action.get("checked", True) if name == "check" else action["key"] if name == "press" else
                {"x": action.get("x", 0), "y": action.get("y", 0)} if name == "scroll" else action.get("value", ""))
        expression = self._expression(action, name, data, prepare=True)
        state = await self._js(expression)
        self._state(state)
        if state.get("error"):
            await self._wait(expression, "!s.error && s.ok")
            state = await self._js(expression)
            self._state(state)
            if state.get("error"):
                raise AssertionError("Native MCP control is still not ready")
        selector = '[id="' + action["selector"][1:] + '"]' if action.get("selector") else None
        if name == "check" and state.get("checked") == data:
            return {"ok": True}
        if name not in self.dialect["actions"]:
            return await self._dom_dispatch(action, name, data)
        if name == "scroll":
            return await self._scroll(action, selector, data)
        if name == "select" and isinstance(data, list):
            # Native selectOption supports one value; keep existing multi-select
            # semantics through the shared DOM helper, without replay.
            result = await self._evaluate(action, "select", data)
            self._state(result)
            if result.get("error"):
                raise AssertionError("Native MCP multiple selection was not applied")
            return {"ok": True, "operation": "DOM multiple select"}
        args = {
            "click": {"selector": selector},
            "fill": {"selector": selector, "value": str(data)},
            "select": {"selector": selector, "value": str(data)},
            "check": {"selector": selector, "checked": data},
            "press": {"selector": selector, "key": data},
        }[name]
        await self._tool(self.dialect["actions"][name], args)
        # Native tools may echo input values. Only return our compact evidence.
        return {"ok": True}

    async def _execute(self, step):
        await self._start()
        required = set(self.dialect["required"])
        names = self.dialect["actions"]
        required |= {names[action["action"]] for action in step["actions"]
                     if action["action"] in names
                     and not (action["action"] == "select" and isinstance(action.get("value"), list))}
        if self.config["backend"] == "lightpanda":
            scroll_properties = self.client.tools.get("scroll", {}).get("inputSchema", {}).get("properties", {})
            if "selector" not in scroll_properties and any(
                    action["action"] == "scroll" and action.get("selector") for action in step["actions"]):
                required.add("waitForSelector")
        missing = required - self.client.tools.keys()
        if missing:
            raise McpTransportError("Native MCP lacks tools required by this batch: " + ", ".join(sorted(missing)))
        return await super()._execute(step)

    async def _scroll(self, action, selector, data):
        before = await self._evaluate(action, "scroll_state")
        if not all(isinstance(before.get(axis), (int, float)) and math.isfinite(before[axis]) for axis in ("x", "y")):
            raise AssertionError("Native MCP scroll offsets are unsupported")
        arguments = {axis: before[axis] + data[axis] for axis in ("x", "y")}
        if selector:
            properties = self.client.tools.get("scroll", {}).get("inputSchema", {}).get("properties", {})
            if "selector" in properties:
                arguments["selector"] = selector
            else:
                node = await self._tool("waitForSelector", {"selector": selector, "timeout": max(1, int(self._remaining() * 1000) - 20)})
                structured = node.get("structuredContent", {})
                node_id = structured.get("backendNodeId") if isinstance(structured, dict) else None
                match = re.search(r"backendNodeId\s*:\s*(\d+)", result_text(node))
                if node_id is None and match:
                    node_id = int(match[1])
                if type(node_id) is not int:
                    raise McpTransportError("Native MCP did not resolve a scroll target node")
                arguments["backendNodeId"] = node_id
        await self._tool("scroll", arguments)
        after = await self._evaluate(action, "scroll_state")
        if before["x"] == after.get("x") and before["y"] == after.get("y"):
            raise AssertionError("Native MCP scroll did not move: boundary or unsupported layout; no replay")
        return {"ok": True, "before": {key: before[key] for key in ("x", "y")},
                "after": {key: after[key] for key in ("x", "y")}, "semantics": "DOM offsets; no visual validation"}

    async def _diagnostic(self):
        self._action_deadline = time.monotonic() + 1
        await super()._diagnostic()

    async def _close(self):
        self._page = None
        try:
            if self.client is not None:
                await self.client.close()
        finally:
            self.client = None
            if self._process is not None:
                process, self._process = self._process, None
                if process.poll() is None:
                    if os.name == "nt":
                        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                                       capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW, timeout=15)
                    else:
                        try:
                            process.terminate()
                            process.wait(timeout=5)
                        except (OSError, subprocess.TimeoutExpired):
                            process.kill()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    pass
            if self._process_log is not None:
                self._process_log.close()
                self._process_log = None
