"""Standalone runner result contract; these fixtures do not execute Lightpanda."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from pandascript import run_script


class PandaScriptTests(unittest.TestCase):
    def run_result(self, stdout, returncode=0, side_effect=None):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / "case.js", Path(temp) / "report.json"
            source.write_text("return {status: 'pass'};", encoding="utf-8")
            with patch("pandascript.subprocess.run", return_value=subprocess.CompletedProcess([], returncode, stdout, "private-stderr"),
                       side_effect=side_effect) as process:
                result = run_script(source, output=output)
                process.assert_called_once()
                self.assertEqual(process.call_args.args[0], ["lightpanda", "run", str(source)])
                self.assertEqual(json.loads(output.read_text(encoding="utf-8")), result)
            return result

    def test_explicit_pass_and_fail_and_redaction(self):
        with patch.dict("os.environ", {"LP_TOKEN": "private-token"}):
            result = self.run_result('{"status":"pass","token":"private-token","note":"private-token"}')
        self.assertEqual(result["status"], "pass")
        self.assertNotIn("private-", json.dumps(result))
        self.assertEqual(self.run_result('{"status":"fail"}')["status"], "fail")

    def test_zero_exit_does_not_replace_business_assertion(self):
        for text in ['', '{}', '{"status":"ok"}', 'debug output\n{"status":"pass"}']:
            with self.subTest(text=text):
                self.assertEqual(self.run_result(text)["status"], "error")

    def test_nonzero_timeout_and_missing_binary_never_publish_raw_output(self):
        results = [self.run_result("private-stdout", returncode=1),
                   self.run_result("", side_effect=subprocess.TimeoutExpired("lightpanda", 1, output="private-partial")),
                   self.run_result("", side_effect=FileNotFoundError("private-path"))]
        for result in results:
            self.assertEqual(result["status"], "error")
            self.assertNotIn("private-", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
