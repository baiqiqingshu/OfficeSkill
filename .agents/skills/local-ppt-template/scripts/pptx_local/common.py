from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from pathlib import Path


class PptError(ValueError):
    """An actionable user input or template validation error."""


def local_path(value: str | Path, base: Path | None = None) -> Path:
    raw = str(value)
    if raw.startswith(("\\\\", "//")) or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]{1,}:", raw):
        raise PptError(f"只允许本地文件路径，拒绝 URL/网络共享：{raw}")
    path = Path(raw).expanduser()
    if not path.is_absolute() and base is not None:
        path = base / path
    path = path.resolve()
    if str(path).startswith(("\\\\", "//")):
        raise PptError(f"路径解析到网络共享：{raw}")
    return path


def read_json(path: Path) -> dict:
    def no_duplicates(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise PptError(f"JSON 键重复：{key}")
            result[key] = value
        return result

    try:
        result = json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=no_duplicates)
    except (OSError, json.JSONDecodeError) as exc:
        raise PptError(f"无法读取 JSON {path.name}：{exc}") from exc
    if not isinstance(result, dict):
        raise PptError("JSON 根节点必须是对象")
    return result


def atomic_write(path: Path, data: bytes, *, overwrite: bool = False) -> None:
    if path.exists() and not overwrite:
        raise PptError(f"输出已存在，请使用 --overwrite：{path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".tmp", delete=False) as handle:
            name = handle.name
            handle.write(data)
        os.replace(name, path)
    finally:
        if name and Path(name).exists():
            Path(name).unlink()


def json_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require_keys(obj: dict, allowed: set[str], context: str) -> None:
    extra = set(obj) - allowed
    if extra:
        raise PptError(f"{context} 存在未知字段：{', '.join(sorted(extra))}")


def positive(value, context: str, *, integer: bool = False) -> float:
    import math

    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise PptError(f"{context} 必须是正数")
    if integer and not isinstance(value, int):
        raise PptError(f"{context} 必须是正整数")
    return value


def identifier(value, context: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", value):
        raise PptError(f"{context} 必须以英文字母开头，且仅包含字母、数字、下划线、连字符")
    return value
