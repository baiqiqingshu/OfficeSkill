"""Adapter control-flow tests; fake CDP responses do not prove Lightpanda support."""
import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
from browser import PlaywrightBrowserSession as BrowserSession, validate_action, validate_config
from project import export_suite
from runtime import SuiteError, run_suite


class Page:
    def __init__(self, results=None):
        self.results = results or {}
        self.calls = []

    async def evaluate(self, script, payload=None):
        operation = payload["operation"] if payload else "url"
        self.calls.append(operation)
        values = self.results.get(operation, [])
        result = values.pop(0) if values else ({"nodes": []} if operation == "snapshot" else {"ok": True})
        if isinstance(result, Exception):
            raise result
        if callable(result):
            return await result()
        return result


class AdapterTests(unittest.TestCase):
    def session(self, results=None, **config):
        session = BrowserSession("http://127.0.0.1:5173", config={"timeout_ms": 100, "poll_interval_ms": 20, **config})
        session._page = Page(results)
        self.addCleanup(session.close)
        return session

    def test_waits_for_enabled_then_dispatches_and_records_once(self):
        session = self.session({"click": [{"error": "disabled", "retryable": True}, {"ok": True}]})
        result = session.run_step({"actions": [{"action": "click", "selector": "#submit"}]})
        self.assertEqual(session._page.calls, ["click", "click"])
        self.assertEqual(len(result["actions"]), 1)

    def test_duplicate_id_fails_immediately_and_skips_later_actions(self):
        session = self.session({"click": [{"error": "duplicate", "count": 2}]})
        with self.assertRaisesRegex(AssertionError, "duplicate"):
            session.run_step({"actions": [{"action": "click", "selector": "#submit"}, {"action": "click", "selector": "#later"}]})
        self.assertEqual(session._page.calls, ["click", "snapshot"])
        self.assertEqual(session.last_evidence["failed_action"]["index"], 1)

    def test_transport_error_does_not_replay_click(self):
        session = self.session({"click": [RuntimeError("Execution context was destroyed")]})
        with self.assertRaises(RuntimeError):
            session.run_step({"actions": [{"action": "click", "selector": "#submit"}]})
        self.assertEqual(session._page.calls.count("click"), 1)

    def test_hung_command_is_cancelled_and_not_replayed(self):
        cancelled = []
        async def hang():
            try:
                await asyncio.sleep(60)
            finally:
                cancelled.append(True)
        session = self.session({"click": [hang]}, timeout_ms=30)
        with self.assertRaisesRegex(AssertionError, "timed out"):
            session.run_step({"actions": [{"action": "click", "selector": "#submit"}]})
        self.assertEqual(session._page.calls.count("click"), 1)
        self.assertEqual(cancelled, [True])

    def test_step_budget_stops_batch_without_replay(self):
        async def hang():
            await asyncio.sleep(60)
        session = self.session({"click": [hang]}, step_timeout_ms=30)
        with self.assertRaisesRegex(AssertionError, "budget exhausted"):
            session.run_step({"actions": [{"action": "click", "selector": "#submit"}]})
        self.assertEqual(session._page.calls.count("click"), 1)

    def test_assertion_read_recovers_after_navigation(self):
        session = self.session({"read": [RuntimeError("Execution context was destroyed"), {"matches": True}]})
        result = session.run_step({"actions": [{"action": "assert_text", "selector": "#result", "text": "Saved"}]})
        self.assertEqual(len(result["actions"]), 1)

    def test_hidden_wait_accepts_missing_element(self):
        session = self.session({"read": [{"error": "missing", "count": 0, "retryable": True}]})
        session.run_step({"actions": [{"action": "wait_for", "selector": "#loading", "state": "hidden"}]})
        self.assertEqual(session._page.calls, ["read"])

    def test_assertion_timeout_does_not_capture_values_or_expected_text(self):
        session = self.session({"read": [{"text": "private-page-content", "value": "private-input"}]}, timeout_ms=30)
        with self.assertRaises(AssertionError):
            session.run_step({"actions": [{"action": "assert_text", "selector": "#result", "text": "private-expectation"}]})
        evidence = json.dumps(session.last_evidence)
        self.assertNotIn("private-", evidence)

    def test_invalid_late_action_rejected_before_first_dispatch(self):
        session = self.session()
        with self.assertRaises(ValueError):
            session.run_step({"actions": [{"action": "click", "selector": "#submit"}, {"action": "fill", "selector": "#input"}]})
        self.assertEqual(session._page.calls, [])

    def test_partial_connection_is_cleaned_before_next_attempt(self):
        closed = []
        class Context:
            async def close(self):
                closed.append("context")
        class Client:
            async def stop(self):
                closed.append("client")
        class PartialSession(BrowserSession):
            async def _connect(self):
                self._context, self._playwright = Context(), Client()
                raise RuntimeError("CDP page creation failed")
        session = PartialSession("http://127.0.0.1:5173")
        self.addCleanup(session.close)
        with self.assertRaises(RuntimeError):
            session.run_step({"actions": [{"action": "click", "selector": "#submit"}]})
        self.assertEqual(closed, ["context", "client"])
        self.assertIsNone(session._context)
        self.assertIsNone(session._playwright)

    def test_long_batch_reuses_page_across_steps(self):
        session = self.session(step_timeout_ms=1000)
        page = session._page
        for _ in range(3):
            result = session.run_step({"actions": [{"action": "fill", "selector": "#input", "value": "private-input"}] * 80})
            self.assertEqual(len(result["actions"]), 80)
            self.assertNotIn("private-input", json.dumps(result))
            self.assertIs(session._page, page)
        self.assertEqual(len(page.calls), 240)

    def test_cross_origin_url_rejected(self):
        session = self.session()
        with self.assertRaises(ValueError):
            session._url("https://other.example/")

    def test_checked_assertion_rejects_non_checkable_element(self):
        with self.assertRaises(AssertionError):
            BrowserSession._condition({"action": "assert_checked", "checked": False}, {"checked": False})


class SuiteTests(unittest.TestCase):
    def suite(self):
        return {"version": 1, "auth": {"mode": "none"}, "cases": [{"id": "ui", "steps": [
            {"type": "browser", "actions": [{"action": "click", "selector": "#submit"}]}]}]}

    def test_validation_rejects_bad_parameters_and_typos(self):
        for action in [
            {"action": "check", "selector": "#x", "checked": "false"},
            {"action": "snapshot", "max_nodes": 1000},
            {"action": "scroll", "y": 0},
            {"action": "click", "selector": ".any"},
            {"action": "assert_text", "selector": "#x", "text": "hi", "excat": True},
            {"action": "press", "selector": "#x", "key": "Control+a"},
        ]:
            with self.subTest(action=action), self.assertRaises(ValueError):
                validate_action(action)

    def test_variable_selector_validates_then_runtime_rechecks(self):
        validate_action({"action": "click", "selector": "#order-${order_id}"}, allow_variables=True)
        with self.assertRaises(ValueError):
            validate_action({"action": "click", "selector": "#order-1 .other"})

    def test_config_validation_and_variable_endpoint(self):
        for config in [{"poll_interval_ms": 0}, {"step_timeout_ms": -1}, {"cdp_url": []},
                       {"cdp_url": "ws://localhost:bad"}, {"timeot_ms": 1}]:
            with self.subTest(config=config), self.assertRaises(ValueError):
                validate_config(config)
        validate_config({"backend": "playwright", "cdp_url": "${cdp_url}"}, allow_variables=True)
        validate_config({"backend": "playwright", "cdp_url": "ws://${host}:${port}"}, allow_variables=True)

    def test_suite_validation_happens_before_setup_requests(self):
        suite = self.suite()
        suite["setup"] = [{"type": "http", "method": "POST", "path": "/create"}]
        suite["cases"][0]["steps"][0]["actions"].append({"action": "fill", "selector": "#x"})
        with tempfile.TemporaryDirectory() as temp, patch("runtime.http_step") as http:
            source = Path(temp) / "suite.json"
            source.write_text(json.dumps(suite), encoding="utf-8")
            with self.assertRaises(SuiteError):
                run_suite(source, "http://127.0.0.1:5173")
            http.assert_not_called()

    def test_failed_action_evidence_is_in_report_and_teardown_runs(self):
        suite = self.suite()
        suite["teardown"] = [{"type": "http", "method": "DELETE", "path": "/cleanup"}]
        class FailedSession(BrowserSession):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self._page = Page({"click": [RuntimeError("CDP disconnected")]})
        with tempfile.TemporaryDirectory() as temp, patch("browser.BrowserSession", FailedSession), patch("runtime.http_step", return_value={"cleanup": True}) as http:
            source = Path(temp) / "suite.json"
            source.write_text(json.dumps(suite), encoding="utf-8")
            result = run_suite(source, "http://127.0.0.1:5173")
            evidence = result["cases"][0]["steps"][0]["evidence"]
            self.assertEqual(evidence["failed_action"]["index"], 1)
            self.assertEqual(evidence["snapshot"], {"nodes": []})
            self.assertEqual(result["teardown"]["status"], "pass")
            http.assert_called_once()

    def test_export_contains_dom_helper_and_validates_without_playwright(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "suite.json"
            source.write_text(json.dumps(self.suite()), encoding="utf-8")
            bundle = export_suite(source, Path(temp) / "bundle")
            self.assertTrue((bundle / "browser_dom.js").is_file())
            result = subprocess.run([sys.executable, "webtest.py", "validate", "--suite", "suite.json"], cwd=bundle, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["status"], "valid")

    def test_exported_http_suite_runs_against_real_http_without_browser(self):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                body = b'{"data":{"status":"READY"}}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as temp:
                suite = {"version": 1, "auth": {"mode": "none"}, "cases": [{"id": "api", "steps": [
                    {"type": "http", "path": "/ready", "expect": {"json": {"$.data.status": "READY"}}}]}]}
                source = Path(temp) / "suite.json"
                source.write_text(json.dumps(suite), encoding="utf-8")
                bundle = export_suite(source, Path(temp) / "bundle")
                result = subprocess.run([sys.executable, "run.py", "--frontend-url", f"http://127.0.0.1:{server.server_port}"],
                    cwd=bundle, capture_output=True, text=True, timeout=20)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout)["status"], "pass")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
