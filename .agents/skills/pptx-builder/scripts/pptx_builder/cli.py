"""Small deterministic CLI; all assets stay on the local filesystem."""
from __future__ import annotations

import argparse
import copy
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
STUDIO_LIBRARY = SKILL_ROOT / "assets/libraries/studio/library.json"


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


def _resolve_library(base, value):
    if value == "studio" and STUDIO_LIBRARY.is_file():
        return STUDIO_LIBRARY
    return _asset(base, value, "library")


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


def _load_json_input(source=None, inline=None):
    if inline is not None:
        return json.loads(inline)
    if source is None:
        return {}
    raw = str(source).strip()
    if raw == "-":
        return json.loads(sys.stdin.read())
    if raw.startswith("{"):
        return json.loads(raw)
    return _read_json(_local_argument(raw))


def _merge(original, patch):
    if not isinstance(patch, dict):
        return copy.deepcopy(patch)
    result = copy.deepcopy(original) if isinstance(original, dict) else {}
    for key, value in patch.items():
        if value is None:
            result.pop(key, None)
        else:
            result[key] = _merge(result.get(key), value)
    return result


def _apply_sets(obj, pairs):
    if not pairs:
        return obj
    result = copy.deepcopy(obj)
    for pair in pairs:
        if "=" not in pair:
            raise ValueError(f"--set 参数须为 key=value：{pair}")
        path_raw, val_raw = pair.split("=", 1)
        parts = [p for p in path_raw.strip().split(".") if p]
        if not parts:
            raise ValueError(f"无效字段路径：{path_raw}")
        try:
            val = json.loads(val_raw)
        except json.JSONDecodeError:
            val = val_raw
        cursor = result
        for p in parts[:-1]:
            if isinstance(cursor, list) and p.isdigit():
                idx = int(p)
                if not 0 <= idx < len(cursor):
                    raise ValueError(f"列表下标越界：{p}")
                cursor = cursor[idx]
            elif isinstance(cursor, dict):
                cursor = cursor.setdefault(p, {})
            else:
                raise ValueError(f"无法遍历路径段：{p}")
        last = parts[-1]
        if isinstance(cursor, list) and last.isdigit():
            idx = int(last)
            if not 0 <= idx < len(cursor):
                raise ValueError(f"列表下标越界：{last}")
            cursor[idx] = val
        elif isinstance(cursor, dict):
            if val is None:
                cursor.pop(last, None)
            else:
                cursor[last] = val
        else:
            raise ValueError(f"无法写入路径：{path_raw}")
    return result


def _resolve_comp_id(name, libraries):
    if not isinstance(name, str) or name in libraries:
        return name
    if "/" not in name:
        for prefix in ("builtin/", "studio/"):
            if prefix + name in libraries:
                return prefix + name
    return name


def normalize_deck(raw, libraries=None):
    """Tolerantly normalize partial/AI-authored deck configs before validation."""
    config = copy.deepcopy(raw)
    if not isinstance(config, dict):
        return config
    config.setdefault("schemaVersion", 1)
    pages = config.get("pages")
    if isinstance(pages, list):
        if "pageCount" in config:
            config["pageCount"] = len(pages)
        seen_pages = set()
        for p_idx, page in enumerate(pages, 1):
            if not isinstance(page, dict):
                continue
            pid = page.get("id")
            if not isinstance(pid, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,79}", pid) or pid in seen_pages:
                pid = f"page-{p_idx}"
                while pid in seen_pages:
                    pid += "x"
                page["id"] = pid
            seen_pages.add(pid)
            elements = page.get("elements")
            if isinstance(elements, list):
                seen_els = set()
                for e_idx, el in enumerate(elements, 1):
                    if not isinstance(el, dict):
                        continue
                    if libraries and "component" in el:
                        el["component"] = _resolve_comp_id(el["component"], libraries)
                    eid = el.get("id")
                    if not isinstance(eid, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,79}", eid) or eid in seen_els:
                        eid = f"el-{e_idx}"
                        while eid in seen_els:
                            eid += "x"
                        el["id"] = eid
                    seen_els.add(eid)
                    if "inputs" not in el:
                        el["inputs"] = {}
                    elif isinstance(el["inputs"], dict):
                        for sk, sv in list(el["inputs"].items()):
                            if isinstance(sv, (int, float)) and not isinstance(sv, bool):
                                el["inputs"][sk] = str(sv)
    return config


def _auto_place_page(page, libraries, size, safe_regions):
    """Assign pixel boxes to elements omitting `box` based on `slot` / `layout` / stacking."""
    elements = page.get("elements") or []
    if not any("box" not in el for el in elements if isinstance(el, dict)):
        return
    W, H = size["width"], size["height"]
    margin = 64.0
    content_w = W - 2 * margin
    top_reserved = safe_regions["titleHeight"]
    bottom_reserved = safe_regions["footerHeight"]

    def _region_of(el):
        from . import master_regions
        return master_regions.element_region(el)

    has_header = any(isinstance(el, dict) and _region_of(el) == "title" for el in elements)
    body_top = max(float(top_reserved) + 16.0, 116.0 if has_header else 48.0)
    body_bottom = float(H) - max(float(bottom_reserved), 32.0)

    # First place explicit structural roles (full, title, footer) & explicit slots.
    explicit_slots = {
        "title": {"x": margin, "y": 20.0, "w": content_w, "h": 76.0},
        "footer": {"x": margin, "y": float(H) - 48.0, "w": content_w, "h": 24.0},
        "full": {"x": 0.0, "y": 0.0, "w": float(W), "h": float(H)},
        "top": {"x": margin, "y": body_top, "w": content_w, "h": 140.0},
        "bottom": {"x": margin, "y": body_bottom - 160.0, "w": content_w, "h": 150.0},
        "left": {"x": margin, "y": body_top, "w": 552.0, "h": body_bottom - body_top - 16.0},
        "right": {"x": margin + 600.0, "y": body_top, "w": 552.0, "h": body_bottom - body_top - 16.0},
        "col1": {"x": margin, "y": body_top, "w": 360.0, "h": 340.0},
        "col2": {"x": margin + 396.0, "y": body_top, "w": 360.0, "h": 340.0},
        "col3": {"x": margin + 792.0, "y": body_top, "w": 360.0, "h": 340.0},
    }

    body_queue = []
    for el in elements:
        if not isinstance(el, dict) or "box" in el:
            continue
        comp_id = el.get("component")
        comp = libraries.get(comp_id)
        if comp is None:
            continue
        cw, ch = float(comp["size"]["width"]), float(comp["size"]["height"])
        slot = el.get("slot")
        if slot and slot in explicit_slots:
            box = dict(explicit_slots[slot])
            if slot == "title":
                box["h"] = min(ch, max(top_reserved - 20.0, 76.0)) if top_reserved else ch
                box["y"] = 20.0 if ch >= 60 else 24.0
            elif slot not in {"full", "left", "right"}:
                box["h"] = min(ch, box["h"])
            el["box"] = box
            continue
        reg = _region_of(el)
        if reg == "full":
            if comp_id == "builtin/cover-dark" or (cw >= W - 1 and ch >= H - 1):
                el["box"] = {"x": 0.0, "y": 0.0, "w": float(W), "h": float(H)}
            else:
                el["box"] = {"x": round((W - cw) / 2, 1), "y": round((H - ch) / 2, 1), "w": cw, "h": ch}
        elif reg == "title":
            ty = 20.0 if ch >= 60 else 24.0
            th = ch
            if top_reserved > 0 and ty + th > top_reserved:
                ty = max(8.0, top_reserved - th)
                if ty + th > top_reserved:
                    th = max(32.0, top_reserved - ty)
            el["box"] = {"x": margin, "y": ty, "w": min(cw, content_w), "h": th}
        elif reg == "footer":
            el["box"] = {"x": margin, "y": float(H) - max(ch + 16.0, 48.0), "w": min(cw, content_w), "h": ch}
        else:
            body_queue.append((el, cw, ch))

    # Auto-pack body elements: group consecutive same-width narrow cards into rows.
    layout_hint = page.get("layout", "stack")
    cursor_y = body_top
    idx = 0
    while idx < len(body_queue):
        el, cw, ch = body_queue[idx]
        # Check if we can pack a multi-column horizontal row of cards.
        max_cols = 4 if cw <= 270 else (3 if cw <= 380 else (2 if cw <= 568 else 1))
        if layout_hint == "2cols" and cw <= 568:
            max_cols = 2
        elif layout_hint == "3cols" and cw <= 380:
            max_cols = 3
        row = [(el, cw, ch)]
        while len(row) < max_cols and idx + len(row) < len(body_queue):
            nxt_el, nxt_w, nxt_h = body_queue[idx + len(row)]
            if abs(nxt_w - cw) <= 16 and abs(nxt_h - ch) <= 40:
                row.append((nxt_el, nxt_w, nxt_h))
            else:
                break
        row_h = max(item[2] for item in row)
        if cursor_y + row_h > body_bottom and cursor_y < body_bottom - 48:
            row_h = max(48.0, body_bottom - cursor_y)
        n = len(row)
        if n == 1:
            w0 = min(cw, content_w)
            x0 = margin if w0 >= content_w - 40 else round((W - w0) / 2, 1)
            row[0][0]["box"] = {"x": x0, "y": round(cursor_y, 1), "w": w0, "h": round(min(row[0][2], row_h), 1)}
        else:
            gap = (content_w - sum(item[1] for item in row)) / max(n - 1, 1)
            if gap < 16:
                col_w = (content_w - 24.0 * (n - 1)) / n
                gap = 24.0
            else:
                col_w = None
            cx = margin
            for r_el, r_w, r_h in row:
                rw = col_w if col_w is not None else r_w
                r_el["box"] = {"x": round(cx, 1), "y": round(cursor_y, 1), "w": round(rw, 1), "h": round(min(r_h, row_h), 1)}
                cx += rw + gap
        cursor_y += row_h + 24.0
        idx += n


def prepare_data(config, base, *, auto_normalize=False):
    from . import components, master_regions, themes
    if auto_normalize:
        raw_libs = config.get("libraries", []) if isinstance(config, dict) else []
        lib_paths = [_resolve_library(base, item) for item in raw_libs] if isinstance(raw_libs, list) else []
        theme_id = config.get("theme", themes.DEFAULT_THEME) if isinstance(config, dict) else themes.DEFAULT_THEME
        pre_libs = components.load_libraries(lib_paths, palette=themes.palette(theme_id if theme_id in themes.THEMES else themes.DEFAULT_THEME))
        config = normalize_deck(config, pre_libs)

    _keys(config, ["schemaVersion", "title", "master", "libraries", "pageSize", "pageCount", "pages", "theme", "autoFitFonts", "minFontSize", "masterRegions"], "配置")
    if type(config.get("schemaVersion")) is not int or config["schemaVersion"] != 1:
        raise ValueError("schemaVersion 必须为 1")
    if not isinstance(config.get("title", "未命名演示"), str):
        raise ValueError("title 必须是字符串")
    auto_fit = config.get("autoFitFonts", False)
    if not isinstance(auto_fit, bool):
        raise ValueError("autoFitFonts 必须是布尔值")
    min_font = config.get("minFontSize", 12)
    if isinstance(min_font, bool) or type(min_font) is not int or not 8 <= min_font <= 24:
        raise ValueError("minFontSize 必须是 8 到 24 的整数")
    size = config.get("pageSize", dict(DEFAULT_SIZE))
    _keys(size, ["width", "height"], "pageSize")
    for key in ["width", "height"]:
        _number(size.get(key), f"pageSize.{key}", 100, 10000)
    global_regions = master_regions.validate_options(config.get("masterRegions", {}), size["height"])
    pages = config.get("pages")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 200:
        raise ValueError("pages 必须包含 1 到 200 个页面")
    if "pageCount" in config and (type(config["pageCount"]) is not int or config["pageCount"] != len(pages)):
        raise ValueError("pageCount 必须与 pages 数量一致")
    theme = config.get("theme", themes.DEFAULT_THEME)
    if not isinstance(theme, str) or theme not in themes.THEMES:
        raise ValueError(f"theme 必须是以下主题之一：{', '.join(themes.theme_ids())}")
    library_paths = config.get("libraries", [])
    if not isinstance(library_paths, list):
        raise ValueError("libraries 必须是数组")
    resolved_libs = [_resolve_library(base, item) for item in library_paths]
    libraries = components.load_libraries(resolved_libs, palette=themes.palette(theme))
    master = _asset(base, config["master"], "master") if "master" in config else None
    master_info = master_regions.inspect_master(master) if master else None
    compiled = []
    page_ids = set()
    for index, page in enumerate(pages, 1):
        label = f"pages[{index - 1}]"
        _keys(page, ["id", "masterSlide", "elements", "masterRegions", "layout"], label)
        page_regions = master_regions.validate_options(page.get("masterRegions", {}), size["height"], label + ".masterRegions")
        page_id = page.get("id")
        if not isinstance(page_id, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,79}", page_id) or page_id in page_ids:
            raise ValueError(f"{label}.id 必须是唯一的字母开头 ID（字母、数字、下划线、连字符，最多 80 字符）")
        page_ids.add(page_id)
        slide = page.get("masterSlide", 1)
        if type(slide) is not int or not 1 <= slide <= (master_info["pageCount"] if master_info else 1):
            raise ValueError(f"{label}.masterSlide 超出母版页面范围")
        elements = page.get("elements")
        if not isinstance(elements, list) or len(elements) > 300:
            raise ValueError(f"{label}.elements 必须是最多 300 个元素的数组")
        regions = master_regions.resolve_regions(size, master_regions.scaled_regions(master_info, slide, size), global_regions, page_regions)
        _auto_place_page(page, libraries, size, regions)
        nodes, element_ids = [], set()
        element_nodes = []
        for e_index, element in enumerate(elements):
            e_label = f"{label}.elements[{e_index}]"
            _keys(element, ["id", "component", "box", "inputs", "region", "slot"], e_label)
            region = master_regions.element_region(element)
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
                compiled_nodes = components.compile_element({k: v for k, v in element.items() if k not in {"region", "slot"}}, libraries, base, size)
            except Exception as exc:
                raise ValueError(f"{e_label} ({e_id}): {exc}") from exc
            nodes.extend(compiled_nodes)
            element_nodes.append({"id": e_id, "component": element["component"], "region": region, "nodes": compiled_nodes})
        compiled.append({"id": page_id, "masterSlide": slide, "nodes": nodes, "elements": element_nodes, "masterRegions": regions})
    return {"config": config, "pageSize": size, "pages": compiled, "master": master, "resolvedLibraries": resolved_libs,
            "masterInfo": master_info, "title": config.get("title", "未命名演示"), "autoFitFonts": auto_fit, "minFontSize": min_font}


def prepare(config_path):
    return prepare_data(_read_json(config_path), config_path.parent)


def _directory_transaction(destination, overwrite, writer):
    """Build beside target, then publish; never recursively delete an arbitrary target."""
    if destination == Path(destination.anchor) or destination == Path.cwd().resolve():
        raise ValueError("输出目录必须是专用子目录")
    if destination.exists() and not destination.is_dir():
        raise ValueError("输出路径已存在且不是目录")
    marker = destination / ".pptx-builder-output"
    if destination.exists() and any(destination.iterdir()):
        if not overwrite:
            raise ValueError("输出目录非空；请使用新目录，或对本工具产物指定 --overwrite")
        if not marker.is_file() or marker.read_text(encoding="utf-8") != "pptx-builder-v1\n":
            raise ValueError("仅允许覆盖含本工具标记的输出目录；请改用新目录")
    destination.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".pptx-builder-", dir=destination.parent))
    backup = destination.with_name(".pptx-builder-backup-" + uuid.uuid4().hex)
    try:
        result = writer(stage)
        (stage / ".pptx-builder-output").write_text("pptx-builder-v1\n", encoding="utf-8")
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


def _render_prepared(prepared, base_dir, destination, overwrite, strict_layout=False):
    from . import components, layout_checks, pptx_backend
    if prepared["autoFitFonts"]:
        components.fit_fonts(prepared["pages"], min_font=prepared["minFontSize"])
    layout = layout_checks.audit_prepared(prepared)
    sources = ([prepared["master"]] if prepared["master"] else [])
    sources += prepared.get("resolvedLibraries", [])
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
        counts = [prepared["masterInfo"]["slides"][p["masterSlide"] - 1]["shapeCount"] for p in prepared["pages"]] if prepared["masterInfo"] else [0] * len(prepared["pages"])
        native = layout_checks.audit_pptx(stage / "presentation.pptx", static_counts=counts)
        checked_layout = layout_checks.merge_native(layout, native)
        (stage / "preview.html").write_text(components.render_preview(prepared["pages"], prepared["pageSize"], prepared["title"], checked_layout), encoding="utf-8")
        report = {"schemaVersion": 1, "title": prepared["title"], "pageCount": len(prepared["pages"]),
                  "pageSize": prepared["pageSize"], "elementCount": sum(len(p["elements"]) for p in prepared["config"]["pages"]),
                  "preview": "HTML 仅为内容预览，不显示原生 PPTX 母版；母版外观以 presentation.pptx 为准。",
                  "warnings": ["请在本地 PowerPoint 或 LibreOffice 检查文字换行及最终版式。"],
                  "layout": checked_layout, "nativeChecks": {"presentation.pptx": native},
                  "outputs": ["presentation.pptx", "preview.html", "report.json"]}
        _write_json(stage / "report.json", report)
        _write_json(stage / "deck.json", prepared["config"])
        if prepared["master"] is None:
            master.unlink()
        return {"output": str(destination), "pageCount": len(prepared["pages"]), "pptx": str(destination / "presentation.pptx"),
                "layoutChecked": True, "layoutStatus": checked_layout["status"], "layoutIssueCount": checked_layout["issueCount"],
                "report": str(destination / "report.json")}

    result = _directory_transaction(destination, overwrite, writer)
    result["strictLayoutFailed"] = bool(strict_layout and result["layoutIssueCount"])
    return result


def render(config_path, destination, overwrite, strict_layout=False):
    if config_path.is_relative_to(destination):
        raise ValueError("输出目录不能包含输入配置，请使用独立子目录")
    prepared = prepare(config_path)
    return _render_prepared(prepared, config_path.parent, destination, overwrite, strict_layout)


def starter(destination, overwrite, strict_layout=False):
    from . import layout_checks, pptx_backend, themes
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
        layout = layout_checks.audit_pptx(stage / "master.pptx")
        _write_json(stage / "report.json", {"schemaVersion": 1, "layout": layout, "nativeChecks": {"master.pptx": layout}})
        return {"output": str(destination), "configs": filenames, "master": "master.pptx", "layoutChecked": True,
                "layoutStatus": layout["status"], "layoutIssueCount": layout["issueCount"], "report": str(destination / "report.json")}
    result = _directory_transaction(destination, overwrite, writer)
    result["strictLayoutFailed"] = bool(strict_layout and result["layoutIssueCount"])
    return result


def parser():
    root = argparse.ArgumentParser(description="PPTX Builder：JSON + 原生 PPTX 母版 + 离线声明式元素库")
    commands = root.add_subparsers(dest="command", required=True)
    catalog = commands.add_parser("catalog", help="查看可用组件及输入")
    catalog.add_argument("--library", action="append", default=[], help="本地 library.json 或 studio，可重复")
    catalog.add_argument("--compact", action="store_true", help="精简输出（仅 ID/尺寸/槽位签名，节省模型上下文）")
    catalog.add_argument("--filter", help="按关键词过滤组件")
    catalog.add_argument("--id", help="只查看指定组件")
    validate = commands.add_parser("validate", help="完整校验配置及本地资源")
    validate.add_argument("config")
    validate.add_argument("--strict-layout", action="store_true", help="布局问题导致非零退出，仍输出诊断")
    inspect = commands.add_parser("inspect-master", help="读取母版标题/页脚保留高度及占位符来源")
    inspect.add_argument("source")
    render_cmd = commands.add_parser("render", help="生成可编辑 PPTX 和 HTML 内容预览")
    render_cmd.add_argument("config")
    quick = commands.add_parser("quick", help="一步生成/更新 PPTX（支持零坐标自动排版、内联 JSON 与内置模板）")
    quick.add_argument("--out", required=True)
    quick.add_argument("--template", default="technical-report", help="基础示例模板名（当未提供 pages 时使用）")
    quick.add_argument("--theme", help="主题 ID")
    quick.add_argument("--title", help="演示标题")
    quick.add_argument("--config", help="本地 JSON 文件路径或 -（stdin）")
    quick.add_argument("--json", help="内联 JSON 配置")
    quick.add_argument("--set", action="append", default=[], help="点路径覆盖，如 --set theme=navy")
    quick.add_argument("--no-auto-fit", action="store_true", help="禁用轻度字号自适应")
    quick.add_argument("--overwrite", action="store_true")
    quick.add_argument("--strict-layout", action="store_true")
    patch = commands.add_parser("patch", help="增量修改已有 deck.json，可选直接重新渲染")
    patch.add_argument("config")
    patch.add_argument("--patch", help="补丁 JSON 文件或 -")
    patch.add_argument("--json", help="内联补丁 JSON")
    patch.add_argument("--set", action="append", default=[], help="点路径覆盖，如 --set pages.0.elements.0.inputs.text=新标题")
    patch.add_argument("--render-out", help="修改后同时输出渲染到指定目录")
    patch.add_argument("--overwrite", action="store_true")
    patch.add_argument("--strict-layout", action="store_true")
    demo = commands.add_parser("demo", help="生成元素库可视化预览页 library-demo.html")
    demo.add_argument("--out", required=True)
    demo.add_argument("--library", action="append", default=[], help="本地 library.json 或 studio，可重复")
    demo.add_argument("--overwrite", action="store_true")
    for command in (render_cmd, commands.add_parser("starter", help="生成默认母版和全部场景示例（含示例图片）"),
                    commands.add_parser("extract", help="从现有 PPTX 提取元素库、母版和配置")):
        if command.prog.endswith("extract"):
            command.add_argument("source")
        command.add_argument("--out", required=True)
        command.add_argument("--overwrite", action="store_true")
        command.add_argument("--strict-layout", action="store_true", help="布局有问题时返回非零，保留报告及诊断产物")
    return root


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = parser().parse_args(argv)
    try:
        from . import components, layout_checks, master_regions, pptx_backend
        if args.command == "catalog":
            lib_paths = [STUDIO_LIBRARY if p == "studio" else _local_argument(p) for p in args.library]
            result = components.catalog(components.load_libraries(lib_paths), compact=args.compact, filter_text=args.filter, comp_id=args.id)
        elif args.command == "validate":
            prepared = prepare(_local_argument(args.config))
            if prepared["autoFitFonts"]:
                components.fit_fonts(prepared["pages"], min_font=prepared["minFontSize"])
            layout = layout_checks.audit_prepared(prepared)
            result = {"valid": True, "pageCount": len(prepared["pages"]), "pageSize": prepared["pageSize"],
                      "layoutChecked": True, "layoutStatus": layout["status"], "layoutIssueCount": layout["issueCount"],
                      "layoutIssues": layout["issues"], "masterRegions": layout["masterRegions"],
                      "strictLayoutFailed": bool(args.strict_layout and layout["issueCount"])}
        elif args.command == "inspect-master":
            result = master_regions.inspect_master(_local_argument(args.source))
        elif args.command == "render":
            result = render(_local_argument(args.config), _local_argument(args.out), args.overwrite, args.strict_layout)
        elif args.command == "quick":
            base_dir = Path.cwd().resolve()
            override = {}
            if args.config or args.json:
                override = _load_json_input(args.config, args.json)
                if not isinstance(override, dict):
                    raise ValueError("quick 输入配置必须是对象")
                if args.config and args.config != "-" and not args.config.strip().startswith("{"):
                    base_dir = _local_argument(args.config).parent
            if "pages" in override:
                config = override
            else:
                tpl = SKILL_ROOT / "examples" / f"{args.template}.json"
                if not tpl.is_file():
                    raise ValueError(f"未知示例模板：{args.template}")
                config = _merge(_read_json(tpl), override)
            if args.theme:
                config["theme"] = args.theme
            if args.title:
                config["title"] = args.title
            config = _apply_sets(config, args.set)
            if not args.no_auto_fit and "autoFitFonts" not in config:
                config["autoFitFonts"] = True
            config.setdefault("masterRegions", {"detect": True, "titleHeight": 96, "footerHeight": 32})
            dest = _local_argument(args.out)
            overwrite = args.overwrite or (dest / ".pptx-builder-output").is_file()
            prepared = prepare_data(config, base_dir, auto_normalize=True)
            result = _render_prepared(prepared, base_dir, dest, overwrite, args.strict_layout)
        elif args.command == "patch":
            cfg_path = _local_argument(args.config)
            config = _read_json(cfg_path)
            if args.patch or args.json:
                p_obj = _load_json_input(args.patch, args.json)
                if not isinstance(p_obj, dict):
                    raise ValueError("补丁必须是对象")
                config = _merge(config, p_obj)
            config = _apply_sets(config, args.set)
            config = normalize_deck(config)
            _write_json(cfg_path, config)
            if args.render_out:
                dest = _local_argument(args.render_out)
                overwrite = args.overwrite or (dest / ".pptx-builder-output").is_file()
                prepared = prepare_data(config, cfg_path.parent, auto_normalize=True)
                result = _render_prepared(prepared, cfg_path.parent, dest, overwrite, args.strict_layout)
            else:
                result = {"patched": True, "config": str(cfg_path), "pageCount": len(config.get("pages", []))}
        elif args.command == "demo":
            from . import demo
            lib_paths = [STUDIO_LIBRARY if p == "studio" else _local_argument(p) for p in args.library]
            result = demo.build(_local_argument(args.out), lib_paths, args.overwrite)
        elif args.command == "starter":
            result = starter(_local_argument(args.out), args.overwrite, args.strict_layout)
        else:
            source, destination = _local_argument(args.source), _local_argument(args.out)
            if source.is_relative_to(destination):
                raise ValueError("输出目录不能包含输入 PPTX，请使用独立子目录")
            pptx_backend.inspect_pptx(source)
            def writer(stage):
                result = pptx_backend.extract_pptx(source, stage)
                layout = layout_checks.audit_pptx(stage / "master.pptx")
                report = _read_json(stage / "extraction-report.json")
                report.update(layout=layout, nativeChecks={"master.pptx": layout})
                _write_json(stage / "extraction-report.json", report)
                result.update(layoutChecked=True, layoutStatus=layout["status"], layoutIssueCount=layout["issueCount"],
                              strictLayoutFailed=bool(args.strict_layout and layout["issueCount"]),
                              report=str(destination / "extraction-report.json"))
                result["output"] = str(destination)
                return result
            result = _directory_transaction(destination, args.overwrite, writer)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2 if result.get("strictLayoutFailed") else 0
    except ModuleNotFoundError as exc:
        print(json.dumps({"error": f"缺少本地依赖：{exc.name}。请使用内网 wheel 目录离线安装 scripts/requirements.txt；本工具不会联网安装。"}, ensure_ascii=False), file=sys.stderr)
        return 2
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
