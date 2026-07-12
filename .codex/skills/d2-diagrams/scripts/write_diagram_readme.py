#!/usr/bin/env python3
"""Create a standard diagrams/README.md for generated D2 diagram sets."""

from __future__ import annotations

import argparse
from pathlib import Path

CONTENT = """# System Diagrams

Generated D2 diagrams for this project.

## Infrastructure

### Overview

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./infrastructure-simplified-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./infrastructure-simplified-light.svg">
  <img alt="Infrastructure Overview" src="./infrastructure-simplified-light.svg">
</picture>

[View simplified infrastructure notes](./infrastructure-simplified.md)

### Detailed

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./infrastructure-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./infrastructure-light.svg">
  <img alt="Infrastructure Diagram" src="./infrastructure-light.svg">
</picture>

[View detailed infrastructure notes](./infrastructure.md)

## Architecture

### Overview

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./architecture-simplified-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./architecture-simplified-light.svg">
  <img alt="Architecture Overview" src="./architecture-simplified-light.svg">
</picture>

[View simplified architecture notes](./architecture-simplified.md)

### Detailed

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./architecture-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./architecture-light.svg">
  <img alt="Architecture Diagram" src="./architecture-light.svg">
</picture>

[View detailed architecture notes](./architecture.md)

## Source Files

| File | Description |
| --- | --- |
| [infrastructure-simplified.d2](./infrastructure-simplified.d2) | High-level infrastructure diagram source |
| [infrastructure.d2](./infrastructure.d2) | Detailed infrastructure diagram source |
| [architecture-simplified.d2](./architecture-simplified.d2) | High-level architecture diagram source |
| [architecture.d2](./architecture.d2) | Detailed architecture diagram source |
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("diagrams_dir", type=Path, nargs="?", default=Path("diagrams"))
    parser.add_argument("--force", action="store_true", help="overwrite an existing README.md")
    args = parser.parse_args()

    args.diagrams_dir.mkdir(parents=True, exist_ok=True)
    readme = args.diagrams_dir / "README.md"
    if readme.exists() and not args.force:
        print(f"SKIP: {readme} exists. Use --force to overwrite.")
        return 0
    readme.write_text(CONTENT, encoding="utf-8")
    print(f"OK: wrote {readme}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
