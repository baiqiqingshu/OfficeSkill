#!/usr/bin/env python3
"""Inline base64 SVG image tags inside SVG files for stricter render hosts."""

from __future__ import annotations

import argparse
import base64
import re
import sys
from pathlib import Path

IMAGE_RE = re.compile(r'<image\s+[^>]*href="data:image/svg\+xml;base64,([^"]+)"[^>]*>')
ATTR_RE = {
    "x": re.compile(r'\sx="([^"]+)"'),
    "y": re.compile(r'\sy="([^"]+)"'),
    "width": re.compile(r'\swidth="([^"]+)"'),
    "height": re.compile(r'\sheight="([^"]+)"'),
}
VIEWBOX_RE = re.compile(r'viewBox="([^"]+)"')
SVG_CONTENT_RE = re.compile(r"(?s)<svg[^>]*>(.*)</svg>")
ID_RE = re.compile(r'id="([^"]+)"')
URL_REF_RE = re.compile(r"url\(#([^)]+)\)")
XLINK_RE = re.compile(r'xlink:href="#([^"]+)"')
HREF_HASH_RE = re.compile(r'href="#([^"]+)"')


def attr(pattern: re.Pattern[str], text: str, default: str) -> str:
    match = pattern.search(text)
    return match.group(1) if match else default


def prefix_ids(inner: str, prefix: str) -> str:
    inner = ID_RE.sub(lambda m: f'id="{prefix}{m.group(1)}"', inner)
    inner = URL_REF_RE.sub(lambda m: f"url(#{prefix}{m.group(1)})", inner)
    inner = XLINK_RE.sub(lambda m: f'xlink:href="#{prefix}{m.group(1)}"', inner)
    inner = HREF_HASH_RE.sub(lambda m: f'href="#{prefix}{m.group(1)}"', inner)
    return inner


def inline_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="ignore")
    count = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        image_tag = match.group(0)
        x = attr(ATTR_RE["x"], image_tag, "0")
        y = attr(ATTR_RE["y"], image_tag, "0")
        width = attr(ATTR_RE["width"], image_tag, "64")
        height = attr(ATTR_RE["height"], image_tag, "64")
        try:
            decoded = base64.b64decode(match.group(1)).decode("utf-8", errors="ignore")
        except Exception as exc:
            print(f"WARN: failed to decode icon {count} in {path}: {exc}")
            return image_tag
        if "?>" in decoded:
            decoded = decoded.split("?>", 1)[1]
        content_match = SVG_CONTENT_RE.search(decoded)
        inner = content_match.group(1) if content_match else decoded
        viewbox_match = VIEWBOX_RE.search(decoded)
        viewbox = viewbox_match.group(1) if viewbox_match else f"0 0 {width} {height}"
        inner = prefix_ids(inner, f"icon{count}_")
        return f'<svg x="{x}" y="{y}" width="{width}" height="{height}" viewBox="{viewbox}" xmlns="http://www.w3.org/2000/svg">{inner}</svg>'

    updated = IMAGE_RE.sub(replace, text)
    if count == 0:
        print(f"OK: no base64 SVG image tags found in {path}")
        return True
    path.write_text(updated, encoding="utf-8")
    print(f"OK: inlined {count} icons in {path}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path)
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    paths = sorted(args.target.glob("*.svg")) if args.all else [args.target]
    ok = True
    for path in paths:
        ok = inline_file(path) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
