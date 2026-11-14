"""Real bundled-obscura integration: auto-start, actions, owned-process cleanup."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import socket
import sys
import threading
import time
import unittest

SKILL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_DIR / "scripts"))
from browser import BrowserSession
from browser_mcp import _obscura_binary, _reachable

HTML = b"""<!doctype html><html><body>
<input id="name"><input id="order.1:search">
<select id="status"><option value="draft">Draft</option><option value="ready">Ready</option></select>
<input id="agree" type="checkbox"><button id="submit" disabled>Save</button>
<div id="list" style="height:80px;overflow:auto"><div style="height:400px"></div></div>
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


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class BundledObscuraSmoke(unittest.TestCase):
    @unittest.skipUnless(_obscura_binary({}), "No obscura binary in SKILL_DIR/bin/obscura or WEBTEST_OBSCURA_BIN")
    def test_auto_start_actions_and_owned_process_cleanup(self):
        port = free_port()
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        session = BrowserSession(f"http://127.0.0.1:{server.server_port}",
            config={"mcp_url": f"http://127.0.0.1:{port}/mcp", "timeout_ms": 10000,
                    "storage": {"localStorage": {"app-token": "bundled-seed"}}},
            auth={"mode": "none"})
        try:
            result = session.run_step({"actions": [
                {"action": "goto", "path": "/"},
                {"action": "fill", "selector": "#name", "value": "webtest-live"},
                {"action": "assert_value", "selector": "#name", "value": "webtest-live"},
                {"action": "fill", "selector": "#order.1:search", "value": "literal-id"},
                {"action": "select", "selector": "#status", "value": "ready"},
                {"action": "assert_value", "selector": "#status", "value": "ready"},
                {"action": "check", "selector": "#agree"},
                {"action": "assert_checked", "selector": "#agree"},
                {"action": "press", "selector": "#name", "key": "Enter"},
                {"action": "assert_text", "selector": "#key-result", "text": "pressed", "exact": True},
                {"action": "scroll", "selector": "#list", "y": 60},
                {"action": "click", "selector": "#submit"},
            ]})
            self.assertEqual(result["engine"], "obscura-mcp")
            self.assertIsNotNone(session._process)  # Owned bundled process, not an external server.
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
        self.assertIsNone(session._process)
        deadline = time.monotonic() + 5
        while _reachable("127.0.0.1", port) and time.monotonic() < deadline:
            time.sleep(0.2)
        self.assertFalse(_reachable("127.0.0.1", port), "spawned obscura still listens after close")


if __name__ == "__main__":
    unittest.main()
