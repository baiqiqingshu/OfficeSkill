"""Opt-in real MCP/CDP smoke tests. No alternative browser is launched."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import sys
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from browser import BrowserSession

CDP = os.getenv("WEBTEST_LIGHTPANDA_CDP", "")
MCP = os.getenv("WEBTEST_LIGHTPANDA_MCP", "")
HTML = b"""<!doctype html><html><body>
<input id="name"><input id="order.1:search">
<select id="status"><option value="draft">Draft</option><option value="ready">Ready</option></select>
<input id="agree" type="checkbox"><button id="submit" disabled>Save</button>
<span id="saving" hidden>Saving</span><span id="result"></span><span id="key-result"></span>
<script>
const button = document.getElementById('submit');
const nameInput = document.getElementById('name');
let clicks = 0;
nameInput.addEventListener('keyup', event => {
  if (event.key === 'Enter') document.getElementById('key-result').textContent = 'pressed';
});
setTimeout(() => button.disabled = false, 50);
button.addEventListener('click', () => {
  clicks++; button.disabled = true; document.getElementById('saving').hidden = false;
  setTimeout(() => {
    document.getElementById('result').textContent = nameInput.value + ':' + clicks;
    document.getElementById('saving').hidden = true; button.disabled = false;
  }, 30);
});
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(HTML)))
        self.end_headers()
        self.wfile.write(HTML)

    def log_message(self, *args):
        pass


class LightpandaSmoke(unittest.TestCase):
    @unittest.skipUnless(CDP, "Set WEBTEST_LIGHTPANDA_CDP to run against a real Lightpanda CDP server")
    def test_form_events_state_and_page_reuse(self):
        self.smoke({"backend": "playwright", "cdp_url": CDP})

    @unittest.skipUnless(MCP, "Set WEBTEST_LIGHTPANDA_MCP to run against a real Lightpanda MCP server")
    def test_native_form_events_state_and_page_reuse(self):
        self.smoke({"backend": "lightpanda", "mcp_url": MCP})

    def smoke(self, config):
        host = os.getenv("WEBTEST_LIGHTPANDA_HOST", "127.0.0.1")
        server = ThreadingHTTPServer(("127.0.0.1" if host == "127.0.0.1" else "0.0.0.0", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        session = BrowserSession(f"http://{host}:{server.server_port}",
            config={**config, "timeout_ms": 5000}, auth={"mode": "none"})
        try:
            session.run_step({"actions": [
                {"action": "goto", "path": "/"},
                {"action": "fill", "selector": "#name", "value": "webtest-live"},
                {"action": "assert_value", "selector": "#name", "value": "webtest-live"},
                {"action": "fill", "selector": "#order.1:search", "value": "literal-id"},
                {"action": "select", "selector": "#status", "value": "ready"},
                {"action": "assert_value", "selector": "#status", "value": "ready"},
                {"action": "check", "selector": "#agree", "checked": True},
                {"action": "assert_checked", "selector": "#agree", "checked": True},
                {"action": "press", "selector": "#name", "key": "Enter"},
                {"action": "assert_text", "selector": "#key-result", "text": "pressed", "exact": True},
                {"action": "click", "selector": "#submit"},
            ]})
            result = session.run_step({"actions": [
                {"action": "wait_for", "selector": "#saving", "state": "hidden"},
                {"action": "assert_text", "selector": "#result", "text": "webtest-live:1", "exact": True},
                {"action": "snapshot", "max_nodes": 3},
                {"action": "assert_url", "path": "/"},
            ]})
            self.assertEqual(len(result["actions"][2]["result"]["nodes"]), 3)
        finally:
            try:
                session.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
