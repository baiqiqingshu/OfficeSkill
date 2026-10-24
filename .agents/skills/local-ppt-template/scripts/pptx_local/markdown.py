"""Strict, documented Markdown subset with inherited run styles."""
from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
import json
import re

from .common import PptError, identifier, positive, require_keys


@dataclass
class Run:
    text: str
    style: dict = field(default_factory=dict)


@dataclass
class Paragraph:
    runs: list[Run]
    # None = 普通段落；("char", glyph, color|None, font|None) = 符号/图标分点；
    # ("num", autonum_type, start) = 数字编号分点
    marker: tuple | None = None
    level: int = 0


@dataclass
class Element:
    id: str
    kind: str
    content: str
    line: int


@dataclass
class Page:
    id: str
    layout: str
    elements: dict[str, Element] = field(default_factory=dict)


def parse_pages(text: str) -> list[Page]:
    pages = []
    page = None
    element = None
    body: list[str] = []
    fence = None

    def finish_element():
        nonlocal element, body
        if element is not None:
            element.content = "\n".join(body).strip("\n")
            page.elements[element.id] = element
        element, body = None, []

    for number, line in enumerate(text.splitlines(), start=1):
        marker = re.fullmatch(r"(`{3,})([A-Za-z0-9_-]*)\s*", line)
        if fence is not None:
            if marker and len(marker[1]) >= fence and not marker[2]:
                fence = None
            else:
                body.append(line)
            continue
        if marker:
            if element is None or element.kind not in {"image", "table", "array"} or body:
                raise PptError(f"MD 第 {number} 行：围栏仅用于 image/table/array 的 JSON 内容")
            if marker[2] != "json":
                raise PptError(f"MD 第 {number} 行：内容围栏必须标记 json")
            fence = len(marker[1])
            continue
        match = re.fullmatch(r"##\s+page:\s*([A-Za-z][\w-]*)\s+layout:\s*([A-Za-z][\w-]*)\s*", line)
        if match:
            finish_element()
            if any(p.id == match[1] for p in pages):
                raise PptError(f"MD 第 {number} 行：页面 ID 重复：{match[1]}")
            page = Page(identifier(match[1], "页面 ID"), identifier(match[2], "布局 ID"))
            pages.append(page)
            continue
        match = re.fullmatch(r"###\s+([A-Za-z][\w-]*)\s*:\s*(text|image|table|array)\s*", line)
        if match:
            if page is None:
                raise PptError(f"MD 第 {number} 行：元素必须位于页面内")
            finish_element()
            if match[1] in page.elements:
                raise PptError(f"MD 第 {number} 行：元素 ID 重复：{match[1]}")
            element = Element(identifier(match[1], "元素 ID"), match[2], "", number)
            continue
        if line.startswith(("## ", "### ")):
            raise PptError(f"MD 第 {number} 行：页面/元素标题格式错误")
        if element is not None:
            body.append(line)
        elif line.strip() and not (not pages and line.startswith("# ")):
            raise PptError(f"MD 第 {number} 行：内容必须位于元素标题下")
    if fence is not None:
        raise PptError("MD JSON 围栏没有闭合")
    finish_element()
    if not pages:
        raise PptError("MD 没有页面，请使用 ## page: page_id layout: layout_id")
    return pages


def span_style(value: str) -> dict:
    result = {}
    for declaration in value.split(";"):
        if not declaration.strip():
            continue
        if ":" not in declaration:
            raise PptError(f"span 样式格式无效：{declaration}")
        key, val = (p.strip() for p in declaration.split(":", 1))
        if key in result:
            raise PptError(f"span 样式重复：{key}")
        if key == "font-family":
            val = val.strip("\"'")
            if not val or any(c in val for c in "<>{}\n"):
                raise PptError("font-family 必须为单个本地字体名称")
        elif key == "font-size":
            if not re.fullmatch(r"\d+(?:\.\d+)?pt", val):
                raise PptError("font-size 仅支持 pt，例如 24pt")
            val = positive(float(val[:-2]), "font-size")
        elif key == "color":
            if not re.fullmatch(r"#[0-9A-Fa-f]{6}", val):
                raise PptError("color 必须为 #RRGGBB")
            val = val[1:].upper()
        elif key == "font-weight":
            if val not in {"bold", "normal"}:
                raise PptError("font-weight 仅支持 bold/normal")
            val = val == "bold"
        elif key == "font-style":
            if val not in {"italic", "normal"}:
                raise PptError("font-style 仅支持 italic/normal")
            val = val == "italic"
        elif key == "text-decoration":
            if val not in {"underline", "none"}:
                raise PptError("text-decoration 仅支持 underline/none")
            val = val == "underline"
        else:
            raise PptError(f"不支持的 span 样式：{key}")
        result[key] = val
    return result


class InlineParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, dict]] = []
        self.runs: list[Run] = []

    def style(self):
        result = {}
        for _, style in self.stack:
            result.update(style)
        return result

    def handle_starttag(self, tag, attrs):
        if tag not in {"span", "b", "strong", "i", "em", "u"}:
            raise PptError(f"仅支持 span/b/strong/i/em/u 行内标签：{tag}")
        if tag == "span":
            if len(attrs) != 1 or attrs[0][0] != "style" or attrs[0][1] is None:
                raise PptError("span 必须且仅包含 style 属性")
            style = span_style(attrs[0][1])
        else:
            if attrs:
                raise PptError(f"{tag} 不支持属性")
            style = {"font-weight": True} if tag in {"b", "strong"} else {"font-style": True} if tag in {"i", "em"} else {"text-decoration": True}
        self.stack.append((tag, style))

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1][0] != tag:
            raise PptError(f"行内标签没有正确嵌套：{tag}")
        self.stack.pop()

    def handle_startendtag(self, tag, attrs):
        raise PptError(f"不支持自闭合标签：{tag}")

    def handle_comment(self, data):
        raise PptError("文本元素不支持 HTML 注释")

    def handle_decl(self, decl):
        raise PptError("文本元素不支持 HTML 声明")

    def handle_data(self, data):
        self.runs.extend(markdown_runs(data, self.style()))


def markdown_runs(text: str, inherited: dict) -> list[Run]:
    """Nested **bold**, *italic*, ***both***, and backslash escapes."""
    result = []
    buffer = []
    style = dict(inherited)
    active = set()

    def flush():
        if buffer:
            result.append(Run("".join(buffer), dict(style)))
            buffer.clear()

    index = 0
    while index < len(text):
        if text[index] == "\\" and index + 1 < len(text):
            buffer.append(text[index + 1])
            index += 2
            continue
        marker = next((m for m in ("***", "**", "*") if text.startswith(m, index)), None)
        if marker:
            flush()
            keys = ("font-weight", "font-style") if marker == "***" else ("font-weight",) if marker == "**" else ("font-style",)
            for key in keys:
                if key in active:
                    active.remove(key)
                    if key in inherited:
                        style[key] = inherited[key]
                    else:
                        style.pop(key, None)
                else:
                    active.add(key)
                    style[key] = True
            index += len(marker)
        else:
            buffer.append(text[index])
            index += 1
    if active:
        raise PptError("加粗/斜体 Markdown 标记没有闭合；字面星号请使用反斜杠转义")
    flush()
    return result


def inline(text: str) -> list[Run]:
    parser = InlineParser()
    parser.feed(text)
    parser.close()
    if parser.stack:
        raise PptError("行内 HTML 标签没有闭合")
    return parser.runs or [Run("")]


def icon_marker(spec: str) -> tuple:
    """Parse `- [glyph; #RRGGBB; font:Name]` icon bullet declarations."""
    parts = [part.strip() for part in spec.split(";")]
    glyph = parts[0]
    if not glyph or len(glyph) > 8 or any(c in glyph for c in "<>[]{}\n"):
        raise PptError(f"图标分点符号须为 1-8 个字符：{spec}")
    color = font = None
    for mod in parts[1:]:
        if not mod:
            continue
        if mod.startswith("#"):
            if not re.fullmatch(r"#[0-9A-Fa-f]{6}", mod):
                raise PptError(f"图标颜色必须为 #RRGGBB：{mod}")
            color = mod[1:].upper()
        elif mod.startswith(("font:", "font=")):
            font = mod[5:].strip().strip("\"'")
            if not font or any(c in font for c in "<>{}\n;"):
                raise PptError(f"图标字体必须为单个本地字体名称：{mod}")
        else:
            raise PptError(f"图标分点修饰无效：{mod}（支持 #RRGGBB、font:字体名）")
    return ("char", glyph, color, font)


def paragraphs(text: str) -> list[Paragraph]:
    result = []

    def level_of(indent: str) -> int:
        if len(indent) % 2 or len(indent) > 16:
            raise PptError("分点缩进必须为 0..16 个空格，且为 2 的倍数")
        return len(indent) // 2

    for line in text.split("\n"):
        match = re.fullmatch(r"( *)(?:-|\*) \[([^\[\]]{1,64})\] (.*)", line)
        if match:
            result.append(Paragraph(inline(match[3]), icon_marker(match[2]), level_of(match[1])))
            continue
        match = re.fullmatch(r"( *)(\d{1,3})([.)]) (.*)", line)
        if match:
            kind = "arabicPeriod" if match[3] == "." else "arabicParenR"
            result.append(Paragraph(inline(match[4]), ("num", kind, int(match[2])), level_of(match[1])))
            continue
        match = re.fullmatch(r"( *)(?:-|\*) (.*)", line)
        if match:
            result.append(Paragraph(inline(match[2]), ("char", "•", None, None), level_of(match[1])))
            continue
        result.append(Paragraph(inline(line)))
    return result


def object_content(content: str) -> dict:
    def pairs(items):
        result = {}
        for key, val in items:
            if key in result:
                raise PptError(f"元素 JSON 键重复：{key}")
            result[key] = val
        return result

    try:
        value = json.loads(content, object_pairs_hook=pairs)
    except json.JSONDecodeError as exc:
        raise PptError(f"元素 JSON 格式错误：{exc}") from exc
    if not isinstance(value, dict):
        raise PptError("元素 JSON 必须为对象")
    return value


def image_value(value: dict) -> dict:
    require_keys(value, {"src", "fit", "width_cm", "height_cm", "alt"}, "image")
    if not isinstance(value.get("src"), str) or not value["src"]:
        raise PptError("image.src 必须为本地图片路径")
    if value.get("fit", "contain") not in {"contain", "cover"}:
        raise PptError("image.fit 仅支持 contain/cover")
    if "alt" in value and not isinstance(value["alt"], str):
        raise PptError("image.alt 必须为字符串")
    for key in ("width_cm", "height_cm"):
        if key in value:
            positive(value[key], key)
    return value


def image_content(content: str) -> dict:
    return image_value(object_content(content))


def array_content(content: str) -> list:
    """Parse an array element: Markdown `- item` lines or a JSON {"items": [...]} body.

    Returns a list of raw items: a plain string (one text field), a list of
    strings (multiple text fields split by `||`), or a dict (image item JSON).
    Field validation against the template happens in render.prepare.
    """
    if content.lstrip().startswith("{"):
        value = object_content(content)
        require_keys(value, {"items"}, "array")
        items = value["items"]
    else:
        items = []
        for line in content.splitlines():
            if not line.strip():
                continue
            match = re.fullmatch(r"- (.*)", line)
            if not match:
                raise PptError('数组内容每行须为 "- 条目"，或使用 JSON {"items":[...]}')
            body = match[1].strip()
            if body.startswith("{"):
                items.append(object_content(body))
            elif "||" in body:
                items.append([field.strip() for field in body.split("||")])
            else:
                items.append(body)
    if not isinstance(items, list) or not items:
        raise PptError("array.items 必须为非空数组")
    for item in items:
        if isinstance(item, list):
            if not item or any(not isinstance(field, str) for field in item):
                raise PptError("数组条目字段必须为字符串列表")
        elif not isinstance(item, (str, dict)):
            raise PptError("数组条目必须为字符串、字段列表或图片对象")
    return items


def table_content(content: str) -> dict:
    if content.lstrip().startswith("{"):
        value = object_content(content)
        require_keys(value, {"rows", "width_cm", "height_cm", "column_widths_cm"}, "table")
    else:
        lines = content.strip().splitlines()
        if len(lines) < 2:
            raise PptError("Markdown 表格需要表头和分隔行")

        def cells(line):
            line = line.strip()
            if not line.startswith("|") or not line.endswith("|"):
                raise PptError("表格行必须以 | 开始和结束")
            # Preserve backslash escapes for inline styles, except escaped pipes.
            values = re.split(r"(?<!\\)\|", line[1:-1])
            return [v.strip().replace("\\|", "|") for v in values]

        header = cells(lines[0])
        separators = cells(lines[1])
        if len(separators) != len(header) or any(not re.fullmatch(r":?-{3,}:?", s) for s in separators):
            raise PptError("表格分隔行必须为 --- / :--- / ---: / :---:")
        value = {"rows": [header] + [cells(line) for line in lines[2:]]}
    rows = value.get("rows")
    if not isinstance(rows, list) or not rows or any(not isinstance(row, list) or not row for row in rows):
        raise PptError("table.rows 必须为非空二维数组，包含表头")
    if any(len(row) != len(rows[0]) for row in rows) or any(not isinstance(cell, str) for row in rows for cell in row):
        raise PptError("表格每行列数必须一致，单元格必须为字符串")
    for key in ("width_cm", "height_cm"):
        if key in value:
            positive(value[key], key)
    if "column_widths_cm" in value:
        widths = value["column_widths_cm"]
        if not isinstance(widths, list) or len(widths) != len(rows[0]):
            raise PptError("column_widths_cm 必须与表格列数一致")
        for width in widths:
            positive(width, "column_widths_cm")
    return value
