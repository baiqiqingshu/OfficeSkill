"""Local HTTP protocol/control-flow fixtures, not real Lightpanda compatibility tests."""
import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from browser import BrowserSession, PlaywrightBrowserSession, validate_config
from browser_mcp import NativeBrowserSession
from mcp_client import McpClient, McpToolError, McpTransportError
from project import export_suite


def content(value, **extra):
    return {"content": [{"type": "text", "text": value}], "isError": False, **extra}


class Fixture:
    def __init__(self):
        self.requests, self.closed, self.sessions = [], [], {}
        self.sse, self.isolated, self.wrong_id = False, True, False
        self.fail_tool, self.delay_tool, self.missing = None, None, set()
        self.delay_seconds, self.empty_result = 0.15, False
        self.navigation = content("Navigated successfully. HTTP 200. Page title: Timeout settings")
        self.scroll_selector, self.scroll_moves = False, True
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                owner.requests.append(("http", self.path, dict(self.headers)))
                self.reply({"data": {"id": "order.1:search", "status": "READY"}})

            def do_POST(self):
                if self.path != "/mcp":
                    self.send_response(404)
                    self.end_headers()
                    return
                req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                sid = self.headers.get("Mcp-Session-Id")
                owner.requests.append((req, sid, dict(self.headers)))
                if req["method"] == "initialize":
                    sid = "session-" + str(len(owner.sessions) + 1) if owner.isolated else "default"
                    owner.sessions[sid] = {"url": "about:blank", "values": {}, "checked": False,
                                           "ready": False, "x": 10, "y": 20}
                    result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                              "serverInfo": {"name": "fixture", "version": "1"}}
                elif req["method"] == "notifications/initialized":
                    self.send_response(202)
                    self.end_headers()
                    return
                elif req["method"] == "tools/list":
                    names = {"goto", "evaluate", "waitForScript", "click", "fill", "selectOption",
                             "setChecked", "press", "scroll", "session_close", "waitForSelector"} - owner.missing
                    result = {"tools": [{"name": name, "inputSchema": {"type": "object", "properties":
                        {"selector": {"type": "string"}} if name == "scroll" and owner.scroll_selector else {}}}
                        for name in sorted(names)]}
                else:
                    name, args = req["params"]["name"], req["params"]["arguments"]
                    if name == owner.delay_tool:
                        time.sleep(owner.delay_seconds)
                    if name == owner.fail_tool:
                        result = {"isError": True, "content": [{"type": "text", "text": "private-echoed-secret"}]}
                    else:
                        result = owner.call(sid, name, args)
                    if owner.empty_result:
                        result = {}
                message = {"jsonrpc": "2.0", "id": req["id"] + (1 if owner.wrong_id else 0), "result": result}
                self.reply(message, sid if req["method"] == "initialize" else None, owner.sse)

            def reply(self, message, sid=None, sse=False):
                body = json.dumps(message).encode()
                if sse:
                    # Include an unrelated event to check that matching uses the request ID.
                    body = b': heartbeat\n\ndata: {"jsonrpc":"2.0","method":"notice"}\n\n' + b'data: ' + body + b'\n\n'
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream" if sse else "application/json")
                self.send_header("Content-Length", str(len(body)))
                if sid:
                    self.send_header("Mcp-Session-Id", sid)
                self.end_headers()
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def call(self, sid, name, args):
        state = self.sessions[sid]
        if name == "session_close":
            assert args["id"] == sid and sid != "default"
            self.closed.append(sid)
        elif name == "goto":
            state["url"] = args["url"]
            return self.navigation
        elif name == "evaluate":
            script = args["script"]
            assert script.startswith("({value: (") and script.endswith(")})")
            expression = script[len("({value: ("):-3]
            match = re.search(r'\((\{"id":.*\})\)$', expression, re.S)
            if match:
                p = json.loads(match[1])
                op, node, data = p["operation"], p["id"], p["data"]
                value = {"count": 1, "tag": "input", "visible": True, "enabled": True, "ok": True}
                if node == "dup":
                    value = {"error": "duplicate ID", "count": 2, "retryable": False}
                elif node == "missing":
                    value = {"error": "missing ID", "count": 0, "retryable": True}
                elif op == "snapshot":
                    value = {"nodes": [{"id": "submit", "tag": "button"}], "truncated": False}
                elif node == "submit" and not state["ready"]:
                    value = {"error": "disabled", "count": 1, "retryable": True}
                elif op == "scroll_state":
                    value.update(x=state["x"], y=state["y"])
                elif op == "check":
                    value["checked"] = state["checked"]
                elif op == "read":
                    value.update(checkable=True, checked=state["checked"])
                    if data["assertion"] == "assert_value":
                        value["matches"] = state["values"].get(node) == data["value"]
                    elif data["assertion"] == "assert_text":
                        value["matches"] = state.get("result") == data["text"]
            elif expression == "location.href":
                value = state["url"]
            elif expression.startswith("location.href === "):
                value = state["url"] == json.loads(expression[len("location.href === "):])
            else:  # Storage preparation, checked separately in the tests.
                assert "setItem" in expression
                state["storage_seeded"] = True
                value = True
            return content(json.dumps({"value": value}))
        elif name == "waitForScript":
            state["ready"] = True
        elif name in {"fill", "selectOption"}:
            node = re.fullmatch(r'\[id="(.*)"\]', args["selector"])[1]
            state["values"][node] = args["value"]
        elif name == "setChecked":
            state["checked"] = args["checked"]
        elif name == "click":
            state["result"] = "SAVED"
        elif name == "waitForSelector":
            return content("Element found. backendNodeId: 42")
        elif name == "scroll" and self.scroll_moves:
            state.update(x=args["x"], y=args["y"])
        return content("private-echoed-secret")

    def calls(self, name):
        return [req[0]["params"]["arguments"] for req in self.requests
                if isinstance(req[0], dict) and req[0]["method"] == "tools/call" and req[0]["params"]["name"] == name]

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


class NativeTests(unittest.TestCase):
    def setUp(self):
        self.fixture = Fixture()
        self.addCleanup(self.fixture.close)

    def session(self, **config):
        session = BrowserSession(self.fixture.url, {"mcp_url": self.fixture.url + "/mcp", "timeout_ms": 1000, **config})
        self.addCleanup(session.close)
        return session

    def test_default_is_native_without_importing_playwright(self):
        with patch.dict(sys.modules, {"playwright": None, "playwright.async_api": None}):
            session = self.session()
            self.assertIsInstance(session, NativeBrowserSession)
            result = session.run_step({"actions": [{"action": "goto", "path": "/"}]})
            self.assertEqual(result["engine"], "lightpanda-mcp")
        self.assertIsInstance(BrowserSession(self.fixture.url, {"backend": "playwright"}), PlaywrightBrowserSession)
        for config in [{"cdp_url": "ws://localhost:9222"}, {"backend": []}, {"backend": "playwright", "mcp_url": "http://localhost/mcp"}]:
            with self.subTest(config=config), self.assertRaises(ValueError):
                validate_config(config)

    def test_json_and_sse_keep_isolated_sessions_headers_and_cleanup(self):
        for sse in (False, True):
            self.fixture.sse = sse
            async def check():
                first, second = McpClient(self.fixture.url + "/mcp", "WEBTEST_MCP_TEST_TOKEN"), McpClient(self.fixture.url + "/mcp")
                await first.connect(1)
                await second.connect(1)
                self.assertNotEqual(first.session_id, second.session_id)
                await first.tool("press", {"key": "Enter"}, 1)
                await first.close()
                self.assertNotIn(second.session_id, self.fixture.closed)
                await second.close()
            with patch.dict("os.environ", {"WEBTEST_MCP_TEST_TOKEN": "service-secret"}):
                asyncio.run(check())
        calls = [r for r in self.fixture.requests if isinstance(r[0], dict) and r[0]["method"] == "tools/list"]
        self.assertTrue(all(r[1] != "default" and r[2]["MCP-Protocol-Version"] == "2024-11-05" for r in calls))
        self.assertEqual(calls[0][2]["Authorization"], "Bearer service-secret")

    def test_shared_default_session_is_rejected_before_page_actions(self):
        self.fixture.isolated = False
        with self.assertRaisesRegex(McpTransportError, "isolated session"):
            self.session().run_step({"actions": [{"action": "goto", "path": "/"}]})
        self.assertEqual(self.fixture.calls("goto"), [])
        self.assertEqual(self.fixture.closed, [])

    def test_mismatched_response_does_not_retry(self):
        self.fixture.wrong_id = True
        with self.assertRaises(McpTransportError):
            self.session().run_step({"actions": [{"action": "goto", "path": "/"}]})
        self.assertEqual(len(self.fixture.requests), 1)

    def test_wrong_endpoint_preserves_http_status_guidance(self):
        with self.assertRaisesRegex(McpTransportError, "HTTP 404"):
            self.session(mcp_url=self.fixture.url + "/json/version").run_step(
                {"actions": [{"action": "goto", "path": "/"}]})

    def test_malformed_tool_response_cannot_pass_a_business_action(self):
        session = self.session()
        session.run_step({"actions": [{"action": "goto", "path": "/"}]})
        self.fixture.empty_result = True
        with self.assertRaisesRegex(McpTransportError, "no content array"):
            session.run_step({"actions": [{"action": "fill", "selector": "#name", "value": "x"}]})
        self.assertEqual(self.fixture.calls("fill"), [])

    def test_waits_in_service_then_dispatches_once_and_omits_echoed_values(self):
        session = self.session()
        session.run_step({"actions": [
            {"action": "goto", "path": "/"},
            {"action": "fill", "selector": "#order.1:search", "value": "private-input"},
            {"action": "assert_value", "selector": "#order.1:search", "value": "private-input"},
            {"action": "select", "selector": "#status", "value": "READY"},
            {"action": "check", "selector": "#agree"},
            {"action": "check", "selector": "#agree"},
            {"action": "assert_checked", "selector": "#agree"},
            {"action": "press", "selector": "#order.1:search", "key": "Enter"},
            {"action": "click", "selector": "#submit"},
            {"action": "assert_text", "selector": "#result", "text": "SAVED"},
            {"action": "assert_url", "path": "/"},
        ]})
        self.assertEqual(self.fixture.calls("fill")[0]["selector"], '[id="order.1:search"]')
        self.assertEqual(len(self.fixture.calls("click")), 1)
        self.assertEqual(len(self.fixture.calls("waitForScript")), 1)
        self.assertEqual(len(self.fixture.calls("setChecked")), 1)
        self.assertNotIn("private-", json.dumps(session.last_evidence))

    def test_duplicate_id_and_missing_capability_prevent_mutation(self):
        session = self.session()
        with self.assertRaisesRegex(AssertionError, "duplicate"):
            session.run_step({"actions": [{"action": "click", "selector": "#dup"}]})
        self.assertEqual(self.fixture.calls("click"), [])

        self.fixture.missing.add("fill")
        other = self.session()
        with self.assertRaisesRegex(McpTransportError, "required by this batch"):
            other.run_step({"actions": [{"action": "click", "selector": "#submit"},
                                        {"action": "fill", "selector": "#name", "value": "x"}]})
        self.assertEqual(self.fixture.calls("click"), [])

    def test_snapshot_cannot_pass_with_a_missing_or_duplicate_root(self):
        for node in ("dup", "missing"):
            with self.subTest(node=node), self.assertRaises(AssertionError):
                self.session().run_step({"actions": [{"action": "snapshot", "selector": "#" + node}]})

    def test_tool_error_is_compact_and_later_actions_are_skipped(self):
        self.fixture.fail_tool = "fill"
        session = self.session()
        with self.assertRaises(McpToolError) as error:
            session.run_step({"actions": [{"action": "fill", "selector": "#name", "value": "private-input"},
                                        {"action": "click", "selector": "#submit"}]})
        self.assertNotIn("private-", str(error.exception) + json.dumps(session.last_evidence))
        self.assertEqual(len(self.fixture.calls("fill")), 1)
        self.assertEqual(self.fixture.calls("click"), [])

    def test_timed_out_mutation_is_not_replayed_or_followed_by_other_actions(self):
        self.fixture.delay_tool = "fill"
        self.fixture.delay_seconds = 2
        session = self.session()
        session.run_step({"actions": [{"action": "goto", "path": "/"}]})
        with self.assertRaises((McpTransportError, AssertionError)):
            session.run_step({"actions": [{"action": "fill", "selector": "#name", "value": "x", "timeout_ms": 1000}]})
        with self.assertRaisesRegex(McpTransportError, "uncertain"):
            session.run_step({"actions": [{"action": "click", "selector": "#submit"}]})
        self.assertEqual(len(self.fixture.calls("fill")), 1)
        self.assertEqual(self.fixture.calls("click"), [])

    def test_navigation_checks_status_and_timeout_even_when_iserror_is_false(self):
        for result in [content("Navigated successfully. HTTP 404 Not Found."),
                       content("Navigation started (HTTP 200 OK) but the page did not finish loading before the timeout."),
                       content("Navigated"), content("error page", structuredContent={"httpStatus": 500})]:
            self.fixture.navigation = result
            with self.subTest(result=result), self.assertRaises((AssertionError, McpTransportError)):
                self.session().run_step({"actions": [{"action": "goto", "path": "/"}]})

    def test_storage_seed_precedes_target_navigation_only_once(self):
        session = self.session(storage={"localStorage": {"app-token": "${token}"}})
        session.run_step({"actions": [{"action": "goto", "path": "/orders"}]})
        session.run_step({"actions": [{"action": "goto", "path": "/other"}]})
        self.assertEqual([a["url"] for a in self.fixture.calls("goto")],
                         [self.fixture.url + p for p in ("/", "/orders", "/other")])
        self.assertTrue(next(iter(self.fixture.sessions.values()))["storage_seeded"])

    def test_scroll_converts_deltas_and_rejects_no_movement(self):
        for selector_support in (False, True):
            self.fixture.scroll_selector = selector_support
            result = self.session().run_step({"actions": [{"action": "scroll", "selector": "#list", "y": 100}]})
            args = self.fixture.calls("scroll")[-1]
            self.assertEqual((args["x"], args["y"]), (10, 120))
            self.assertEqual("selector" in args, selector_support)
            self.assertEqual(result["actions"][0]["result"]["after"]["y"], 120)
        self.fixture.scroll_moves = False
        with self.assertRaisesRegex(AssertionError, "did not move"):
            self.session().run_step({"actions": [{"action": "scroll", "y": 100}]})

    def test_exported_http_browser_sql_suite_runs_without_playwright_and_reuses_session(self):
        suite = {"version": 1, "auth": {"mode": "none"}, "browser": {"mcp_url": self.fixture.url + "/mcp"},
            "databases": {"main": {"url_env": "WEBTEST_MCP_DB"}}, "cases": [{"id": "mixed", "steps": [
                {"type": "http", "path": "/ready", "capture": {"node": "$.data.id"},
                 "expect": {"json": {"$.data.status": "READY"}}},
                {"type": "browser", "actions": [{"action": "goto", "path": "/"},
                    {"action": "fill", "selector": "#${node}", "value": "kept-across-steps"}]},
                {"type": "sql", "sql": "SELECT 42 AS answer", "expect": {"scalar": 42}},
                {"type": "browser", "actions": [{"action": "assert_value", "selector": "#${node}", "value": "kept-across-steps"}]}
            ]}]}
        with tempfile.TemporaryDirectory() as temp, patch.dict("os.environ", {"WEBTEST_MCP_DB": "sqlite:///:memory:"}):
            source = Path(temp) / "suite.json"
            source.write_text(json.dumps(suite), encoding="utf-8")
            bundle = export_suite(source, Path(temp) / "bundle")
            process = subprocess.run([sys.executable, "-S", "run.py", "--frontend-url", self.fixture.url],
                                     cwd=bundle, capture_output=True, text=True, timeout=20)
            self.assertEqual(process.returncode, 0, process.stdout + process.stderr)
            self.assertEqual(json.loads(process.stdout)["status"], "pass")
        self.assertEqual(len(self.fixture.sessions), 1)
        self.assertEqual(self.fixture.closed, ["session-1"])


if __name__ == "__main__":
    unittest.main()
