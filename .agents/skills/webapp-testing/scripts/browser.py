"""Shared action contract and optional Playwright CDP executor for Lightpanda."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
import re
import time
from urllib.parse import urljoin, urlsplit

DOM_SCRIPT = Path(__file__).with_name("browser_dom.js").read_text(encoding="utf-8")
ID_PATTERN = r"#[A-Za-z_][A-Za-z0-9_.:-]*"
ACTIONS = {"goto", "click", "fill", "select", "check", "press", "scroll", "snapshot",
           "wait_for", "assert_text", "assert_value", "assert_visible", "assert_checked", "assert_url"}
READ_ACTIONS = {"wait_for", "assert_text", "assert_value", "assert_visible", "assert_checked"}
KEYS = {"Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "}
ACTION_FIELDS = {
    "goto": {"path"}, "click": set(), "fill": {"value"}, "select": {"value"},
    "check": {"checked"}, "press": {"key"}, "scroll": {"x", "y"}, "snapshot": {"max_nodes"},
    "wait_for": {"state"}, "assert_text": {"text", "exact"}, "assert_value": {"value"},
    "assert_visible": set(), "assert_checked": {"checked"}, "assert_url": {"path"},
}


def _origin(url):
    value = urlsplit(url)
    return (value.scheme.lower(), value.hostname, value.port or (443 if value.scheme == "https" else 80))


def _milliseconds(value, name, maximum=300000):
    if type(value) is not int or not 1 <= value <= maximum:
        raise ValueError(f"{name} must be an integer in [1, {maximum}]")
    return value


def validate_config(config, allow_variables=False):
    if not isinstance(config, dict):
        raise ValueError("browser must be an object")
    if set(config) - {"backend", "mcp_url", "mcp_token_env", "cdp_url", "timeout_ms", "step_timeout_ms", "poll_interval_ms", "storage"}:
        raise ValueError("Unknown browser configuration field")
    backend = config.get("backend", "lightpanda")
    if not isinstance(backend, str) or backend not in {"lightpanda", "playwright"}:
        raise ValueError("browser.backend must be lightpanda (native MCP) or playwright (CDP)")
    if backend == "lightpanda" and "cdp_url" in config:
        raise ValueError("cdp_url requires browser.backend=playwright; native Lightpanda uses mcp_url")
    if backend == "playwright" and ("mcp_url" in config or "mcp_token_env" in config):
        raise ValueError("mcp_url/mcp_token_env require browser.backend=lightpanda")
    field = "mcp_url" if backend == "lightpanda" else "cdp_url"
    endpoint = config.get(field, "http://127.0.0.1:8000/mcp" if backend == "lightpanda" else "ws://127.0.0.1:9222")
    if not isinstance(endpoint, str):
        raise ValueError("browser." + field + " must be a URL")
    if allow_variables:
        endpoint = re.sub(r"\$\{[A-Za-z_][\w.-]*\}", "1", endpoint)
        if re.fullmatch(r"\$\{[A-Za-z_][\w.-]*\}", config.get(field, "")):
            endpoint = "http://127.0.0.1:8000/mcp"
    try:
        parsed = urlsplit(endpoint)
        schemes = {"http", "https"} if backend == "lightpanda" else {"http", "https", "ws", "wss"}
        valid = parsed.scheme in schemes and parsed.hostname and parsed.port != 0 and not parsed.username and not parsed.password
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("Invalid browser." + field + "; use a supported URL without embedded credentials")
    if "mcp_token_env" in config and (not isinstance(config["mcp_token_env"], str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", config["mcp_token_env"])):
        raise ValueError("browser.mcp_token_env must name an environment variable")
    _milliseconds(config.get("timeout_ms", 10000), "browser.timeout_ms")
    _milliseconds(config.get("step_timeout_ms", 60000), "browser.step_timeout_ms", 600000)
    poll = config.get("poll_interval_ms", 100)
    if type(poll) is not int or not 20 <= poll <= 1000:
        raise ValueError("browser.poll_interval_ms must be an integer in [20, 1000]")
    storage = config.get("storage", {})
    if not isinstance(storage, dict) or set(storage) - {"localStorage", "sessionStorage"}:
        raise ValueError("browser.storage allows localStorage and sessionStorage objects")
    if any(not isinstance(entries, dict) for entries in storage.values()):
        raise ValueError("browser storage entries must be objects")


def validate_action(action, allow_variables=False):
    if not isinstance(action, dict) or not isinstance(action.get("action"), str) or action["action"] not in ACTIONS:
        raise ValueError("Unsupported browser action")
    name = action["action"]
    if set(action) - ({"id", "action", "selector", "timeout_ms"} | ACTION_FIELDS[name]):
        raise ValueError("Unknown field on browser action " + name)
    if name in {"goto", "assert_url"} and "selector" in action:
        raise ValueError(name + " does not take a selector")
    if "timeout_ms" in action:
        _milliseconds(action["timeout_ms"], "action.timeout_ms")
    selector = action.get("selector")
    if allow_variables and isinstance(selector, str):
        selector = re.sub(r"\$\{[A-Za-z_][\w.-]*\}", "value", selector)
    if name not in {"goto", "assert_url", "scroll", "snapshot"} or selector is not None:
        if not isinstance(selector, str) or not re.fullmatch(ID_PATTERN, selector):
            raise ValueError("Browser selector must be one stable ID, e.g. #order-create-submit")
    if name in {"goto", "assert_url"} and not isinstance(action.get("path"), str):
        raise ValueError(name + " needs a path")
    required = {"fill": "value", "select": "value", "assert_text": "text", "assert_value": "value", "press": "key"}
    if name in required and required[name] not in action:
        raise ValueError(name + " needs " + required[name])
    field = {"check": "checked", "assert_checked": "checked", "assert_text": "exact"}.get(name)
    if field and field in action and type(action[field]) is not bool:
        raise ValueError(field + " must be a boolean")
    if name == "wait_for" and action.get("state", "attached") not in {"attached", "detached", "visible", "hidden", "enabled"}:
        raise ValueError("wait_for state must be attached, detached, visible, hidden or enabled")
    if name == "press" and action["key"] not in KEYS:
        raise ValueError("press supports Enter, Escape, Tab, ArrowUp/Down/Left/Right and space")
    if name == "scroll":
        for field in ("x", "y"):
            if type(action.get(field, 0)) is not int or abs(action.get(field, 0)) > 100000:
                raise ValueError("scroll x/y must be integer deltas within +/-100000")
        if not action.get("x", 0) and not action.get("y", 0):
            raise ValueError("scroll needs a nonzero x or y delta")
    if name == "snapshot" and (type(action.get("max_nodes", 30)) is not int or not 1 <= action.get("max_nodes", 30) <= 80):
        raise ValueError("snapshot.max_nodes must be an integer in [1, 80]")


class PlaywrightBrowserSession:
    """One owned context and page, reused across steps, with a private event loop."""
    engine = "lightpanda-cdp"

    def __init__(self, frontend_url, config=None, auth=None, token=""):
        self.frontend_url = frontend_url.rstrip("/") + "/"
        self.config, self.auth, self.token = {"backend": "playwright", **(config or {})}, auth or {}, token or ""
        validate_config(self.config)
        self.timeout = self.config.get("timeout_ms", 10000)
        self._playwright = self._browser = self._context = self._page = None
        self._loop = None
        self.last_evidence = {}

    async def _start(self):
        if self._page is not None:
            return
        try:
            await self._connect()
        except BaseException:
            try:
                await self._close()
            except Exception as exc:
                self.last_evidence["connection_cleanup_error"] = type(exc).__name__
            raise

    async def _connect(self):
        try:
            from playwright.async_api import async_playwright
        except ImportError as exc:
            raise RuntimeError("Browser steps require: python -m pip install 'playwright>=1.55,<2'; start Lightpanda CDP separately") from exc
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.connect_over_cdp(
            self.config.get("cdp_url", "ws://127.0.0.1:9222"), timeout=self.timeout)
        self._context = await self._browser.new_context()
        self._context.set_default_timeout(self.timeout)
        if self.auth.get("mode", "token") == "token" and self.token:
            async def route_request(route):
                if _origin(route.request.url) == _origin(self.frontend_url):
                    await route.continue_(headers={**route.request.headers,
                        self.auth.get("header", "Authorization"): self.auth.get("prefix", "Bearer ") + self.token})
                else:
                    await route.continue_()
            await self._context.route("**/*", route_request)
        storage = {area: {key: str(value).replace("${token}", self.token) for key, value in entries.items()}
                   for area, entries in self.config.get("storage", {}).items()}
        if storage:
            await self._context.add_init_script(script="""(payload => {
                if (location.origin !== payload.origin) return;
                for (const area of ['localStorage', 'sessionStorage']) {
                    for (const [key, value] of Object.entries(payload.storage[area] || {}))
                        window[area].setItem(key, String(value));
                }
            })(""" + json.dumps({"origin": urlsplit(self.frontend_url).scheme + "://" + urlsplit(self.frontend_url).netloc,
                                  "storage": storage}, ensure_ascii=False) + ");")
        self._page = await self._context.new_page()

    async def _evaluate(self, action, operation, data=None):
        return await self._page.evaluate(DOM_SCRIPT, {"id": action.get("selector", "")[1:],
            "operation": operation, "data": data, "maxNodes": action.get("max_nodes", 30)})

    @staticmethod
    def _condition(action, result):
        name = action["action"]
        exists = not result.get("error")
        if name == "wait_for":
            state = action.get("state", "attached")
            return {"attached": exists, "detached": result.get("count") == 0,
                    "visible": exists and result.get("visible"),
                    "hidden": result.get("count") == 0 or (exists and not result.get("visible")),
                    "enabled": exists and result.get("visible") and result.get("enabled")}[state]
        if not exists:
            return False
        if name in {"assert_text", "assert_value"}:
            return result.get("matches", False)
        if name == "assert_checked":
            if not result.get("checkable"):
                raise AssertionError("assert_checked needs a checkbox or radio")
            return result.get("checked") == action.get("checked", True)
        return result.get("visible", False)

    async def _poll(self, action):
        name = action["action"]
        read = name in READ_ACTIONS
        while True:
            if name == "assert_url":
                current = await self._page.evaluate("() => location.href")
                if current == self._url(action["path"]):
                    return {"ok": True}
                self.last_evidence["last_state"] = {"url_matches": False}
            else:
                data = (action.get("checked", True) if name == "check" else action["key"] if name == "press" else
                        {"x": action.get("x", 0), "y": action.get("y", 0)} if name == "scroll" else action.get("value", ""))
                if read:
                    data = {"assertion": name, "text": str(action.get("text", "")),
                            "value": str(action.get("value", "")), "exact": action.get("exact", False)}
                try:
                    result = await self._evaluate(action, "read" if read else name, data)
                except Exception as exc:
                    # Reads can cross a navigation triggered by the previous action.
                    # A mutation with an ambiguous result must never be replayed.
                    if not read or not any(message in str(exc).lower() for message in
                        ("execution context was destroyed", "cannot find context with specified id")):
                        raise
                    result = {"error": "Navigation replaced the read context", "retryable": True}
                self.last_evidence["last_state"] = {key: result[key] for key in
                    ("count", "tag", "visible", "enabled", "readonly", "error") if key in result}
                if result.get("error") and not result.get("retryable", False):
                    raise AssertionError(result["error"])
                if read and self._condition(action, result):
                    return {"ok": True}
                if not read and not result.get("error"):
                    return result
            await asyncio.sleep(self.config.get("poll_interval_ms", 100) / 1000)

    def _url(self, path):
        target = urljoin(self.frontend_url, path)
        if _origin(target) != _origin(self.frontend_url):
            raise ValueError("Browser navigation and URL assertions must stay on the frontend origin")
        return target

    async def _action(self, action):
        if action["action"] == "goto":
            response = await self._page.goto(self._url(action["path"]), wait_until="domcontentloaded", timeout=action.get("timeout_ms", self.timeout))
            if response and response.status >= 400:
                raise AssertionError("Page returned HTTP " + str(response.status))
            return {"ok": True}
        return await self._poll(action)

    async def _execute(self, step):
        await self._start()
        self.last_evidence["phase"] = "actions"
        for index, action in enumerate(step["actions"], 1):
            self.last_evidence["failed_action"] = {"index": index, "action": action["action"],
                **({"selector": action["selector"]} if "selector" in action else {})}
            self.last_evidence.pop("last_state", None)
            tick = time.monotonic()
            try:
                result = await asyncio.wait_for(self._action(action), action.get("timeout_ms", self.timeout) / 1000)
            except asyncio.TimeoutError as exc:
                raise AssertionError("Browser action timed out; dispatched actions are not replayed") from exc
            entry = {"index": index, "action": action["action"], "status": "pass",
                     "duration_ms": round((time.monotonic() - tick) * 1000)}
            if "selector" in action:
                entry["selector"] = action["selector"]
            if action["action"] in {"snapshot", "scroll"}:
                entry["result"] = result
            self.last_evidence["actions"].append(entry)
        self.last_evidence.pop("failed_action", None)
        self.last_evidence.pop("last_state", None)
        return self.last_evidence

    async def _diagnostic(self):
        if self._page is not None:
            try:
                self.last_evidence["snapshot"] = await asyncio.wait_for(
                    self._evaluate({"max_nodes": 20}, "snapshot"), 1)
            except Exception:
                self.last_evidence["snapshot"] = {"unavailable": True}

    def run_step(self, step):
        self.last_evidence = {"actions": [], "engine": self.engine,
                              "visibility": "DOM semantics; no visual layout validation", "phase": "validate"}
        if not isinstance(step.get("actions"), list) or not step["actions"]:
            raise ValueError("Browser step needs a nonempty actions list")
        for action in step["actions"]:
            validate_action(action)
        self.last_evidence.update(phase="connect", action_count=len(step["actions"]))
        if self._loop is None:
            self._loop = asyncio.new_event_loop()
        try:
            result = self._loop.run_until_complete(asyncio.wait_for(
                self._execute(step), self.config.get("step_timeout_ms", 60000) / 1000))
            result.pop("phase", None)
            return result
        except asyncio.TimeoutError as exc:
            self._loop.run_until_complete(self._diagnostic())
            raise AssertionError("Browser step budget exhausted; actions are not replayed") from exc
        except Exception:
            self._loop.run_until_complete(self._diagnostic())
            raise

    async def _close(self):
        try:
            if self._context is not None:
                await asyncio.wait_for(self._context.close(), 3)
        finally:
            self._context = self._page = self._browser = None
            if self._playwright is not None:
                try:
                    await asyncio.wait_for(self._playwright.stop(), 3)
                finally:
                    self._playwright = None

    def close(self):
        if self._loop is not None:
            try:
                self._loop.run_until_complete(self._close())
            finally:
                self._loop.close()
                self._loop = None


def BrowserSession(frontend_url, config=None, auth=None, token=""):
    """Select an explicit backend; failures never trigger an automatic fallback."""
    config = config or {}
    validate_config(config)
    if config.get("backend", "lightpanda") == "playwright":
        return PlaywrightBrowserSession(frontend_url, config, auth, token)
    from browser_mcp import NativeBrowserSession
    return NativeBrowserSession(frontend_url, config, auth, token)
