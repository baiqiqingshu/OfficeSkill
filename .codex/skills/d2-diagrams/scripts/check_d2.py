#!/usr/bin/env python3
"""Validate D2 files and optionally test-render them."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from d2_executable import find_d2, missing_d2_message

NODE_RE = re.compile(r"^\s*[A-Za-z0-9_-]+\s*:", re.MULTILINE)
EDGE_RE = re.compile(r"\S+\s*(?:->|--)\s*\S+")


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


def rules_disable_icons(cwd: Path) -> bool:
    rules = cwd / "diagrams" / "rules.md"
    if not rules.exists():
        return False
    text = rules.read_text(encoding="utf-8", errors="ignore").lower()
    return bool(re.search(r"disable.*icon|no.*icon|skip.*icon|icons.*false|icons.*disabled", text))


def check_file(path: Path, args: argparse.Namespace, d2: str) -> int:
    if not path.exists():
        print(f"FAIL {path}: file does not exist")
        return 1

    text = path.read_text(encoding="utf-8", errors="ignore")
    status = 0

    if args.min_nodes:
        nodes = len(NODE_RE.findall(text))
        if nodes < args.min_nodes:
            print(f"FAIL {path}: found {nodes} nodes, expected at least {args.min_nodes}")
            status = 1
        else:
            print(f"OK {path}: node count {nodes}")

    if args.min_edges:
        edges = len(EDGE_RE.findall(text))
        if edges < args.min_edges:
            print(f"FAIL {path}: found {edges} edges, expected at least {args.min_edges}")
            status = 1
        else:
            print(f"OK {path}: edge count {edges}")

    if not args.no_fmt:
        result = run([d2, "fmt", str(path.resolve()), "--check"])
        if result.returncode != 0:
            print(f"FAIL {path}: d2 fmt --check failed")
            print(result.stdout)
            status = 1
        else:
            print(f"OK {path}: d2 fmt --check")

    if args.render:
        with tempfile.TemporaryDirectory(prefix=".d2-check-", dir=Path.cwd()) as temp_dir:
            output = Path(temp_dir) / "check.svg"
            result = run([d2, str(path.resolve()), str(output.resolve()), "--layout", args.layout])
            if result.returncode != 0 or not output.exists() or output.stat().st_size == 0:
                print(f"FAIL {path}: test render failed")
                print(result.stdout)
                status = 1
            else:
                print(f"OK {path}: test render")

    icon_count = text.count("icon:")
    node_count = len(NODE_RE.findall(text))
    if not args.no_icon_warning and node_count > 3 and icon_count < 3 and not rules_disable_icons(Path.cwd()):
        print(f"WARN {path}: only {icon_count} icon properties for {node_count} node-like definitions")

    return status


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--render", action="store_true", help="test render each file to a temporary SVG")
    parser.add_argument("--layout", default="dagre", choices=["dagre", "elk"], help="layout for test render")
    parser.add_argument("--min-nodes", type=int, default=1)
    parser.add_argument("--min-edges", type=int, default=0)
    parser.add_argument("--no-fmt", action="store_true", help="skip d2 fmt --check")
    parser.add_argument("--no-icon-warning", action="store_true")
    args = parser.parse_args()

    d2 = find_d2()
    if d2 is None:
        print(missing_d2_message())
        return 1

    print(run([d2, "--version"]).stdout.strip())
    return max(check_file(path, args, d2) for path in args.files)


if __name__ == "__main__":
    sys.exit(main())
