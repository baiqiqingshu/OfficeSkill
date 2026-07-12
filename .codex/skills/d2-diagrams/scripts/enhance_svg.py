#!/usr/bin/env python3
"""Inject animation CSS into D2 SVG files."""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

FALLBACK_CSS = """/* D2 Diagram Animations - Fallback */
@keyframes traffic-flow {
  from { stroke-dashoffset: 24; }
  to { stroke-dashoffset: 0; }
}
path[marker-end] {
  stroke-dasharray: 8 4;
  animation: traffic-flow 1s linear infinite;
}
text, tspan, textPath {
  animation: none !important;
  filter: none !important;
  opacity: 1 !important;
}
@media (prefers-reduced-motion: reduce) {
  path[marker-end] { animation: none; }
}
"""


def read_css(css_path: Path | None) -> str:
    if css_path and css_path.exists():
        return css_path.read_text(encoding="utf-8")
    return FALLBACK_CSS


def enhance(svg_file: Path, css: str, backup: bool, dry_run: bool) -> bool:
    if not svg_file.exists() or svg_file.suffix.lower() != ".svg":
        print(f"SKIP: {svg_file}")
        return True
    text = svg_file.read_text(encoding="utf-8", errors="ignore")
    if "D2 Diagram Animations" in text:
        print(f"OK: already enhanced {svg_file}")
        return True
    svg_start = text.find("<svg")
    marker_end = text.find(">", svg_start)
    if svg_start < 0 or marker_end < svg_start:
        print(f"FAIL: invalid SVG structure {svg_file}")
        return False
    style = "\n<defs>\n<style type=\"text/css\">\n<![CDATA[\n" + css + "\n]]>\n</style>\n</defs>\n"
    updated = text[: marker_end + 1] + style + text[marker_end + 1 :]
    if "traffic-flow" not in updated:
        print(f"FAIL: CSS injection failed {svg_file}")
        return False
    if dry_run:
        print(f"DRY-RUN: would enhance {svg_file}")
        return True
    if backup:
        shutil.copy2(svg_file, svg_file.with_suffix(svg_file.suffix + ".bak"))
    svg_file.write_text(updated, encoding="utf-8")
    print(f"OK: enhanced {svg_file}")
    return True


def targets(path: Path, all_mode: bool) -> list[Path]:
    if all_mode:
        return sorted(path.glob("*.svg"))
    return [path]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path)
    parser.add_argument("--all", action="store_true", help="enhance all SVG files in target directory")
    parser.add_argument("--css", type=Path)
    parser.add_argument("--backup", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    css = read_css(args.css)
    ok = True
    for svg_file in targets(args.target, args.all):
        ok = enhance(svg_file, css, args.backup, args.dry_run) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
