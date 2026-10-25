"""Lightpanda CDP adapter. No Chromium installation or fallback is performed."""
from __future__ import annotations

import json
import re
import time
from urllib.parse import urljoin, urlsplit


def _origin(url):
    value = urlsplit(url)
    return (value.scheme.lower(), value.hostname, value.port or (443 if value.scheme == "https" else 80))


class BrowserSession:
    """A separate browser context and page retained across steps in a run."""

    def __init__(self, frontend_url, config=None, auth=None, token=""):
        self.frontend_url = frontend_url.rstrip("/") + "/"
        self.config = config or {}
        self.auth = auth or {}
        self.token = token or ""
        self.timeout = int(self.config.get("timeout_ms", 10000))
        self._playwright = self._browser = self._context = self._page = None

    def _start(self):
        if self._page is not None:
            return
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise RuntimeError("Browser steps require: python -m pip install 'playwright>=1.55,<2'; start Lightpanda CDP separately") from exc
        try:
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.connect_over_cdp(
                self.config.get("cdp_url", "ws://127.0.0.1:9222"), timeout=self.timeout
            )
            self._context = self._browser.new_context()
            self._context.set_default_timeout(self.timeout)
            header = self.auth.get("header", "Authorization")
            prefix = self.auth.get("prefix", "Bearer ")
            # Credentials are only attached to requests to the frontend origin.
            # Cross-origin backend requests must use the app's configured auth flow.
            if self.auth.get("mode", "token") == "token" and self.token:
                def route_request(route):
                    if _origin(route.request.url) == _origin(self.frontend_url):
                        route.continue_(headers={**route.request.headers, header: prefix + self.token})
                    else:
                        route.continue_()
                self._context.route("**/*", route_request)
            storage = self.config.get("storage", {})
            storage = {area: {key: str(value).replace("${token}", self.token) for key, value in entries.items()}
                       for area, entries in storage.items()}
            if storage:
                # Origin guard also applies to frames/navigations using this context.
                self._context.add_init_script(script="""(function(payload) {
                    if (location.origin !== payload.origin) return;
                    for (const area of ['localStorage', 'sessionStorage']) {
                        for (const [key, value] of Object.entries(payload.storage[area] || {})) {
                            window[area].setItem(key, String(value));
                        }
                    }
                })(""" + json.dumps({"origin": urlsplit(self.frontend_url).scheme + "://" + urlsplit(self.frontend_url).netloc,
                                     "storage": storage}, ensure_ascii=False) + ");")
            self._page = self._context.new_page()
        except Exception:
            self.close()
            raise

    def _target(self, action):
        selector = action.get("selector", "")
        if not re.fullmatch(r"#[A-Za-z_][A-Za-z0-9_.:-]*", selector):
            raise ValueError("Browser selector must be one stable ID, e.g. #order-create-submit")
        return selector[1:]

    def _evaluate(self, element_id, operation, data=None):
        # Lightpanda has no graphical layout: interact through DOM events, not
        # pixel coordinates or Playwright's rendered-layout actionability checks.
        return self._page.evaluate("""({id, operation, data}) => {
            const all = Array.from(document.querySelectorAll('[id]')).filter(el => el.id === id);
            if (all.length !== 1) return {error: `Expected unique ID ${id}; found ${all.length}`, count: all.length};
            const el = all[0];
            const visible = () => {
                for (let cur = el; cur; cur = cur.parentElement) {
                    if (cur.hidden || cur.getAttribute('aria-hidden') === 'true') return false;
                    const style = cur.style;
                    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
                    if (typeof getComputedStyle === 'function') {
                        const computed = getComputedStyle(cur);
                        if (computed.display === 'none' || computed.visibility === 'hidden') return false;
                    }
                }
                return true;
            };
            if (operation === 'read') return {text: el.textContent || '', value: el.value, visible: visible()};
            if (!visible()) return {error: `Element ${id} is hidden`};
            if (el.disabled || el.getAttribute('aria-disabled') === 'true') return {error: `Element ${id} is disabled`};
            if (operation === 'click') el.click();
            else if (operation === 'fill') {
                if (!('value' in el) || el.readOnly) return {error: `Element ${id} is not editable`};
                el.value = String(data);
                el.dispatchEvent(new Event('input', {bubbles: true}));
                el.dispatchEvent(new Event('change', {bubbles: true}));
            } else if (operation === 'select') {
                if (el.tagName !== 'SELECT') return {error: `Element ${id} is not a native select`};
                const values = Array.isArray(data) ? data.map(String) : [String(data)];
                for (const value of values) if (!Array.from(el.options).some(option => option.value === value))
                    return {error: `Select option not found on ${id}`};
                for (const option of el.options) option.selected = values.includes(option.value);
                el.dispatchEvent(new Event('input', {bubbles: true}));
                el.dispatchEvent(new Event('change', {bubbles: true}));
            } else if (operation === 'check') {
                if (el.type !== 'checkbox' && el.type !== 'radio') return {error: `Element ${id} is not checkable`};
                if (el.checked !== Boolean(data)) el.click();
                if (el.checked !== Boolean(data)) return {error: `Could not change checked state of ${id}`};
            }
            return {ok: true};
        }""", {"id": element_id, "operation": operation, "data": data})

    def _wait(self, action, predicate):
        deadline = time.monotonic() + int(action.get("timeout_ms", self.timeout)) / 1000
        last = {}
        while True:
            last = self._evaluate(self._target(action), "read")
            if last.get("count", 1) > 1:
                raise AssertionError(last["error"])
            if predicate(last):
                return last
            if time.monotonic() >= deadline:
                raise AssertionError("Browser assertion timed out at " + action["selector"] + ": " + last.get("error", "condition not met"))
            time.sleep(0.1)

    def run_step(self, step):
        self._start()
        completed = []
        for action in step.get("actions", []):
            name = action.get("action")
            if name == "goto":
                target = urljoin(self.frontend_url, action.get("path", "/"))
                if _origin(target) != _origin(self.frontend_url):
                    raise ValueError("Browser goto must stay on the configured frontend origin")
                response = self._page.goto(target, wait_until="domcontentloaded", timeout=int(action.get("timeout_ms", self.timeout)))
                if response and response.status >= 400:
                    raise AssertionError("Page returned HTTP " + str(response.status))
            elif name in {"click", "fill", "select", "check"}:
                self._wait(action, lambda result: not result.get("error"))
                data = action.get("checked", True) if name == "check" else action.get("value", "")
                result = self._evaluate(self._target(action), name, data)
                if result.get("error"):
                    raise AssertionError(result["error"])
            elif name == "assert_text":
                expected = str(action.get("text", ""))
                self._wait(action, lambda result: not result.get("error") and
                           (result.get("text") == expected if action.get("exact", False) else expected in result.get("text", "")))
            elif name == "assert_value":
                self._wait(action, lambda result: not result.get("error") and str(result.get("value", "")) == str(action.get("value", "")))
            elif name == "assert_visible":
                self._wait(action, lambda result: not result.get("error") and result.get("visible", False))
            elif name == "wait_for":
                state = action.get("state", "attached")
                if state not in {"attached", "detached", "visible", "hidden"}:
                    raise ValueError("wait_for state must be attached, detached, visible or hidden")
                self._wait(action, lambda result: (
                    (not result.get("error")) if state == "attached" else
                    result.get("count") == 0 if state == "detached" else
                    (not result.get("error") and result.get("visible")) if state == "visible" else
                    (result.get("count") == 0 or not result.get("visible"))))
            else:
                raise ValueError("Unsupported browser action: " + str(name))
            completed.append({key: value for key, value in action.items()
                              if key in {"action", "selector", "path", "text", "value", "checked", "state", "exact"}})
        return {"actions": completed, "engine": "lightpanda-cdp", "visibility": "DOM semantics; no visual layout validation"}

    def close(self):
        # Close only the context created by this run; Playwright.stop disconnects
        # from CDP without terminating the shared Lightpanda server.
        try:
            if self._context is not None:
                self._context.close()
        finally:
            self._context = self._page = self._browser = None
            if self._playwright is not None:
                self._playwright.stop()
                self._playwright = None
