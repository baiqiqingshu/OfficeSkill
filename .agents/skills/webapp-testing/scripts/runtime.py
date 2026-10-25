"""Real-service functional suite runner. Standard library suffices for HTTP/SQLite."""
from __future__ import annotations

import ctypes
import datetime as dt
import decimal
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import sqlite3
import subprocess
import sys
import time
from urllib import error, parse, request
import uuid


class SuiteError(ValueError):
    pass


def normalize_url(value):
    value = str(value).strip()
    if "://" not in value:
        value = "http://" + value
    parsed = parse.urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise SuiteError("Expected an http(s) URL or HOST:PORT")
    if parsed.username or parsed.password:
        raise SuiteError("URLs must not contain credentials")
    return value.rstrip("/")


def interpolate(value, variables):
    if isinstance(value, dict):
        return {key: interpolate(item, variables) for key, item in value.items()}
    if isinstance(value, list):
        return [interpolate(item, variables) for item in value]
    if not isinstance(value, str):
        return value
    def resolve(match):
        key = match.group(1)
        if key not in variables:
            raise SuiteError(f"Unknown variable: {key}")
        return variables[key]
    pattern = r"\$\{([A-Za-z_][\w.-]*)\}"
    match = re.fullmatch(pattern, value)
    if match:
        return resolve(match)
    return re.sub(pattern, lambda item: str(resolve(item)), value)


def json_path(data, path):
    if not isinstance(path, str) or not path.startswith("$"):
        raise SuiteError(f"Invalid JSON path: {path!r}")
    tail = path[1:]
    while tail:
        match = re.match(r"^(?:\.([^.[\]]+)|\[(\d+)\])", tail)
        if not match:
            raise SuiteError(f"Unsupported JSON path: {path}")
        key = match.group(1) if match.group(1) is not None else int(match.group(2))
        try:
            data = data[key]
        except (KeyError, IndexError, TypeError) as exc:
            raise AssertionError(f"JSON path missing: {path}") from exc
        tail = tail[match.end():]
    return data


def load_suite(path):
    path = Path(path).resolve()
    try:
        suite = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SuiteError(f"Cannot read suite: {exc}") from exc
    validate_suite(suite, path.parent)
    return suite


def validate_suite(suite, base):
    if not isinstance(suite, dict) or suite.get("version") != 1:
        raise SuiteError("Suite must be an object with version: 1")
    auth = suite.get("auth", {"mode": "token"})
    if not isinstance(auth, dict) or auth.get("mode", "token") not in {"token", "none"}:
        raise SuiteError("auth.mode must be token or none")
    for name in ("variables", "databases", "services", "browser"):
        if not isinstance(suite.get(name, {}), dict):
            raise SuiteError(f"{name} must be an object")
    cases = suite.get("cases")
    if not isinstance(cases, list) or not cases:
        raise SuiteError("Suite needs at least one case")
    ids = set()
    groups = [("setup", suite.get("setup", [])), ("teardown", suite.get("teardown", []))]
    for index, case in enumerate(cases):
        if not isinstance(case, dict) or not case.get("id") or case["id"] in ids:
            raise SuiteError(f"Case {index + 1} needs a unique id")
        ids.add(case["id"])
        if not case.get("steps"):
            raise SuiteError(f"Case {case['id']} needs steps")
        groups.append((case["id"], case["steps"]))
    for label, steps in groups:
        if not isinstance(steps, list):
            raise SuiteError(f"{label}: steps must be a list")
        for step in steps:
            if not isinstance(step, dict) or step.get("type") not in {"http", "sql", "browser"}:
                raise SuiteError(f"{label}: unsupported step type")
            kind = step["type"]
            expect = step.get("expect", {})
            if not isinstance(expect, dict):
                raise SuiteError(f"{label}: expect must be an object")
            if kind == "http":
                if not isinstance(step.get("path"), str):
                    raise SuiteError(f"{label}: HTTP path is required")
                if str(step.get("method", "GET")).upper() not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
                    raise SuiteError(f"{label}: unsupported HTTP method")
                if set(expect) - {"status", "json", "text", "headers"}:
                    raise SuiteError(f"{label}: unknown HTTP assertion")
                if not isinstance(expect.get("json", {}), dict) or not isinstance(step.get("capture", {}), dict):
                    raise SuiteError(f"{label}: json assertions and capture must be objects")
                for path in [*expect.get("json", {}).keys(), *step.get("capture", {}).values()]:
                    if not isinstance(path, str) or not re.fullmatch(r"\$(?:\.[^.[\]]+|\[\d+\])*", path):
                        raise SuiteError(f"{label}: unsupported JSON path: {path!r}")
                if not isinstance(step.get("headers", {}), dict) or not isinstance(expect.get("headers", {}), dict):
                    raise SuiteError(f"{label}: headers must be objects")
            elif kind == "sql":
                if step.get("database", "main") not in suite.get("databases", {}):
                    raise SuiteError(f"{label}: unknown database")
                if ("sql" in step) == ("file" in step):
                    raise SuiteError(f"{label}: provide sql or file, exclusively")
                if "file" in step and not (base / step["file"]).is_file():
                    raise SuiteError(f"{label}: SQL file does not exist: {step['file']}")
                if not isinstance(step.get("params", {}), dict):
                    raise SuiteError(f"{label}: SQL params must be an object")
                if set(expect) - {"row_count", "rows", "scalar"}:
                    raise SuiteError(f"{label}: unknown SQL assertion")
            else:
                if not isinstance(step.get("actions"), list) or not step["actions"]:
                    raise SuiteError(f"{label}: browser actions are required")
                for action in step["actions"]:
                    if not isinstance(action, dict) or action.get("action") not in {"goto", "fill", "click", "select", "check", "wait_for", "assert_text", "assert_value", "assert_visible"}:
                        raise SuiteError(f"{label}: unsupported browser action")
                    if action["action"] == "goto":
                        if not isinstance(action.get("path"), str):
                            raise SuiteError(f"{label}: goto needs a path")
                    elif not isinstance(action.get("selector"), str) or not re.fullmatch(r"#[A-Za-z_][A-Za-z0-9_.:-]*", action["selector"]):
                        raise SuiteError(f"{label}: browser actions require one stable #ID selector")
    for name, config in suite.get("databases", {}).items():
        if not isinstance(config, dict) or not config.get("url_env") or set(config) - {"url_env"}:
            raise SuiteError(f"Database {name}: configure only url_env (never store credentials)")
    for name, config in suite.get("services", {}).items():
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
            raise SuiteError("Service names allow letters, digits, dot, dash, underscore")
        if not isinstance(config, dict) or not isinstance(config.get("command"), list) or not config["command"] or not all(isinstance(x, str) for x in config["command"]):
            raise SuiteError(f"Service {name}: command must be a nonempty argv array")
        if not isinstance(config.get("env", {}), dict):
            raise SuiteError(f"Service {name}: env must be an object")
        if not isinstance(config.get("startup_timeout", 90), (int, float)) or not 0 < config.get("startup_timeout", 90) <= 600:
            raise SuiteError(f"Service {name}: startup_timeout must be in (0, 600] seconds")


class Redactor:
    def __init__(self, suite, token):
        self.secrets = {str(token)} if token else set()
        for config in suite.get("databases", {}).values():
            url = os.getenv(config["url_env"], "")
            if url:
                self.secrets.add(url)
                password = parse.urlsplit(url).password
                if password:
                    self.secrets.update({password, parse.unquote(password)})
        for key, value in os.environ.items():
            if value and re.search(r"TOKEN|PASSWORD|SECRET|API_KEY", key, re.I):
                self.secrets.add(value)

    def observe(self, value, sensitive=False):
        """Learn sensitive response values before assertions turn them into strings."""
        if isinstance(value, dict):
            for key, item in value.items():
                self.observe(item, sensitive or bool(re.search(r"authorization|password|passwd|secret|token|cookie|api.?key", str(key), re.I)))
        elif isinstance(value, list):
            for item in value:
                self.observe(item, sensitive)
        elif sensitive and isinstance(value, str) and value:
            self.secrets.add(value)

    def clean(self, value):
        if isinstance(value, dict):
            return {key: ("[REDACTED]" if re.search(r"authorization|password|passwd|secret|token|cookie|api.?key", str(key), re.I) else self.clean(item)) for key, item in value.items()}
        if isinstance(value, list):
            return [self.clean(item) for item in value]
        if isinstance(value, str):
            for secret in sorted(self.secrets, key=len, reverse=True):
                value = value.replace(secret, "[REDACTED]")
            value = re.sub(r"(?i)([?&][\w.-]*(?:token|password|passwd|secret|api[_-]?key)[\w.-]*=)[^&\s]+", r"\1[REDACTED]", value)
        return value


def _origin(url):
    parts = parse.urlsplit(url)
    return parts.scheme, parts.hostname, parts.port or (443 if parts.scheme == "https" else 80)


def _join(base, path):
    return normalize_url(path) if "://" in path else base.rstrip("/") + "/" + path.lstrip("/")


def _assert_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def http_step(step, api_url, auth, token, variables, redactor):
    method = step.get("method", "GET").upper()
    url = _join(api_url, step["path"])
    query = step.get("query")
    if query:
        url += ("&" if "?" in url else "?") + parse.urlencode(query, doseq=True)
    headers = {str(key): str(value) for key, value in step.get("headers", {}).items()}
    if auth.get("mode", "token") == "token" and step.get("auth", True):
        if _origin(url) != _origin(api_url):
            raise SuiteError("Refusing to send suite authentication to another origin")
        headers[auth.get("header", "Authorization")] = auth.get("prefix", "Bearer ") + token
    body = None
    if "json" in step:
        body = json.dumps(step["json"], ensure_ascii=False).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")
    elif "body" in step:
        body = str(step["body"]).encode("utf-8")
    timeout = float(step.get("timeout", 20))
    if not 0 < timeout <= 300:
        raise SuiteError("HTTP timeout must be in (0, 300] seconds")
    class NoRedirect(request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = request.build_opener(NoRedirect())
    req = request.Request(url, data=body, headers=headers, method=method)
    try:
        response = opener.open(req, timeout=timeout)
    except error.HTTPError as exc:
        response = exc
    with response:
        raw = response.read(8 * 1024 * 1024 + 1)
        if len(raw) > 8 * 1024 * 1024:
            raise SuiteError("HTTP response exceeded 8 MiB")
        text_body = raw.decode(response.headers.get_content_charset() or "utf-8", errors="replace")
        status = response.code
        response_headers = dict(response.headers.items())
    redactor.observe(response_headers)
    expect = step.get("expect", {})
    wanted = expect.get("status", 200)
    if isinstance(wanted, list):
        if status not in wanted:
            raise AssertionError(f"HTTP {method} {step['path']}: expected status in {wanted}, got {status}")
    else:
        _assert_equal(status, wanted, f"HTTP {method} {step['path']} status")
    evidence = {"method": method, "url": url, "status": status, "assertions": {"status": wanted}}
    parsed_json = None
    if expect.get("json") or step.get("capture"):
        try:
            parsed_json = json.loads(text_body)
            redactor.observe(parsed_json)
        except json.JSONDecodeError as exc:
            raise AssertionError("Response was not JSON") from exc
    if "json" in expect:
        evidence["assertions"]["json"] = {}
        for path, value in expect["json"].items():
            actual = json_path(parsed_json, path)
            _assert_equal(actual, value, f"JSON {path}")
            evidence["assertions"]["json"][path] = actual
    if "text" in expect:
        if str(expect["text"]) not in text_body:
            raise AssertionError(f"Response text did not contain {expect['text']!r}")
        evidence["assertions"]["text"] = expect["text"]
    for key, value in expect.get("headers", {}).items():
        actual = next((v for k, v in response_headers.items() if k.lower() == key.lower()), None)
        _assert_equal(actual, value, f"Header {key}")
    captured = {}
    for name, path in step.get("capture", {}).items():
        captured[name] = json_path(parsed_json, path)
    redactor.observe(captured)
    variables.update(captured)
    if captured:
        evidence["captured"] = captured
    return evidence


def _json_value(value):
    if isinstance(value, (dt.date, dt.datetime, dt.time, decimal.Decimal)):
        return str(value)
    if isinstance(value, bytes):
        return value.hex()
    return value


class Databases:
    def __init__(self, configs, base, redactor):
        self.configs, self.base, self.connections, self.redactor = configs, base, {}, redactor

    def connection(self, name):
        if name in self.connections:
            return self.connections[name]
        env_name = self.configs[name]["url_env"]
        url = os.getenv(env_name)
        if not url:
            raise SuiteError(f"Set database environment variable {env_name}")
        if url.startswith("sqlite:///"):
            filename = parse.unquote(url[len("sqlite:///"):])
            if filename != ":memory:" and not Path(filename).is_absolute():
                filename = str(self.base / filename)
            connection = sqlite3.connect(filename, timeout=15)
            connection.row_factory = sqlite3.Row
            pair = ("sqlite", connection)
        else:
            try:
                from sqlalchemy import create_engine
            except ImportError as exc:
                raise SuiteError("Install SQLAlchemy and the database driver; see references/install.md") from exc
            if url.startswith("mysql://"):
                url = "mysql+pymysql://" + url[len("mysql://"):]
            elif url.startswith(("postgres://", "postgresql://")):
                url = "postgresql+psycopg://" + url.split("://", 1)[1]
            engine = create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 15} if url.startswith(("mysql", "postgresql")) else {})
            pair = ("sqlalchemy", engine)
        self.connections[name] = pair
        return pair

    def run(self, step):
        name = step.get("database", "main")
        kind, connection = self.connection(name)
        sql = (self.base / step["file"]).read_text(encoding="utf-8-sig") if "file" in step else step["sql"]
        params = step.get("params", {})
        self.redactor.observe(params)
        if kind == "sqlite":
            try:
                cursor = connection.execute(sql, params)
                rows = [{key: _json_value(row[key]) for key in row.keys()} for row in cursor.fetchall()] if cursor.description else []
                affected = cursor.rowcount
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        else:
            from sqlalchemy import text
            with connection.begin() as session:
                result = session.execute(text(sql), params)
                rows = [{key: _json_value(value) for key, value in row.items()} for row in result.mappings().all()] if result.returns_rows else []
                affected = result.rowcount
        self.redactor.observe(rows)
        expect = step.get("expect", {})
        if "row_count" in expect:
            _assert_equal(len(rows), expect["row_count"], "SQL row_count")
        if "rows" in expect:
            _assert_equal(rows, expect["rows"], "SQL rows")
        if "scalar" in expect:
            actual = next(iter(rows[0].values())) if rows else None
            _assert_equal(actual, expect["scalar"], "SQL scalar")
        return {"database": name, "sql": sql, "params": params, "row_count": len(rows), "affected": affected, "rows": rows[:50], "rows_truncated": len(rows) > 50, "assertions": expect}

    def close(self):
        for kind, connection in self.connections.values():
            connection.close() if kind == "sqlite" else connection.dispose()


def _identity(pid):
    """Creation time guards against stopping a recycled process ID."""
    if os.name == "nt":
        from ctypes import wintypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x1000, False, int(pid))
        if not handle:
            return None
        try:
            created, exited, kernel_time, user_time = (wintypes.FILETIME() for _ in range(4))
            if not kernel.GetProcessTimes(handle, ctypes.byref(created), ctypes.byref(exited), ctypes.byref(kernel_time), ctypes.byref(user_time)):
                return None
            if exited.dwHighDateTime or exited.dwLowDateTime:
                return None
            return f"win:{created.dwHighDateTime}:{created.dwLowDateTime}"
        finally:
            kernel.CloseHandle(handle)
    proc = Path(f"/proc/{pid}/stat")
    if proc.exists():
        try:
            fields = proc.read_text().rsplit(")", 1)[1].split()
            return None if fields[0] == "Z" else "proc:" + fields[19]
        except (OSError, IndexError):
            return None
    try:
        result = subprocess.run(["ps", "-p", str(pid), "-o", "lstart="], capture_output=True, text=True, timeout=5)
        return "ps:" + result.stdout.strip() if result.returncode == 0 and result.stdout.strip() else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def _state_path(suite_path, state_dir=None):
    suite_path = Path(suite_path).resolve()
    return (Path(state_dir).resolve() if state_dir else suite_path.parent / ".webtest" / "services") / (hashlib.sha256(str(suite_path).encode()).hexdigest()[:16] + ".json")


def _read_state(path, suite_path):
    if not path.exists():
        return {"owner": "webapp-testing-v1", "suite": str(Path(suite_path).resolve()), "services": {}}
    state = json.loads(path.read_text(encoding="utf-8"))
    if state.get("owner") != "webapp-testing-v1" or state.get("suite") != str(Path(suite_path).resolve()):
        raise SuiteError("Service state does not belong to this suite/tool")
    return state


def _write_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _stop_owned(entry):
    if not entry.get("instance") or not entry.get("identity"):
        raise SuiteError("Service state lacks an owned process identity")
    pid = int(entry["pid"])
    identity = _identity(pid)
    if identity is None:
        return "stopped"
    if identity != entry["identity"]:
        return "identity-mismatch (left untouched)"
    if os.name == "nt":
        result = subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW, timeout=15)
        if result.returncode and _identity(pid) == identity:
            raise SuiteError("Unable to stop owned service process")
    else:
        os.killpg(pid, signal.SIGTERM)
        deadline = time.monotonic() + 5
        while _identity(pid) == identity and time.monotonic() < deadline:
            time.sleep(0.1)
        if _identity(pid) == identity:
            os.killpg(pid, signal.SIGKILL)
    return "stopped"


def service_command(action, suite_path, state_dir=None):
    suite_path = Path(suite_path).resolve()
    suite = load_suite(suite_path) if action == "start" else {}
    state_path = _state_path(suite_path, state_dir)
    state = _read_state(state_path, suite_path)
    entries = state["services"]
    if action == "status":
        return {"state_file": str(state_path), "services": {name: {**entry, "status": "running" if _identity(entry["pid"]) == entry["identity"] else "stopped-or-replaced"} for name, entry in entries.items()}}
    if action == "stop":
        for entry in entries.values():
            entry["status"] = _stop_owned(entry)
        _write_state(state_path, state)
        return {"state_file": str(state_path), "services": entries}
    if action != "start":
        raise SuiteError(f"Unknown service action: {action}")
    variables = {**os.environ, **suite.get("variables", {})}
    started = []
    try:
        for name, raw in suite.get("services", {}).items():
            previous = entries.get(name)
            if previous and _identity(previous["pid"]) == previous["identity"]:
                previous["status"] = "running"
                continue
            config = interpolate(raw, variables)
            cwd = (suite_path.parent / config.get("cwd", ".")).resolve()
            if not cwd.is_dir():
                raise SuiteError(f"Service {name}: cwd does not exist")
            env = {**os.environ, **{key: str(value) for key, value in config.get("env", {}).items()}}
            state_path.parent.mkdir(parents=True, exist_ok=True)
            log_path = state_path.parent / f"{name}-{uuid.uuid4().hex[:8]}.log"
            options = {"creationflags": subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
            with log_path.open("ab", buffering=0) as log:
                process = subprocess.Popen(config["command"], cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, **options)
            identity = _identity(process.pid)
            if not identity:
                raise SuiteError(f"Service {name} exited before process identity could be recorded; inspect {log_path}")
            entry = {"pid": process.pid, "identity": identity, "instance": uuid.uuid4().hex, "log": str(log_path), "status": "starting"}
            entries[name] = entry
            started.append(entry)
            _write_state(state_path, state)
            ready = config.get("ready_url")
            deadline = time.monotonic() + min(float(config.get("startup_timeout", 90)), 600)
            while True:
                if process.poll() is not None:
                    raise SuiteError(f"Service {name} exited with {process.returncode}; inspect {log_path}")
                if not ready:
                    break
                try:
                    with request.urlopen(normalize_url(ready), timeout=2) as response:
                        if response.code < 400:
                            break
                except (error.URLError, TimeoutError, OSError):
                    pass
                if time.monotonic() >= deadline:
                    raise SuiteError(f"Service {name} readiness timed out; inspect {log_path}")
                time.sleep(0.25)
            entry["status"] = "running"
            if ready:
                entry["ready_url"] = Redactor(suite, os.getenv("WEBTEST_TOKEN", "")).clean(ready)
            _write_state(state_path, state)
    except BaseException:
        for entry in reversed(started):
            try:
                entry["status"] = _stop_owned(entry)
            except Exception:
                entry["status"] = "stop-error"
        _write_state(state_path, state)
        raise
    return {"state_file": str(state_path), "services": entries, "note": "Services stay running until services stop is requested."}


def _write_report(report, output, redactor):
    report = redactor.clean(report)
    output.mkdir(parents=True, exist_ok=True)
    json_file, markdown_file = output / "report.json", output / "report.md"
    report["report_json"], report["report_markdown"] = str(json_file), str(markdown_file)
    json_file.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    lines = [f"# {report['name']}", "", f"Status: **{report['status']}** · {report['duration_seconds']:.3f}s", "", f"Frontend: {report['frontend_url']}", f"API: {report['api_url']}", ""]
    if report.get("error"):
        lines.extend([f"Error: {report['error']}", ""])
    for group in [report["setup"], *report["cases"], report["teardown"]]:
        lines.extend([f"## {group['id']} — {group['status']}", ""])
        for step in group["steps"]:
            lines.append(f"- {step['id']} ({step['type']}): **{step['status']}** · {step.get('duration_seconds', 0):.3f}s")
            if step.get("error"):
                lines.append(f"  {step['error']}")
            if step.get("evidence"):
                evidence = json.dumps(step["evidence"], ensure_ascii=False, default=str)
                lines.append("  `" + evidence.replace("`", "'").replace("\n", " ") + "`")
        lines.append("")
    markdown_file.write_text("\n".join(lines), encoding="utf-8")
    return report


def run_suite(suite_path, frontend_url, token=None, api_url=None, output=None, start_services=False, stop_services=False, state_dir=None):
    suite_path = Path(suite_path).resolve()
    suite = load_suite(suite_path)
    frontend_url = normalize_url(frontend_url)
    api_url = normalize_url(api_url) if api_url else _join(frontend_url, suite.get("api_base", "/api"))
    token = token if token is not None else os.getenv("WEBTEST_TOKEN", "")
    auth = suite.get("auth", {"mode": "token"})
    if auth.get("mode", "token") == "token" and not token:
        raise SuiteError("Authentication token required: use --token or WEBTEST_TOKEN, or explicitly set auth.mode=none for an authorized test service")
    variables = {**suite.get("variables", {}), "token": token, "frontend_url": frontend_url, "api_url": api_url}
    variables = interpolate(variables, variables)
    redactor = Redactor(suite, token)
    databases = Databases(suite.get("databases", {}), suite_path.parent, redactor)
    browser_session = None
    start_time = time.monotonic()
    report = {"name": suite.get("name", suite_path.stem), "suite": str(suite_path), "started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "frontend_url": frontend_url, "api_url": api_url, "status": "pass", "setup": {"id": "setup", "status": "skipped", "steps": []}, "cases": [], "teardown": {"id": "teardown", "status": "skipped", "steps": []}}
    output = Path(output).resolve() if output else suite_path.parent / ".webtest" / "runs" / (dt.datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6])

    def group(label, steps, skip=False, continue_on_error=False):
        nonlocal browser_session
        result = {"id": label, "status": "skipped" if skip else "pass", "steps": []}
        failed = skip
        for index, raw in enumerate(steps):
            item = {"id": raw.get("id", f"step-{index + 1}"), "type": raw["type"], "status": "skipped" if failed and not continue_on_error else "pass"}
            result["steps"].append(item)
            if failed and not continue_on_error:
                continue
            tick = time.monotonic()
            try:
                step = interpolate(raw, variables)
                redactor.observe(step)
                item["evidence"] = {key: step[key] for key in ("method", "path", "sql", "file", "actions") if key in step}
                if step["type"] == "http":
                    item["evidence"]["method"] = step.get("method", "GET").upper()
                    evidence = http_step(step, api_url, auth, token, variables, redactor)
                elif step["type"] == "sql":
                    evidence = databases.run(step)
                else:
                    if browser_session is None:
                        from browser import BrowserSession
                        browser_session = BrowserSession(frontend_url, config=interpolate(suite.get("browser", {}), variables), auth=auth, token=token)
                    evidence = browser_session.run_step(step)
                item["evidence"] = evidence
            except AssertionError as exc:
                item["status"], item["error"] = "fail", str(exc)
            except Exception as exc:
                item["status"], item["error"] = "error", f"{type(exc).__name__}: {exc}"
            item["duration_seconds"] = round(time.monotonic() - tick, 3)
            if item["status"] in {"fail", "error"}:
                result["status"] = "error" if item["status"] == "error" else ("error" if result["status"] == "error" else "fail")
                failed = True
        return result

    try:
        if start_services:
            report["services"] = service_command("start", suite_path, state_dir)
        report["setup"] = group("setup", suite.get("setup", []))
        skip = report["setup"]["status"] != "pass"
        for case in suite["cases"]:
            report["cases"].append(group(case["id"], case["steps"], skip=skip))
    except Exception as exc:
        report["status"], report["error"] = "error", f"{type(exc).__name__}: {exc}"
    finally:
        report["teardown"] = group("teardown", suite.get("teardown", []), continue_on_error=True)
        cleanup_errors = []
        for close in ([browser_session.close] if browser_session is not None else []) + [databases.close]:
            try:
                close()
            except Exception as exc:
                cleanup_errors.append(f"{type(exc).__name__}: {exc}")
        if stop_services:
            try:
                report["services"] = service_command("stop", suite_path, state_dir)
            except Exception as exc:
                cleanup_errors.append(f"{type(exc).__name__}: {exc}")
        if cleanup_errors:
            report["status"], report["error"] = "error", "Cleanup: " + "; ".join(cleanup_errors)
    statuses = [report["status"], report["setup"].get("status"), report["teardown"]["status"], *[case["status"] for case in report["cases"]]]
    report["status"] = "error" if "error" in statuses else "fail" if "fail" in statuses else "pass"
    report["duration_seconds"] = round(time.monotonic() - start_time, 3)
    for key, value in variables.items():
        if value and re.search(r"token|password|secret|api.?key", key, re.I):
            redactor.secrets.add(str(value))
    return _write_report(report, output, redactor)
