#!/usr/bin/env python3
"""Render a D2 file to light and/or dark SVG with fallback layout."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    print("+ " + " ".join(cmd))
    return subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


def render(input_file: Path, output_file: Path, theme: int, layout: str, animate_interval: int, bundle: bool) -> bool:
    output_file.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["d2"]
    if bundle:
        cmd.append("--bundle")
    cmd.extend([
        str(input_file),
        str(output_file),
        "--theme",
        str(theme),
        "--layout",
        layout,
        f"--animate-interval={animate_interval}",
    ])
    result = run(cmd)
    if result.returncode == 0 and output_file.exists() and output_file.stat().st_size > 0:
        print(f"OK: rendered {output_file}")
        return True
    print(result.stdout)
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--light", type=Path)
    parser.add_argument("--dark", type=Path)
    parser.add_argument("--layout", default="elk", choices=["elk", "dagre"])
    parser.add_argument("--fallback-layout", default="dagre", choices=["elk", "dagre"])
    parser.add_argument("--light-theme", type=int, default=0)
    parser.add_argument("--dark-theme", type=int, default=200)
    parser.add_argument("--animate-interval", type=int, default=1200)
    parser.add_argument("--no-bundle", action="store_true")
    args = parser.parse_args()

    if shutil.which("d2") is None:
        print("FAIL: d2 executable not found on PATH")
        print("Install D2 from https://d2lang.com or run: go install oss.terrastruct.com/d2@latest")
        return 1
    if not args.input.exists():
        print(f"FAIL: input not found: {args.input}")
        return 1

    light = args.light or args.input.with_name(args.input.stem + "-light.svg")
    dark = args.dark or args.input.with_name(args.input.stem + "-dark.svg")
    bundle = not args.no_bundle
    status = 0

    for output, theme in [(light, args.light_theme), (dark, args.dark_theme)]:
        if render(args.input, output, theme, args.layout, args.animate_interval, bundle):
            continue
        if args.fallback_layout != args.layout:
            print(f"Retrying with {args.fallback_layout}")
            if render(args.input, output, theme, args.fallback_layout, args.animate_interval, bundle):
                continue
        status = 1

    return status


if __name__ == "__main__":
    sys.exit(main())
