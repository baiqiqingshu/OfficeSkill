"""Safe declarative HTML components compiled to an editable slide scene.

This is deliberately not a browser. It supports a small, documented HTML/CSS
subset and never evaluates scripts, loads stylesheets, or requests a URL.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass, field
from html import escape
from html.parser import HTMLParser
import json
import math
from pathlib import Path
import re
from typing import Any


TAGS = set("div section article p h1 h2 h3 h4 h5 h6 span strong b em i u br img table thead tbody tr th td ul ol li".split())
INLINE = set("span strong b em i u br".split())
INPUT_TYPES = {"text", "richtext", "image", "table", "list"}
CSS_KEYS = set("position left top width height font-family font-size font-weight font-style text-decoration color background background-color padding border border-width border-style border-color border-radius text-align vertical-align white-space box-sizing line-height letter-spacing".split())
STYLE_KEYS = {"fontFamily", "fontSize", "color", "bold", "italic", "underline"}
# Style fields a table's <th> may contribute; table cells only carry text and
# shape properties, so alignment/padding/fill/border are included explicitly.
HEADER_STYLE_KEYS = {"fontFamily", "fontSize", "color", "bold", "italic", "underline", "align", "verticalAlign", "padding", "fill", "borderColor", "borderWidth", "borderRadius"}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"}
DEFAULT_STYLE = {"fontFamily": "Microsoft YaHei", "fontSize": 24, "color": "#17324D", "bold": False, "italic": False, "underline": False, "align": "left", "verticalAlign": "top", "padding": 0}


def _fail(message: str):
    raise ValueError(message)


def _object_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            _fail(f"JSON 字段重复：{key}")
        result[key] = value
    return result


def _json(path: Path):
    if path.stat().st_size > 2 * 1024 * 1024:
        _fail(f"JSON 文件过大：{path.name}")
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=_object_pairs,
                          parse_constant=lambda x: _fail(f"JSON 不允许 {x}"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"无法读取 JSON：{path.name}：{exc}") from exc


def _identifier(value, label="ID"):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,79}", value):
        _fail(f"{label} 须为字母开头的字母、数字、下划线或连字符")
    return value


def _number(value, label, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        _fail(f"{label} 须为有限数字")
    if positive and value <= 0:
        _fail(f"{label} 须大于 0")
    return float(value)


def _safe_root(value):
    raw = str(value)
    if raw.startswith(("\\\\", "//")) or re.match(r"^[A-Za-z][A-Za-z0-9+.-]{1,}:", raw):
        _fail("只允许本机文件，拒绝 URL 或 UNC 路径")
    result = Path(raw).resolve()
    if str(result).startswith(("\\\\", "//")):
        _fail("路径解析到网络共享")
    return result


def _resource(value, root: Path, *, image=False):
    if not isinstance(value, str) or not value or "\x00" in value:
        _fail("资源路径须为非空相对路径")
    normalized = value.replace("\\", "/")
    if ":" in normalized or normalized.startswith("/") or ".." in normalized.split("/"):
        _fail(f"资源路径必须位于资源目录内：{value}")
    root = _safe_root(root)
    result = (root / normalized).resolve()
    if not result.is_relative_to(root) or str(result).startswith(("\\\\", "//")):
        _fail(f"资源路径越界：{value}")
    if not result.is_file():
        _fail(f"资源不存在：{value}")
    if image:
        if result.suffix.lower() not in IMAGE_SUFFIXES:
            _fail(f"仅允许本地 PNG/JPEG/GIF/BMP/WebP 图片：{value}")
        if result.stat().st_size > 32 * 1024 * 1024:
            _fail(f"图片大于 32 MiB：{value}")
        from PIL import Image
        with Image.open(result) as source:
            if source.width * source.height > 40_000_000:
                _fail(f"图片像素过多：{value}")
            source.verify()
    return result


def _color(value, *, allow_transparent=False):
    if not isinstance(value, str):
        _fail("颜色须为字符串")
    value = value.strip()
    if value.lower() == "transparent" and not allow_transparent:
        _fail("文字与边框颜色不支持 transparent；仅背景填充允许透明")
    names = {"black": "#000000", "white": "#FFFFFF", "red": "#FF0000", "blue": "#0000FF", "gray": "#808080", "grey": "#808080", "transparent": "transparent"}
    if value.lower() in names:
        return names[value.lower()]
    if re.fullmatch(r"#[0-9A-Fa-f]{3}", value):
        return "#" + "".join(c * 2 for c in value[1:]).upper()
    if re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
        return value.upper()
    _fail(f"颜色只支持 #RGB、#RRGGBB 或基本色名：{value}")


def _length(value, extent):
    match = re.fullmatch(r"(-?(?:\d+(?:\.\d*)?|\.\d+))(px|%)?", str(value).strip())
    if not match:
        _fail(f"尺寸只支持 px 或 %：{value}")
    number = float(match.group(1))
    if not math.isfinite(number):
        _fail("尺寸须为有限数字")
    return number * extent / 100 if match.group(2) == "%" else number


def _css(value):
    if not isinstance(value, str) or re.search(r"[<>\\]|url\s*\(|expression|@|/\*|!important", value, re.I):
        _fail("不支持的 CSS；禁止外链、脚本和注释")
    result = {}
    for item in value.split(";"):
        if not item.strip():
            continue
        if ":" not in item:
            _fail(f"CSS 声明缺少冒号：{item}")
        key, val = (x.strip() for x in item.split(":", 1))
        key = key.lower()
        if key not in CSS_KEYS:
            _fail(f"不支持的 CSS 属性：{key}")
        if key in result:
            _fail(f"CSS 属性重复：{key}")
        result[key] = val
    if result.get("position", "absolute") not in {"absolute", "relative"}:
        _fail("position 仅支持 absolute 或 relative")
    return result


@dataclass
class _Node:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)


class _Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = _Node("root")
        self.stack = [self.root]
        self.count = 0

    def handle_starttag(self, tag, attrs):
        self.count += 1
        if self.count > 1000 or len(self.stack) > 30:
            _fail("组件 HTML 过于复杂")
        if tag not in TAGS:
            _fail(f"不支持的 HTML 标签：{tag}")
        values = {}
        for key, value in attrs:
            if key not in {"style", "data-slot", "src", "alt", "class"} or key in values or value is None:
                _fail(f"不支持或重复的 HTML 属性：{key}")
            if key == "src" and tag != "img":
                _fail("src 仅允许用于 img")
            values[key] = value
        if "style" in values:
            _css(values["style"])
        if "data-slot" in values:
            _identifier(values["data-slot"], "输入 ID")
        node = _Node(tag, values)
        self.stack[-1].children.append(node)
        if tag not in {"br", "img"}:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in {"br", "img"}:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in {"br", "img"}:
            return
        if len(self.stack) <= 1 or self.stack[-1].tag != tag:
            _fail(f"HTML 标签没有正确闭合：{tag}")
        self.stack.pop()

    def handle_data(self, data):
        self.stack[-1].children.append(data)

    def handle_decl(self, decl):
        _fail("组件不允许 DOCTYPE/实体声明")

    def handle_pi(self, data):
        _fail("组件不允许处理指令")

    def unknown_decl(self, data):
        _fail("组件不允许声明")


def _parse(value):
    if not isinstance(value, str) or len(value.encode("utf-8")) > 1024 * 1024:
        _fail("组件 HTML 必须为不超过 1 MiB 的字符串")
    parser = _Parser()
    parser.feed(value)
    parser.close()
    if len(parser.stack) != 1:
        _fail("组件 HTML 标签没有闭合")
    return parser.root


_HEX_TOKEN = re.compile(r"#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b")


def _expand_hex(value):
    if re.fullmatch(r"#[0-9A-Fa-f]{3}", value):
        return "#" + "".join(char * 2 for char in value[1:])
    return value


def _palette_map(palette):
    """Normalize {fromHex: toHex} to expanded uppercase #RRGGBB pairs."""
    table = {}
    for source, target in (palette or {}).items():
        if not isinstance(source, str) or not isinstance(target, str):
            continue
        source = _expand_hex(source.strip()).upper()
        target = _expand_hex(target.strip()).upper()
        if re.fullmatch(r"#[0-9A-Fa-f]{6}", source) and re.fullmatch(r"#[0-9A-Fa-f]{6}", target):
            table[source] = target
    return table


def _apply_palette(html, table):
    """Whole-token replace canonical spec colors inside a component HTML string."""
    if not table:
        return html
    def replace(match):
        token = match.group(0)
        return table.get(_expand_hex(token).upper(), token)
    return _HEX_TOKEN.sub(replace, html)


def _walk(node):
    yield node
    for child in node.children:
        if isinstance(child, _Node):
            yield from _walk(child)


def load_libraries(paths, palette=None) -> dict:
    """Load the builtin library and local third-party manifests, never code.

    ``palette`` optionally maps spec-palette hexes (uppercase #RRGGBB) to target
    theme hexes; the swap happens on the raw HTML string before parsing, so a
    ``None`` palette preserves the component colors exactly.
    """
    builtin = Path(__file__).resolve().parents[2] / "assets/libraries/builtin/library.json"
    recolor = _palette_map(palette)
    result = {}
    libraries = set()
    for supplied in [builtin, *(paths or [])]:
        manifest = _safe_root(supplied)
        if manifest.is_dir():
            manifest = manifest / "library.json"
        if not manifest.is_file():
            _fail(f"元素库清单不存在：{manifest}")
        data = _json(manifest)
        if not isinstance(data, dict) or set(data) - {"schemaVersion", "id", "name", "components"}:
            _fail("元素库清单字段无效")
        if data.get("schemaVersion") != 1:
            _fail("元素库 schemaVersion 必须为 1")
        lid = _identifier(data.get("id"), "元素库 ID")
        if lid in libraries:
            _fail(f"元素库 ID 重复：{lid}")
        libraries.add(lid)
        components = data.get("components")
        if not isinstance(components, list) or not components or len(components) > 200:
            _fail("components 须为 1..200 个组件")
        for component in components:
            if not isinstance(component, dict) or set(component) - {"id", "name", "description", "size", "inputs", "html", "htmlFile"}:
                _fail("组件字段无效；仅支持声明式 HTML 和 inputs")
            cid = _identifier(component.get("id"), "组件 ID")
            key = f"{lid}/{cid}"
            if key in result:
                _fail(f"组件 ID 重复：{key}")
            size = component.get("size")
            if not isinstance(size, dict) or set(size) != {"width", "height"}:
                _fail(f"{key}.size 须包含 width/height")
            for dimension in size:
                if _number(size[dimension], f"{key}.size.{dimension}", True) > 8192:
                    _fail("组件原始宽高不得超过 8192px")
            inputs = component.get("inputs", {})
            if not isinstance(inputs, dict):
                _fail(f"{key}.inputs 须为对象")
            for slot, spec in inputs.items():
                _identifier(slot, "输入 ID")
                if not isinstance(spec, dict) or set(spec) - {"type", "required", "description"} or spec.get("type") not in INPUT_TYPES:
                    _fail(f"{key}/{slot} 输入定义无效")
                if "required" in spec and not isinstance(spec["required"], bool):
                    _fail("required 须为布尔值")
            if ("html" in component) == ("htmlFile" in component):
                _fail(f"{key} 须且只能提供 html 或 htmlFile")
            html = component.get("html")
            if "htmlFile" in component:
                file = _resource(component["htmlFile"], manifest.parent)
                if file.stat().st_size > 1024 * 1024:
                    _fail("组件 HTML 文件过大")
                html = file.read_text(encoding="utf-8-sig")
            tree = _parse(_apply_palette(html, recolor))
            slots = set()
            for node in _walk(tree):
                slot = node.attrs.get("data-slot")
                if slot:
                    if slot not in inputs:
                        _fail(f"{key} 的 HTML 引用了未声明输入：{slot}")
                    slots.add(slot)
                if "src" in node.attrs:
                    _resource(node.attrs["src"], manifest.parent, image=True)
            if set(inputs) - slots:
                _fail(f"{key} 的输入没有 HTML 绑定：{', '.join(sorted(set(inputs) - slots))}")
            result[key] = {**component, "libraryId": lid, "libraryName": str(data.get("name", lid)), "_root": manifest.parent, "_tree": tree}
    return result


def catalog(libraries):
    """Return the compact, JSON-serializable model-facing component catalog."""
    return {"schemaVersion": 1, "components": [
        {"id": key, "name": value.get("name", value["id"]), "description": value.get("description", ""), "size": value["size"], "inputs": value.get("inputs", {})}
        for key, value in libraries.items()]}


def _style(css, inherited, tag):
    style = {key: value for key, value in inherited.items() if key not in {"fill", "borderColor", "borderWidth", "padding", "borderRadius"}}
    style["padding"] = 0
    if tag in {"b", "strong", "th"}:
        style["bold"] = True
    if tag in {"i", "em"}:
        style["italic"] = True
    if tag == "u":
        style["underline"] = True
    for key, value in css.items():
        if key == "font-family":
            if not re.fullmatch(r"[\w\u0080-\uffff ,.'\"-]{1,160}", value):
                _fail("font-family 字符无效")
            style["fontFamily"] = value.split(",")[0].strip(" '\"")
        elif key == "font-size":
            size = _length(value, inherited.get("fontSize", 24))
            if not 1 <= size <= 240:
                _fail("font-size 须为 1..240px")
            style["fontSize"] = size
        elif key in {"color", "background", "background-color", "border-color"}:
            style[{"color": "color", "background": "fill", "background-color": "fill", "border-color": "borderColor"}[key]] = _color(value, allow_transparent=key in {"background", "background-color"})
        elif key == "font-weight":
            if value not in {"normal", "bold", "400", "500", "600", "700", "800", "900"}:
                _fail("font-weight 只支持 normal/bold/400..900")
            style["bold"] = value in {"bold", "600", "700", "800", "900"}
        elif key == "font-style":
            if value not in {"normal", "italic"}:
                _fail("font-style 只支持 normal/italic")
            style["italic"] = value == "italic"
        elif key == "text-decoration":
            if value not in {"none", "underline"}:
                _fail("text-decoration 只支持 none/underline")
            style["underline"] = value == "underline"
        elif key == "padding":
            parts = value.split()
            if len(parts) not in {1, 2, 4}:
                _fail("padding 支持 1、2 或 4 个 px 值")
            numbers = [_length(part, 0) for part in parts]
            if any(number < 0 or number > 100 for number in numbers):
                _fail("padding 须为 0..100px")
            style["padding"] = (numbers * 4 if len(numbers) == 1 else numbers * 2 if len(numbers) == 2 else numbers)
        elif key == "border-width":
            number = _length(value, 0)
            if number < 0 or number > 100:
                _fail("border-width 须为 0..100px")
            style["borderWidth"] = number
        elif key == "border":
            if value in {"none", "0"}:
                style["borderWidth"] = 0
                continue
            match = re.fullmatch(r"([\d.]+(?:px)?)\s+solid\s+(.+)", value)
            if not match:
                _fail("border 仅支持 '<宽度>px solid #颜色'")
            width = _length(match.group(1), 0)
            if not 0 <= width <= 100:
                _fail("border 宽度须为 0..100px")
            style.update(borderWidth=width, borderColor=_color(match.group(2)))
        elif key == "border-style":
            if value not in {"none", "solid"}:
                _fail("border-style 仅支持 solid/none")
            if value == "none":
                style["borderWidth"] = 0
        elif key == "border-radius":
            match = re.fullmatch(r"(\d+(?:\.\d*)?|\.\d+)(px|%)?", value)
            if not match:
                _fail("border-radius 仅支持 '<半径>px' 或 50%")
            radius = float(match.group(1))
            if not math.isfinite(radius) or not 0 <= radius <= 999:
                _fail("border-radius 须为 0..999px")
            if match.group(2) == "%" and abs(radius - 50) > 1e-9:
                _fail("border-radius 百分比仅支持 50%")
            style["borderRadius"] = value
        elif key == "line-height":
            if not re.fullmatch(r"\d+(?:\.\d*)?|\.\d+", value):
                _fail("line-height 仅支持无单位倍数（如 1、1.5）")
            ratio = float(value)
            if not 0.8 <= ratio <= 3:
                _fail("line-height 须为 0.8..3.0 的倍数")
            style["lineHeight"] = ratio
        elif key == "letter-spacing":
            match = re.fullmatch(r"(-?(?:\d+(?:\.\d*)?|\.\d+))(px)?", value)
            if not match:
                _fail("letter-spacing 仅支持 '<值>px' 或无单位数字")
            spacing = float(match.group(1))
            if not -5 <= spacing <= 20:
                _fail("letter-spacing 须为 -5..20px")
            style["letterSpacing"] = spacing
        elif key == "text-align":
            if value not in {"left", "center", "right", "justify"}:
                _fail("text-align 无效")
            style["align"] = value
        elif key == "vertical-align":
            if value not in {"top", "middle", "bottom"}:
                _fail("vertical-align 无效")
            style["verticalAlign"] = value
        elif key == "box-sizing" and value != "border-box":
            _fail("仅支持 box-sizing:border-box")
        elif key == "white-space" and value != "pre-wrap":
            _fail("white-space 仅支持 pre-wrap")
    return style


def _runs(value, inherited=None):
    if value is None:
        return []
    if isinstance(value, str):
        if len(value) > 50000:
            _fail("单个文本输入超过 50000 字符")
        return [{"text": value}]
    if isinstance(value, dict) and set(value) == {"runs"}:
        value = value["runs"]
    if not isinstance(value, list) or len(value) > 500:
        _fail("文字须为字符串或 runs 数组")
    result = []
    for run in value:
        if not isinstance(run, dict) or set(run) - ({"text"} | STYLE_KEYS) or not isinstance(run.get("text"), str):
            _fail("富文本 run 字段无效")
        item = dict(run)
        for key in {"bold", "italic", "underline"} & item.keys():
            if not isinstance(item[key], bool):
                _fail(f"{key} 须为布尔值")
        if "fontSize" in item:
            if not 1 <= _number(item["fontSize"], "fontSize", True) <= 240:
                _fail("fontSize 须为 1..240")
        if "fontFamily" in item:
            if not isinstance(item["fontFamily"], str) or not re.fullmatch(r"[\w\u0080-\uffff .'-]{1,100}", item["fontFamily"]):
                _fail("fontFamily 无效")
        if "color" in item:
            item["color"] = _color(item["color"])
        result.append(item)
    if sum(len(item["text"]) for item in result) > 50000:
        _fail("单个文本输入超过 50000 字符")
    return result


def _static_runs(node, inherited, inputs=None, specs=None):
    slot = node.attrs.get("data-slot")
    if slot and inputs is not None:
        spec = (specs or {}).get(slot, {})
        if spec.get("type") not in {"text", "richtext"}:
            _fail("行内 data-slot 仅支持 text/richtext 输入")
        value = inputs.get(slot)
        if spec.get("type") == "text" and value is not None and not isinstance(value, str):
            _fail("text 输入须为字符串")
        defaults = {key: inherited[key] for key in STYLE_KEYS if key in inherited}
        return [{**defaults, **run} for run in _runs(value)]
    result = []
    for child in node.children:
        if isinstance(child, str):
            if child.strip():
                result.append({"text": child, **{key: inherited[key] for key in STYLE_KEYS if key in inherited}})
        elif child.tag == "br":
            result.append({"text": "\n"})
        else:
            result.extend(_static_runs(child, _style(_css(child.attrs.get("style", "")), inherited, child.tag), inputs, specs))
    return result


def _table_rows(value):
    if isinstance(value, dict) and set(value) == {"rows"}:
        value = value["rows"]
    if value is None:
        return []
    if not isinstance(value, list) or not 1 <= len(value) <= 100:
        _fail("表格 rows 须为 1..100 行")
    result = []
    count = None
    for row in value:
        if not isinstance(row, list) or not 1 <= len(row) <= 30:
            _fail("表格每行须为 1..30 个单元格")
        if count is None:
            count = len(row)
        if len(row) != count:
            _fail("表格每行列数须一致")
        result.append([cell if isinstance(cell, str) else _runs(cell) for cell in row])
    return result


def _table_header(node, table_style):
    """Return ``(headerRows, headerStyle)`` described by a table's thead/th markup.

    The header row count comes from ``<thead>`` (or from a first row made only of
    ``<th>``); the style comes from the first ``<th>`` so a data-slot table can
    borrow the header look without carrying its own row content.
    """
    thead = next((child for child in node.children if isinstance(child, _Node) and child.tag == "thead"), None)
    header_rows, first_th = 0, None
    if thead is not None:
        header_rows = sum(1 for row in thead.children if isinstance(row, _Node) and row.tag == "tr")
        first_th = next((cell for cell in _walk(thead) if cell.tag == "th"), None)
    else:
        first_row = next((row for row in _walk(node) if row.tag == "tr"), None)
        cells = [cell for cell in first_row.children if isinstance(cell, _Node) and cell.tag in {"td", "th"}] if first_row is not None else []
        if cells and all(cell.tag == "th" for cell in cells):
            header_rows, first_th = 1, cells[0]
    if not header_rows or first_th is None:
        return 0, {}
    computed = _style(_css(first_th.attrs.get("style", "")), table_style, "th")
    return header_rows, {key: value for key, value in computed.items() if key in HEADER_STYLE_KEYS}


def _scale_style(style, rect, scale):
    """Resolve a component-coordinate style into page pixels.

    ``border-radius`` is resolved against the element's own box (``50%`` becomes
    half of the shorter side, i.e. a circle) and then scaled with the other
    length-valued fields.
    """
    mapped = dict(style)
    if "borderRadius" in mapped:
        limit = min(rect["w"], rect["h"])
        mapped["borderRadius"] = min(_length(mapped["borderRadius"], limit), limit / 2)
    for name in {"fontSize", "padding", "borderWidth", "borderRadius", "letterSpacing"} & mapped.keys():
        value = mapped[name]
        mapped[name] = [part * scale for part in value] if isinstance(value, list) else value * scale
    return mapped


def compile_element(element, libraries, base_dir, page_size):
    """Compile one placed component to pixel-based native scene nodes."""
    if not isinstance(element, dict) or set(element) - {"id", "component", "box", "inputs"}:
        _fail("页面元素字段无效")
    _identifier(element.get("id"), "页面元素 ID")
    key = element.get("component")
    if key not in libraries:
        _fail(f"未知组件：{key}")
    component = libraries[key]
    inputs = element.get("inputs", {})
    if not isinstance(inputs, dict) or set(inputs) - set(component.get("inputs", {})):
        _fail(f"{element['id']} 存在未知输入")
    for slot, spec in component.get("inputs", {}).items():
        if spec.get("required") and (slot not in inputs or inputs[slot] is None):
            _fail(f"{element['id']} 缺少必填输入：{slot}")
    box = element.get("box", {"x": 0, "y": 0, "w": component["size"]["width"], "h": component["size"]["height"]})
    if not isinstance(box, dict) or set(box) != {"x", "y", "w", "h"}:
        _fail("box 须包含 x/y/w/h")
    box = {key: _number(value, f"box.{key}", key in {"w", "h"}) for key, value in box.items()}
    if box["x"] < 0 or box["y"] < 0 or box["x"] + box["w"] > page_size["width"] + .01 or box["y"] + box["h"] > page_size["height"] + .01:
        _fail(f"{element['id']} 的 box 超出页面")
    sx, sy = box["w"] / component["size"]["width"], box["h"] / component["size"]["height"]
    scale = min(sx, sy)
    output = []

    def emit(kind, rect, style, **content):
        if rect["w"] <= 0 or rect["h"] <= 0:
            _fail(f"{element['id']} 的 HTML 元素宽高须大于 0")
        if rect["x"] < -.01 or rect["y"] < -.01 or rect["x"] + rect["w"] > component["size"]["width"] + .01 or rect["y"] + rect["h"] > component["size"]["height"] + .01:
            _fail(f"{element['id']} 的 HTML 元素超出组件原始 size")
        mapped = _scale_style(style, rect, scale)
        if "runs" in content:
            content["runs"] = [{**run, **({"fontSize": run["fontSize"] * scale} if "fontSize" in run else {})} for run in content["runs"]]
        if "rows" in content:
            content["rows"] = [[cell if isinstance(cell, str) else [{**run, **({"fontSize": run["fontSize"] * scale} if "fontSize" in run else {})} for run in cell] for cell in row] for row in content["rows"]]
        if "headerStyle" in content:
            content["headerStyle"] = _scale_style(content["headerStyle"], rect, scale)
        output.append({"type": kind, "x": box["x"] + rect["x"] * sx, "y": box["y"] + rect["y"] * sy, "w": rect["w"] * sx, "h": rect["h"] * sy, "style": mapped, **content})

    def visit(node, parent, inherited):
        css = _css(node.attrs.get("style", ""))
        style = _style(css, inherited, node.tag)
        rect = {"x": parent["x"] + _length(css.get("left", "0"), parent["w"]), "y": parent["y"] + _length(css.get("top", "0"), parent["h"]), "w": _length(css.get("width", "100%"), parent["w"]), "h": _length(css.get("height", "100%"), parent["h"])}
        slot = node.attrs.get("data-slot")
        spec = component.get("inputs", {}).get(slot, {})
        value = inputs.get(slot)
        kind = spec.get("type")
        if style.get("fill", "transparent") != "transparent" or style.get("borderWidth", 0) > 0:
            emit("rect", rect, style)
        if node.tag == "img" or kind == "image":
            source = value if slot else node.attrs.get("src")
            if isinstance(source, dict):
                if set(source) - {"src", "alt"}:
                    _fail("图片输入仅支持 src/alt")
                source = source.get("src")
            if source:
                emit("image", rect, style, src=str(_resource(source, Path(base_dir) if slot else component["_root"], image=True)))
            return
        if node.tag == "table" or kind == "table":
            header_rows, header_style = _table_header(node, style)
            if slot:
                rows = _table_rows(value)
            else:
                rows = [[_static_runs(cell, style, inputs, component.get("inputs", {})) for cell in tr.children if isinstance(cell, _Node) and cell.tag in {"td", "th"}] for tr in _walk(node) if tr.tag == "tr"]
                rows = _table_rows(rows) if rows else []
            if rows:
                emit("table", rect, style, rows=rows, headerRows=min(header_rows, len(rows)), headerStyle=header_style)
            return
        if slot:
            if kind == "list":
                if value is None:
                    return
                if not isinstance(value, list) or len(value) > 100:
                    _fail("list 输入须为最多 100 项的数组")
                classes = set(node.attrs.get("class", "").split())
                color = style.get("color")
                marker_style = {"bold": True, **({"color": color} if color else {})}
                runs = []
                for index, item in enumerate(value):
                    if "check" in classes:
                        marker = "✓  "
                    elif "dash" in classes:
                        marker = "—  "
                    elif "num" in classes:
                        marker = f"{index + 1}. "
                    else:
                        marker = f"{index + 1}. " if node.tag == "ol" else "•  "
                    runs += [{"text": ("\n" if index else "") + marker, **marker_style}, *_runs(item)]
            elif kind in {"text", "richtext"}:
                if kind == "text" and value is not None and not isinstance(value, str):
                    _fail("text 输入须为字符串；富文本请声明 richtext")
                runs = _runs(value)
            else:
                _fail(f"不支持的输入类型：{kind}")
            if runs:
                emit("text", rect, style, runs=runs)
            return
        children = [child for child in node.children if isinstance(child, _Node)]
        if not children or all(child.tag in INLINE for child in children):
            runs = _static_runs(node, style, inputs, component.get("inputs", {}))
            if runs:
                emit("text", rect, style, runs=runs)
        else:
            if any(isinstance(child, str) and child.strip() for child in node.children):
                _fail("块容器不能混用直接文字与块级子元素，请增加 span/p 并显式定位")
            for child in children:
                visit(child, rect, style)

    rootbox = {"x": 0, "y": 0, "w": component["size"]["width"], "h": component["size"]["height"]}
    for child in component["_tree"].children:
        if isinstance(child, _Node):
            visit(child, rootbox, DEFAULT_STYLE)
        elif child.strip():
            _fail("组件根文字须包含在 HTML 标签内")
    return output


def _padding_css(value):
    """Serialize a padding value (number or 1/2/4-length list) to a CSS shorthand."""
    if isinstance(value, (list, tuple)):
        return " ".join(f"{float(part):g}px" for part in value)
    return f"{float(value or 0):g}px"


def _preview_style(style):
    names = {"fontFamily": "font-family", "fontSize": "font-size", "color": "color", "fill": "background-color", "align": "text-align", "padding": "padding"}
    values = []
    for key, css in names.items():
        if key in style:
            value = style[key]
            if key in {"fontSize", "padding"}:
                value = " ".join(f"{part:g}px" for part in value) if isinstance(value, list) else f"{value:g}px"
            values.append(f"{css}:{value}")
    if "bold" in style:
        values.append("font-weight:" + ("bold" if style["bold"] else "normal"))
    if "italic" in style:
        values.append("font-style:" + ("italic" if style["italic"] else "normal"))
    if "underline" in style:
        values.append("text-decoration:" + ("underline" if style["underline"] else "none"))
    if "borderRadius" in style:
        radius = style["borderRadius"]
        values.append(f"border-radius:{radius:g}px" if isinstance(radius, (int, float)) else f"border-radius:{radius}")
    if "lineHeight" in style:
        values.append(f"line-height:{float(style['lineHeight']):g}")
    if "letterSpacing" in style:
        values.append(f"letter-spacing:{float(style['letterSpacing']):g}px")
    if style.get("borderWidth", 0):
        values.append(f"border:{style['borderWidth']:g}px solid {style.get('borderColor', '#000000')}")
    return ";".join(values)


def _preview_cell_style(style, fallback_border="#C5D3DF"):
    """Cell-level CSS: font/fill from the style, border and padding on the cell."""
    base = _preview_style({key: value for key, value in style.items() if key not in {"padding", "borderWidth", "borderColor"}})
    width = style.get("borderWidth", 0) or 0
    border = f"border:{width:g}px solid {style.get('borderColor', fallback_border)}" if width > 0 else "border:0"
    return ";".join(part for part in (base, border, "padding:" + _padding_css(style.get("padding", 0)),
                                      "white-space:pre-wrap;overflow-wrap:anywhere") if part)


def _preview_runs(runs, inherited=None):
    defaults = {key: value for key, value in (inherited or {}).items() if key in STYLE_KEYS}
    return "".join(f'<span style="{escape(_preview_style({**defaults, **run}), quote=True)}">{escape(run["text"])}</span>' for run in runs)


def _preview_node_html(node):
    """Render one compiled scene node to an absolutely-positioned HTML fragment.

    Shared by render_preview (page canvases) and the library demo gallery; the
    image branch reads the verified local file and embeds it as a data URI.
    """
    positioning = f'position:absolute;left:{node["x"]:g}px;top:{node["y"]:g}px;width:{node["w"]:g}px;height:{node["h"]:g}px;'
    css = positioning + _preview_style(node.get("style", {}))
    kind = node["type"]
    if kind == "text":
        # Decorations belong on each run so an explicit false can clear
        # a template's underline/bold/italic for only part of a sentence.
        css = positioning + _preview_style({key: value for key, value in node.get("style", {}).items() if key not in {"bold", "italic", "underline"}})
        body = _preview_runs(node.get("runs", []), node.get("style", {}))
        vertical = node.get("style", {}).get("verticalAlign", "top")
        content_style = {"top": "flex-start", "middle": "center", "bottom": "flex-end"}.get(vertical, "flex-start")
        return f'<div class="text" style="{escape(css, quote=True)};display:flex;flex-direction:column;justify-content:{content_style}"><div>{body}</div></div>'
    if kind == "image":
        from io import BytesIO
        from PIL import Image, ImageOps
        with Image.open(node["src"]) as source:
            image = ImageOps.exif_transpose(source)
            stream = BytesIO()
            image.convert("RGBA").save(stream, format="PNG")
        uri = "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode("ascii")
        return f'<img alt="" style="{escape(css, quote=True)};object-fit:contain" src="{uri}">'
    if kind == "table":
        style = node.get("style", {})
        rows = node.get("rows", [])
        header_rows = min(int(node.get("headerRows") or 0), len(rows))
        header_style = node.get("headerStyle") or {}
        # Padding and borders belong to the cells; the table only carries the
        # font/background of the whole grid plus the collapsed-border model.
        css = positioning + _preview_style({key: value for key, value in style.items() if key not in {"padding", "borderWidth", "borderColor", "bold", "italic", "underline"}})
        css += ";table-layout:fixed;border-collapse:collapse"
        cells_html = []
        for index, row in enumerate(rows):
            head = index < header_rows
            cell_style = {**style, **header_style} if head else style
            tag = "th" if head else "td"
            attributes = f' style="{escape(_preview_cell_style(cell_style), quote=True)}"'
            cells = [f'<{tag}{attributes}>{_preview_runs([{"text": cell}] if isinstance(cell, str) else cell, cell_style)}</{tag}>' for cell in row]
            cells_html.append("<tr>" + "".join(cells) + "</tr>")
        head_html = "".join(cells_html[:header_rows])
        body_html = "".join(cells_html[header_rows:])
        return (f'<table style="{escape(css, quote=True)}">'
                + (f"<thead>{head_html}</thead>" if head_html else "")
                + (f"<tbody>{body_html}</tbody>" if body_html else "") + "</table>")
    if kind == "line":
        return f'<div style="{escape(css, quote=True)};border-top:1px solid #17324D"></div>'
    if kind == "rect":
        return f'<div style="{escape(css, quote=True)}"></div>'
    return ""


_PREVIEW_CSS = """*{box-sizing:border-box}
html,body{margin:0}
body{background:#eef2f7;color:#17324d;font-family:"Microsoft YaHei","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 20px;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid #dbe4ee}
.tb-title{display:flex;align-items:baseline;gap:10px;min-width:0;font-size:15px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tb-meta{font-size:12px;font-weight:normal;color:#6b7f93;white-space:nowrap}
.tb-tools{display:flex;align-items:center;gap:8px;flex:none}
.zoom{display:flex;background:#fff;border:1px solid #dbe4ee;border-radius:2px;overflow:hidden}
.zoom button{border:0;border-left:1px solid #eef2f7;background:#fff;color:#33506c;font:inherit;font-size:12px;padding:6px 12px;cursor:pointer}
.zoom button:first-child{border-left:0}
.zoom button:hover{background:#f2f7fc}
.zoom button.active{background:#1476b8;color:#fff}
.action{border:1px solid #dbe4ee;background:#fff;color:#33506c;font:inherit;font-size:12px;padding:6px 14px;border-radius:2px;cursor:pointer}
.action:hover{background:#f2f7fc}
.pager{position:fixed;left:0;top:0;bottom:0;z-index:20;width:64px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:74px 8px 24px;overflow:auto;background:#f8fbfe;border-right:1px solid #dbe4ee}
.pager button{width:38px;height:32px;flex:none;border:1px solid transparent;border-radius:2px;background:transparent;color:#4a6b88;font:inherit;font-size:12px;cursor:pointer}
.pager button:hover{background:#e8f1f9;border-color:#d3e2ee}
.pager button.active{background:#1476b8;border-color:#1476b8;color:#fff}
.stage{margin-left:64px;padding:24px 28px 64px;display:flex;flex-direction:column;align-items:center;gap:26px}
.slide-block{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;scroll-margin-top:74px}
.slide-holder{position:relative}
section.slide{position:relative;overflow:hidden;background:#fff;border:1px solid #d9e3ee;border-radius:2px;box-shadow:0 6px 22px rgba(23,50,77,.1);transform-origin:top left}
.caption{margin:0;font-size:12px;color:#7c8fa3}
.text{white-space:pre-wrap;overflow:hidden;line-height:1.2}
table{table-layout:fixed;border-collapse:collapse}
td,th{padding:0;white-space:pre-wrap;overflow-wrap:anywhere}
@media (max-width:899px){.pager{display:none}.stage{margin-left:0;padding:16px 12px 48px}}
@media print{body{background:#fff}.topbar,.pager,.caption{display:none}.stage{margin:0;padding:0;gap:0}.slide-block{width:auto;gap:0}.slide-holder{width:auto!important;height:auto!important}section.slide{transform:none!important;box-shadow:none;border:0;border-radius:0;break-after:page;page-break-after:always}}
"""

_PREVIEW_JS = """(function () {
  var PAGE_W = __PAGE_W__, PAGE_H = __PAGE_H__;
  var holder = Array.prototype.slice.call(document.querySelectorAll('.slide-holder'));
  var slide = Array.prototype.slice.call(document.querySelectorAll('section.slide'));
  var block = Array.prototype.slice.call(document.querySelectorAll('.slide-block'));
  var zoomButton = Array.prototype.slice.call(document.querySelectorAll('[data-zoom]'));
  var navButton = Array.prototype.slice.call(document.querySelectorAll('[data-goto]'));
  var stage = document.querySelector('.stage');
  var STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  var mode = 'fit', scale = 1, active = 1;

  function fitScale() {
    var available = stage ? stage.clientWidth - 56 : PAGE_W;
    if (available <= 0) available = PAGE_W;
    return Math.max(0.1, Math.min(1, available / PAGE_W));
  }
  function paint() {
    scale = mode === 'fit' ? fitScale() : parseFloat(mode);
    holder.forEach(function (node) {
      node.style.width = Math.round(PAGE_W * scale) + 'px';
      node.style.height = Math.round(PAGE_H * scale) + 'px';
    });
    slide.forEach(function (node) { node.style.transform = 'scale(' + scale + ')'; });
    zoomButton.forEach(function (node) { node.classList.toggle('active', node.dataset.zoom === mode); });
  }
  function mark(page) {
    active = page;
    navButton.forEach(function (node) {
      var on = parseInt(node.dataset.goto, 10) === page;
      node.classList.toggle('active', on);
      if (on) node.setAttribute('aria-current', 'true'); else node.removeAttribute('aria-current');
    });
  }
  function goTo(index) {
    var target = block[Math.max(0, Math.min(block.length - 1, index))];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function step(direction) {
    var next = null;
    STEPS.forEach(function (value) {
      if (direction > 0 && value > scale + 0.001 && next === null) next = value;
    });
    if (direction < 0) STEPS.slice().reverse().forEach(function (value) {
      if (value < scale - 0.001 && next === null) next = value;
    });
    if (next !== null) { mode = String(next); paint(); }
  }

  zoomButton.forEach(function (node) {
    node.addEventListener('click', function () { mode = node.dataset.zoom; paint(); });
  });
  navButton.forEach(function (node) {
    node.addEventListener('click', function () { goTo(parseInt(node.dataset.goto, 10) - 1); });
  });
  var print = document.querySelector('[data-print]');
  if (print) print.addEventListener('click', function () { window.print(); });

  document.addEventListener('keydown', function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    var key = event.key;
    if (key === '+' || key === '=') { event.preventDefault(); step(1); }
    else if (key === '-' || key === '_') { event.preventDefault(); step(-1); }
    else if (key === 'ArrowDown' || key === 'PageDown') { event.preventDefault(); goTo(active); }
    else if (key === 'ArrowUp' || key === 'PageUp') { event.preventDefault(); goTo(active - 2); }
    else if (key === 'Home') { event.preventDefault(); goTo(0); }
    else if (key === 'End') { event.preventDefault(); goTo(block.length - 1); }
  });

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) mark(parseInt(entry.target.dataset.page, 10));
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    block.forEach(function (node) { observer.observe(node); });
  } else {
    window.addEventListener('scroll', function () {
      var middle = window.scrollY + window.innerHeight / 2;
      block.forEach(function (node) {
        if (node.offsetTop <= middle && node.offsetTop + node.offsetHeight > middle) mark(parseInt(node.dataset.page, 10));
      });
    });
  }
  window.addEventListener('resize', function () { if (mode === 'fit') paint(); });
  mark(1);
  paint();
}());
"""


def render_preview(pages, page_size, title):
    """Render a self-contained, interactive offline content preview.

    The page shell (toolbar, page rail, zoom, keyboard paging) is inline
    JavaScript/CSS with no external requests; the slide sections themselves keep
    the absolute-positioned scene nodes produced by :func:`_preview_node_html`.
    """
    width, height = page_size["width"], page_size["height"]
    total = len(pages)
    blocks = []
    for index, page in enumerate(pages, 1):
        elements = []
        for node in page["nodes"]:
            fragment = _preview_node_html(node)
            if fragment:
                elements.append(fragment)
        blocks.append(f'<div class="slide-block" id="page-{index}" data-page="{index}">'
                      f'<div class="slide-holder" style="width:{width:g}px;height:{height:g}px">'
                      f'<section class="slide" aria-label="第 {index} 页" style="width:{width:g}px;height:{height:g}px">'
                      + "".join(elements) + "</section></div>"
                      f'<p class="caption">第 {index} 页 / 共 {total} 页</p></div>')
    nav = "".join(f'<button type="button" data-goto="{index}" aria-label="跳到第 {index} 页">{index}</button>'
                  for index in range(1, total + 1))
    script = (_PREVIEW_JS.replace("__PAGE_W__", f"{width:g}").replace("__PAGE_H__", f"{height:g}"))
    return ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(str(title))}</title>'
            f'<style>{_PREVIEW_CSS}</style></head><body>'
            f'<header class="topbar"><div class="tb-title">{escape(str(title))}<span class="tb-meta">共 {total} 页</span></div>'
            '<div class="tb-tools"><div class="zoom" role="group" aria-label="缩放">'
            '<button type="button" data-zoom="fit" class="active">适应窗口</button>'
            '<button type="button" data-zoom="1">100%</button>'
            '<button type="button" data-zoom="0.75">75%</button>'
            '<button type="button" data-zoom="0.5">50%</button></div>'
            '<button type="button" class="action" data-print>打印</button></div></header>'
            f'<nav class="pager" aria-label="页码导航">{nav}</nav>'
            '<main class="stage">' + "".join(blocks) + "</main>"
            f'<script>{script}</script></body></html>')
