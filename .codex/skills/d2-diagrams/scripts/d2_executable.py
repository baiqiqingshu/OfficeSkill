"""Locate the D2 executable bundled with this skill."""

from __future__ import annotations

import os
import shutil
from pathlib import Path


def find_d2() -> str | None:
    skill_root = Path(__file__).resolve().parents[1]
    names = ["d2.exe", "d2"] if os.name == "nt" else ["d2", "d2.exe"]

    for name in names:
        candidate = skill_root / "bin" / name
        if candidate.is_file():
            return str(candidate)

    return shutil.which("d2")


def missing_d2_message() -> str:
    skill_root = Path(__file__).resolve().parents[1]
    return (
        "FAIL: d2 executable not found. Expected bundled executable at "
        f"{skill_root / 'bin' / 'd2.exe'}, or d2 on PATH."
    )
