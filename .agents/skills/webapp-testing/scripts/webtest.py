#!/usr/bin/env python3
"""Unified command line for project analysis and real-service functional testing."""
from __future__ import annotations

import argparse
import json
import os
import sys

from runtime import run_suite, service_command


def parser():
    root = argparse.ArgumentParser(description="Spring Boot + Vue real-service functional verification")
    commands = root.add_subparsers(dest="command", required=True)
    analyze = commands.add_parser("analyze", help="Collect concise project context and optional staged changes")
    analyze.add_argument("--project", required=True)
    analyze.add_argument("--output", required=True)
    analyze.add_argument("--requirements")
    analyze.add_argument("--staged", action="store_true")
    init = commands.add_parser("init", help="Create an editable suite directory")
    init.add_argument("--output", required=True)
    export = commands.add_parser("export", help="Export a standalone, manually runnable suite")
    export.add_argument("--suite", required=True)
    export.add_argument("--output", required=True)
    run = commands.add_parser("run", help="Execute HTTP / SQL / Lightpanda steps")
    run.add_argument("--suite", required=True)
    run.add_argument("--frontend-url", required=True, help="http(s) URL or HOST:PORT; also used for API proxy")
    run.add_argument("--token", default=None, help="Token; WEBTEST_TOKEN avoids shell history")
    run.add_argument("--api-url", help="Independent backend base URL, including API prefix")
    run.add_argument("--output", help="Report directory; default creates a unique .webtest/runs directory")
    run.add_argument("--start-services", action="store_true")
    run.add_argument("--stop-services", action="store_true", help="Stop only services owned by this suite after execution")
    run.add_argument("--state-dir")
    services = commands.add_parser("services", help="Manage only service processes started by this tool")
    services.add_argument("action", choices=["start", "status", "stop"])
    services.add_argument("--suite", required=True)
    services.add_argument("--state-dir")
    return root


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        if args.command == "run":
            result = run_suite(args.suite, args.frontend_url, token=args.token, api_url=args.api_url, output=args.output, start_services=args.start_services, stop_services=args.stop_services, state_dir=args.state_dir)
            print(json.dumps({key: result[key] for key in ("name", "status", "duration_seconds", "report_json", "report_markdown")}, ensure_ascii=False, indent=2))
            return 0 if result["status"] == "pass" else 1
        if args.command == "services":
            result = service_command(args.action, args.suite, args.state_dir)
        else:
            import project
            if args.command == "analyze":
                result = project.analyze_project(args.project, args.output, requirements=args.requirements, staged=args.staged)
            elif args.command == "init":
                result = {"suite": str(project.init_suite(args.output))}
            else:
                result = {"directory": str(project.export_suite(args.suite, args.output))}
        from runtime import Redactor
        result = Redactor({}, os.getenv("WEBTEST_TOKEN", "")).clean(result)
        print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
        return 0
    except KeyboardInterrupt:
        print("Interrupted; services remain available. Use services stop to close owned services.", file=sys.stderr)
        return 130
    except Exception as exc:
        # Database driver exceptions can contain connection URLs; omit traceback/secret details.
        from runtime import Redactor
        cleaner = Redactor({}, os.getenv("WEBTEST_TOKEN", ""))
        if getattr(args, "token", None):
            cleaner.secrets.add(args.token)
        print(cleaner.clean(f"{type(exc).__name__}: {exc}"), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
