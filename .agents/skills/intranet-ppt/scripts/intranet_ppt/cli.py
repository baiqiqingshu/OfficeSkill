"""Small deterministic CLI; all assets stay on the local filesystem."""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import uuid

SKILL_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SIZE = {"width": 1280, "height": 720}


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"JSON 包含重复键：{key}")
        result[key] = value
    return result


def _read_json(path):
    if path.stat().st_size > 8 * 1024 * 1024:
        raise ValueError("JSON 超过 8 MiB 限制")
    return json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=_unique_object,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"非法数值：{value}")))


def _write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _local_argument(value):
    raw = str(value)
    if raw.startswith(("\\\\", "//")) or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", raw):
        raise ValueError(f"只接受本地路径：{value}")
    resolved = Path(raw).expanduser().resolve()
    if str(resolved).startswith(("\\\\", "//")):
        raise ValueError(f"禁止指向网络位置的路径：{value}")
    return resolved


def _asset(base, value, label):
    if not isinstance(value, str) or not value or "\x00" in value:
        raise ValueError(f"{label} 必须是相对本地文件路径")
    raw = value.replace("\\", "/")
    relative = Path(raw)
    if relative.is_absolute() or ":" in raw or raw.startswith("//") or ".." in relative.parts:
        raise ValueError(f"{label} 禁止绝对、网络或穿越路径：{value}")
    resolved = (base / relative).resolve()
    if str(resolved).startswith(("\\\\", "//")):
        raise ValueError(f"{label} 不能指向网络位置：{value}")
    if not resolved.is_relative_to(base.resolve()):
        raise ValueError(f"{label} 不能离开配置目录：{value}")
    if not resolved.is_file():
        raise ValueError(f"{label} 文件不存在：{value}")
    return resolved


def _keys(value, allowed, label):
    if not isinstance(value, dict):
        raise ValueError(f"{label} 必须是对象")
    unknown = set(value) - set(allowed)
    if unknown:
        raise ValueError(f"{label} 包含未知字段：{', '.join(sorted(unknown))}")


def _number(value, label, minimum=None, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} 必须是有限数值")
    if minimum is not None and value < minimum or maximum is not None and value > maximum:
        raise ValueError(f"{label} 超出允许范围")


def prepare(config_path):
    from . import components, pptx_backend, themes
    config = _read_json(config_path)
    _keys(config, ["schemaVersion", "title", "master", "libraries", "pageSize", "pageCount", "pages", "theme"], "配置")
    if type(config.get("schemaVersion")) is not int or config["schemaVersion"] != 1:
        raise ValueError("schemaVersion 必须为 1")
    if not isinstance(config.get("title", "未命名演示"), str):
        raise ValueError("title 必须是字符串")
    size = config.get("pageSize", dict(DEFAULT_SIZE))
    _keys(size, ["width", "height"], "pageSize")
    for key in ["width", "height"]:
        _number(size.get(key), f"pageSize.{key}", 100, 10000)
    pages = config.get("pages")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 200:
        raise ValueError("pages 必须包含 1 到 200 个页面")
    if "pageCount" in config and (type(config["pageCount"]) is not int or config["pageCount"] != len(pages)):
        raise ValueError("pageCount 必须与 pages 数量一致")
    base = config_path.parent
    theme = config.get("theme", themes.DEFAULT_THEME)
    if not isinstance(theme, str) or theme not in themes.THEMES:
        raise ValueError(f"theme 必须是以下主题之一：{', '.join(themes.theme_ids())}")
    library_paths = config.get("libraries", [])
    if not isinstance(library_paths, list):
        raise ValueError("libraries 必须是数组")
    libraries = components.load_libraries([_asset(base, item, "library") for item in library_paths],
                                          palette=themes.palette(theme))
    master = _asset(base, config["master"], "master") if "master" in config else None
    master_info = pptx_backend.inspect_pptx(master) if master else {"pageCount": 1}
    compiled = []
    page_ids = set()
    for index, page in enumerate(pages, 1):
        label = f"pages[{index - 1}]"
        _keys(page, ["id", "masterSlide", "elements"], label)
        page_id = page.get("id")
        if not isinstance(page_id, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,79}", page_id) or page_id in page_ids:
            raise ValueError(f"{label}.id 必须是唯一的字母开头 ID（字母、数字、下划线、连字符，最多 80 字符）")
        page_ids.add(page_id)
        slide = page.get("masterSlide", 1)
        if type(slide) is not int or not 1 <= slide <= master_info["pageCount"]:
            raise ValueError(f"{label}.masterSlide 超出母版页面范围")
        elements = page.get("elements")
        if not isinstance(elements, list) or len(elements) > 300:
            raise ValueError(f"{label}.elements 必须是最多 300 个元素的数组")
        nodes, element_ids = [], set()
        for e_index, element in enumerate(elements):
            e_label = f"{label}.elements[{e_index}]"
            _keys(element, ["id", "component", "box", "inputs"], e_label)
            e_id = element.get("id")
            if not isinstance(e_id, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,79}", e_id) or e_id in element_ids:
                raise ValueError(f"{e_label}.id 必须是页内唯一的字母开头 ID（字母、数字、下划线、连字符，最多 80 字符）")
            element_ids.add(e_id)
            if "box" in element:
                _keys(element["box"], ["x", "y", "w", "h"], e_label + ".box")
                for key in ("x", "y", "w", "h"):
                    _number(element["box"].get(key), e_label + ".box." + key, 0 if key in ("x", "y") else 0.01)
                box = element["box"]
                if box["x"] + box["w"] > size["width"] + .01 or box["y"] + box["h"] > size["height"] + .01:
                    raise ValueError(f"{e_label}.box 超出页面边界")
            try:
                nodes.extend(components.compile_element(element, libraries, base, size))
            except Exception as exc:
                raise ValueError(f"{e_label} ({e_id}): {exc}") from exc
        compiled.append({"id": page_id, "masterSlide": slide, "nodes": nodes})
    return {"config": config, "pageSize": size, "pages": compiled, "master": master,
            "title": config.get("title", "未命名演示")}


def _directory_transaction(destination, overwrite, writer):
    """Build beside target, then publish; never recursively delete an arbitrary target."""
    if destination == Path(destination.anchor) or destination == Path.cwd().resolve():
        raise ValueError("输出目录必须是专用子目录")
    if destination.exists() and not destination.is_dir():
        raise ValueError("输出路径已存在且不是目录")
    marker = destination / ".intranet-ppt-output"
    if destination.exists() and any(destination.iterdir()):
        if not overwrite:
            raise ValueError("输出目录非空；请使用新目录，或对本工具产物指定 --overwrite")
        if not marker.is_file() or marker.read_text(encoding="utf-8") != "intranet-ppt-v1\n":
            raise ValueError("仅允许覆盖含本工具标记的输出目录；请改用新目录")
    destination.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".intranet-ppt-", dir=destination.parent))
    backup = destination.with_name(".intranet-ppt-backup-" + uuid.uuid4().hex)
    try:
        result = writer(stage)
        (stage / ".intranet-ppt-output").write_text("intranet-ppt-v1\n", encoding="utf-8")
        previous = destination.exists()
        if previous:
            destination.rename(backup)
        try:
            stage.rename(destination)
        except BaseException:
            if previous:
                backup.rename(destination)
            raise
        if previous:
            shutil.rmtree(backup)
        return result
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def render(config_path, destination, overwrite):
    from . import components, pptx_backend
    if config_path.is_relative_to(destination):
        raise ValueError("输出目录不能包含输入配置，请使用独立子目录")
    prepared = prepare(config_path)
    sources = ([prepared["master"]] if prepared["master"] else [])
    sources += [_asset(config_path.parent, p, "library") for p in prepared["config"].get("libraries", [])]
    sources += [Path(n["src"]) for p in prepared["pages"] for n in p["nodes"] if n.get("type") == "image"]
    if any(source.is_relative_to(destination) for source in sources):
        raise ValueError("输出目录不能包含输入母版、库或图片，请使用独立目录")
    def writer(stage):
        from . import themes
        master = prepared["master"]
        if master is None:
            master = stage / "default-master.pptx"
            theme = themes.THEMES[prepared["config"].get("theme", themes.DEFAULT_THEME)]
            pptx_backend.create_default_master(master, prepared["pageSize"], background=theme["canvas"],
                                              accent=theme["colors"]["ACCENT"], line=theme["colors"]["BORDER_L"])
        pptx_backend.render_pptx(master, prepared["pages"], prepared["pageSize"], stage / "presentation.pptx")
        (stage / "preview.html").write_text(components.render_preview(prepared["pages"], prepared["pageSize"], prepared["title"]), encoding="utf-8")
        report = {"schemaVersion": 1, "title": prepared["title"], "pageCount": len(prepared["pages"]),
                  "pageSize": prepared["pageSize"], "elementCount": sum(len(p["elements"]) for p in prepared["config"]["pages"]),
                  "preview": "HTML 仅为内容预览，不显示原生 PPTX 母版；母版外观以 presentation.pptx 为准。",
                  "warnings": ["请在本地 PowerPoint 或 LibreOffice 检查文字换行及最终版式。"],
                  "outputs": ["presentation.pptx", "preview.html", "report.json"]}
        _write_json(stage / "report.json", report)
        if prepared["master"] is None:
            master.unlink()
        return {"output": str(destination), "pageCount": len(prepared["pages"]), "pptx": str(destination / "presentation.pptx")}
    return _directory_transaction(destination, overwrite, writer)


def starter(destination, overwrite):
    from . import pptx_backend, themes
    def writer(stage):
        theme = themes.THEMES[themes.DEFAULT_THEME]
        pptx_backend.create_default_master(stage / "master.pptx", DEFAULT_SIZE, background=theme["canvas"],
                                          accent=theme["colors"]["ACCENT"], line=theme["colors"]["BORDER_L"])
        images = SKILL_ROOT / "examples/images"
        if images.is_dir():
            shutil.copytree(images, stage / "images")
        filenames = []
        for source in sorted((SKILL_ROOT / "examples").glob("*.json")):
            config = _read_json(source)
            config["master"] = "master.pptx"
            _write_json(stage / source.name, config)
            filenames.append(source.name)
        return {"output": str(destination), "configs": filenames, "master": "master.pptx"}
    return _directory_transaction(destination, overwrite, writer)


def parser():
    root = argparse.ArgumentParser(description="离线内网 PPT：JSON + PPTX 母版 + 声明式 HTML 元素库")
    commands = root.add_subparsers(dest="command", required=True)
    catalog = commands.add_parser("catalog", help="查看可用组件及输入")
    catalog.add_argument("--library", action="append", default=[], help="本地 library.json，可重复")
    validate = commands.add_parser("validate", help="完整校验配置及本地资源")
    validate.add_argument("config")
    render_cmd = commands.add_parser("render", help="生成可编辑 PPTX 和 HTML 内容预览")
    render_cmd.add_argument("config")
    demo = commands.add_parser("demo", help="生成元素库可视化预览页 library-demo.html")
    demo.add_argument("--out", required=True)
    demo.add_argument("--library", action="append", default=[], help="本地 library.json，可重复")
    demo.add_argument("--overwrite", action="store_true")
    for command in (render_cmd, commands.add_parser("starter", help="生成默认母版和全部场景示例（含示例图片）"),
                    commands.add_parser("extract", help="从现有 PPTX 提取元素库、母版和配置")):
        if command.prog.endswith("extract"):
            command.add_argument("source")
        command.add_argument("--out", required=True)
        command.add_argument("--overwrite", action="store_true")
    return root


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = parser().parse_args(argv)
    try:
        from . import components, pptx_backend
        if args.command == "catalog":
            result = components.catalog(components.load_libraries([_local_argument(p) for p in args.library]))
        elif args.command == "validate":
            prepared = prepare(_local_argument(args.config))
            result = {"valid": True, "pageCount": len(prepared["pages"]), "pageSize": prepared["pageSize"]}
        elif args.command == "render":
            result = render(_local_argument(args.config), _local_argument(args.out), args.overwrite)
        elif args.command == "demo":
            from . import demo
            result = demo.build(_local_argument(args.out), [_local_argument(p) for p in args.library], args.overwrite)
        elif args.command == "starter":
            result = starter(_local_argument(args.out), args.overwrite)
        else:
            source, destination = _local_argument(args.source), _local_argument(args.out)
            if source.is_relative_to(destination):
                raise ValueError("输出目录不能包含输入 PPTX，请使用独立子目录")
            pptx_backend.inspect_pptx(source)
            def writer(stage):
                result = pptx_backend.extract_pptx(source, stage)
                result["output"] = str(destination)
                return result
            result = _directory_transaction(destination, args.overwrite, writer)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except ModuleNotFoundError as exc:
        print(json.dumps({"error": f"缺少本地依赖：{exc.name}。请使用内网 wheel 目录离线安装 scripts/requirements.txt；本工具不会联网安装。"}, ensure_ascii=False), file=sys.stderr)
        return 2
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
