"""Deterministic native Lightpanda MCP executor; no Playwright import/install."""
from __future__ import annotations

import json
import math
import re
import time

from browser import DOM_SCRIPT, READ_ACTIONS, PlaywrightBrowserSession, _origin
from mcp_client import McpClient, McpTransportError, result_json, result_text


class NativeBrowserSession(PlaywrightBrowserSession):
    engine = "lightpanda-mcp"

    def __init__(self, frontend_url, config=None, auth=None, token=""):
        super().__init__(frontend_url, {"backend": "lightpanda", **(config or {})}, auth, token)
        self.client = None
        self._action_deadline = None
        self._storage_ready = False

    def _remaining(self):
        return max(0.01, self._action_deadline - time.monotonic()) if self._action_deadline else self.timeout / 1000

    async def _connect(self):
        self.client = McpClient(self.config.get("mcp_url", "http://127.0.0.1:8000/mcp"), self.config.get("mcp_token_env"))
        await self.client.connect(self.timeout / 1000)
        required = {"evaluate", "waitForScript", "goto", "session_close"}
        missing = required - self.client.tools.keys()
        if missing:
            raise McpTransportError("Native MCP lacks required tools: " + ", ".join(sorted(missing)))
        self._page = self  # Shared executor's owned-session marker, not a Playwright page.

    async def _tool(self, name, arguments):
        return await self.client.tool(name, arguments, self._remaining())

    async def _js(self, script):
        # Lightpanda returns bare strings as text, objects as JSON. An object
        # envelope keeps strings, booleans and objects unambiguous on the wire.
        result = result_json(await self._tool("evaluate", {
            "script": "({value: (" + script + ")})",
            "timeout": max(1, int(self._remaining() * 1000) - 20)}))
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
        script = "(() => { const s = " + expression + "; if(s.error && !s.retryable) throw new Error(s.error); return " + predicate + "; })()"
        await self._tool("waitForScript", {"script": script, "timeout": max(1, int(self._remaining() * 1000) - 20)})

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

    async def _goto(self, target):
        result = await self._tool("goto", {"url": target, "timeout": max(1, int(self._remaining() * 1000) - 20),
                                           "waitUntil": "domcontentloaded"})
        text = result_text(result)
        structured = result.get("structuredContent", {})
        status = structured.get("httpStatus") if isinstance(structured, dict) else None
        match = re.search(r"\bHTTP\s+(\d{3})\b", text, re.I)
        status = status if type(status) is int else int(match[1]) if match else None
        if status is None:
            raise McpTransportError("Native MCP goto returned no HTTP status; upgrade the service rather than accepting an unverified navigation")
        if status >= 400:
            raise AssertionError("Page returned HTTP " + str(status))
        if re.search(r"navigation (?:started|timed?\s*out)|did not finish loading", text, re.I):
            raise AssertionError("Native MCP navigation did not finish; no automatic replay")
        actual = await self._js("location.href")
        if not isinstance(actual, str) or _origin(actual) != _origin(self.frontend_url):
            raise AssertionError("Native MCP navigation left the configured frontend origin")

    async def _seed_storage(self):
        storage = {area: {key: str(value).replace("${token}", self.token) for key, value in entries.items()}
                   for area, entries in self.config.get("storage", {}).items()}
        if self._storage_ready or not storage:
            return
        # MCP has no pre-navigation init script hook. Load the same origin,
        # seed app storage, then navigate again so app scripts see the values.
        await self._goto(self._url("/"))
        payload = {"origin": self.frontend_url.rstrip("/"), "storage": storage}
        from urllib.parse import urlsplit
        parts = urlsplit(self.frontend_url)
        payload["origin"] = parts.scheme + "://" + parts.netloc
        ok = await self._js("(payload => { if(location.origin !== payload.origin) return false; "
            "for(const area of ['localStorage','sessionStorage']) for(const [key,value] of Object.entries(payload.storage[area]||{})) "
            "window[area].setItem(key,String(value)); return true; })(" + json.dumps(payload, ensure_ascii=False) + ")")
        if ok is not True:
            raise AssertionError("Native MCP could not seed storage on the frontend origin")
        self._storage_ready = True

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
                await self._tool("waitForScript", {"script": expression, "timeout": max(1, int(self._remaining() * 1000) - 20)})
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
        if name == "scroll":
            return await self._scroll(action, selector, data)
        if name == "check" and state.get("checked") == data:
            return {"ok": True}
        if name == "select" and isinstance(data, list):
            # Native selectOption supports one value; keep existing multi-select
            # semantics through the shared DOM helper, without replay.
            result = await self._evaluate(action, "select", data)
            self._state(result)
            if result.get("error"):
                raise AssertionError("Native MCP multiple selection was not applied")
            return {"ok": True, "operation": "DOM multiple select"}
        tool, args = {
            "click": ("click", {"selector": selector}),
            "fill": ("fill", {"selector": selector, "value": str(data)}),
            "select": ("selectOption", {"selector": selector, "value": str(data)}),
            "check": ("setChecked", {"selector": selector, "checked": data}),
            "press": ("press", {"selector": selector, "key": data}),
        }[name]
        await self._tool(tool, args)
        # Native tools may echo input values. Only return our compact evidence.
        return {"ok": True}

    async def _execute(self, step):
        await self._start()
        names = {"click": "click", "fill": "fill", "select": "selectOption", "check": "setChecked",
                 "press": "press", "scroll": "scroll"}
        required = {names[action["action"]] for action in step["actions"] if action["action"] in names
                    and not (action["action"] == "select" and isinstance(action.get("value"), list))}
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
        if self.client is not None:
            try:
                await self.client.close()
            finally:
                self.client = None
