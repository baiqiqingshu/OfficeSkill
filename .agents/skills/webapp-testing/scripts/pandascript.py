"""Optional standalone native front-end batches; mixed suites keep MCP sessions."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import time


def run_script(script, executable="lightpanda", timeout=120, output=None):
    source = Path(script).resolve()
    if source.suffix.lower() != ".js" or not source.is_file():
        raise ValueError("PandaScript must be an existing .js file")
    if not 1 <= timeout <= 600:
        raise ValueError("PandaScript timeout must be in [1, 600] seconds")
    from runtime import Redactor
    redactor = Redactor({}, "")
    report = {"engine": "lightpanda-pandascript", "script": str(source), "status": "error"}
    tick = time.monotonic()
    try:
        process = subprocess.run([executable, "run", str(source)], capture_output=True,
            encoding="utf-8", errors="replace", timeout=timeout)
        report["exit_code"] = process.returncode
        if process.returncode:
            report["error"] = "PandaScript process failed; the batch was not replayed"
        else:
            # Require an explicit final JSON object. CLI success alone is not
            # proof that a business assertion passed; logs must go to stderr.
            try:
                result = json.loads(process.stdout)
            except json.JSONDecodeError:
                result = None
            if not isinstance(result, dict) or result.get("status") not in {"pass", "fail"}:
                report["error"] = "Script must return one JSON object with explicit status: pass or fail"
            else:
                redactor.observe(result)
                report["status"], report["result"] = result["status"], result
    except subprocess.TimeoutExpired:
        report["error"] = "PandaScript process timed out and was stopped; actions were not replayed"
    except OSError:
        report["error"] = "Lightpanda executable could not be started; verify --executable and its runtime"
    report["duration_seconds"] = round(time.monotonic() - tick, 3)
    report = redactor.clean(report)
    if output:
        target = Path(output).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        report["report_json"] = str(target)
        target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report
