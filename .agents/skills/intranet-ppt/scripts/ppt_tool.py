#!/usr/bin/env python3
"""Compatibility entrypoint for the renamed native-ppt skill."""
from pathlib import Path
import sys

scripts = Path(__file__).resolve().parents[2] / "native-ppt" / "scripts"
sys.path.insert(0, str(scripts))

from intranet_ppt.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
