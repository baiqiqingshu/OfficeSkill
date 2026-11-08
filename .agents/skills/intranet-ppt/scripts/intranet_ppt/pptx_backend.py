"""Offline native PPTX backend. HTML components never execute in this module.

Slide-package cloning is adapted from this repository's local-ppt-template
implementation; masters, layouts and themes remain native Office parts.
"""
from __future__ import annotations

from copy import deepcopy
from html import escape
from io import BytesIO
import json
import math
from pathlib import Path, PurePosixPath
import posixpath
import re
from zipfile import BadZipFile, ZipFile, ZIP_DEFLATED

from lxml import etree
from PIL import Image, ImageOps
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_SHAPE_TYPE, MSO_CONNECTOR
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.xmlchemy import OxmlElement
from pptx.util import Pt

P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"
NS = {"p": P, "r": R, "a": A}
EMU_PX = 9525  # 96 dpi


def _xml(data):
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise ValueError("PPTX 中不允许 DTD 或实体声明")
    try:
        return etree.fromstring(data, etree.XMLParser(resolve_entities=False, no_network=True))
    except etree.XMLSyntaxError as exc:
        raise ValueError(f"PPTX XML 无效：{exc}") from exc


def _serialize(root):
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def _package(data):
    if len(data) > 256 * 1024 * 1024:
        raise ValueError("PPTX 文件超过 256 MiB")
    try:
        with ZipFile(BytesIO(data)) as archive:
            entries = archive.infolist()
            names = [i.filename for i in entries]
            if len(entries) > 20000 or len(names) != len(set(names)):
                raise ValueError("PPTX ZIP 条目重复或数量过大")
            if sum(i.file_size for i in entries) > 512 * 1024 * 1024:
                raise ValueError("PPTX 解压后超过 512 MiB")
            for entry in entries:
                name = entry.filename
                if name.startswith(("/", "\\")) or "\\" in name or ".." in PurePosixPath(name).parts:
                    raise ValueError("PPTX ZIP 条目包含不安全路径")
                if entry.file_size > 100 * 1024 * 1024 or (entry.file_size > 1024 * 1024 and entry.file_size / max(entry.compress_size, 1) > 1000):
                    raise ValueError("PPTX ZIP 条目过大或压缩比异常")
                if entry.flag_bits & 1:
                    raise ValueError("不支持加密 PPTX ZIP")
            parts = {name: archive.read(name) for name in names}
    except (BadZipFile, OSError, RuntimeError) as exc:
        raise ValueError(f"无法读取 PPTX：{exc}") from exc
    if "ppt/presentation.xml" not in parts:
        raise ValueError("输入不是有效的 PPTX")
    for name, blob in parts.items():
        lower = name.lower()
        if any(token in lower for token in ("vbaproject", "/activex/", "/embeddings/")):
            raise ValueError("PPTX 包含宏、ActiveX 或 OLE/嵌入附件")
        if lower.endswith((".xml", ".rels")):
            root = _xml(blob)
            for node in root.iter():
                local = etree.QName(node).localname.lower() if isinstance(node.tag, str) else ""
                if local in {"oleobj", "control"}:
                    raise ValueError("PPTX 包含 OLE 或 ActiveX 控件")
                if local == "override" and any(t in node.get("ContentType", "").lower() for t in ("macroenabled", "vbaproject", "oleobject", "activex")):
                    raise ValueError("PPTX 包含活动内容类型")
            if lower.endswith(".rels"):
                for relationship in root:
                    target = relationship.get("Target", "")
                    kind = relationship.get("Type", "").lower()
                    if relationship.get("TargetMode", "").lower() == "external" or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", target) or target.startswith(("//", "\\\\")):
                        raise ValueError(f"PPTX 含外部关系：{name}")
                    if any(t in kind for t in ("oleobject", "activex", "vbaproject")):
                        raise ValueError("PPTX 含活动内容关系")
    return parts


def _local(path):
    raw = str(path)
    if raw.startswith(("//", "\\\\")) or re.match(r"^[A-Za-z][A-Za-z0-9+.-]+:", raw):
        raise ValueError("只允许本地文件，拒绝 URL/网络共享")
    resolved = Path(path).expanduser().resolve()
    if str(resolved).startswith(("//", "\\\\")):
        raise ValueError("路径解析到网络共享")
    return resolved


def _slide_names(parts):
    root = _xml(parts["ppt/presentation.xml"])
    rels = _xml(parts["ppt/_rels/presentation.xml.rels"])
    targets = {rel.get("Id"): posixpath.normpath(posixpath.join("ppt", rel.get("Target", ""))) if not rel.get("Target", "").startswith("/") else rel.get("Target").lstrip("/") for rel in rels}
    try:
        return [targets[s.get(f"{{{R}}}id")] for s in root.findall("p:sldIdLst/p:sldId", NS)]
    except KeyError as exc:
        raise ValueError("PPTX 幻灯片关系无效") from exc


def _clone_slides(data, indices):
    parts = _package(data)
    source = _slide_names(parts)
    if not indices or any(isinstance(i, bool) or not isinstance(i, int) or not 1 <= i <= len(source) for i in indices):
        raise ValueError("masterSlide 超出母版示例页范围（从 1 开始）")
    root = _xml(parts["ppt/presentation.xml"])
    rels = _xml(parts["ppt/_rels/presentation.xml.rels"])
    types = _xml(parts["[Content_Types].xml"])
    for child in list(root):
        if etree.QName(child).localname in {"sldIdLst", "custShowLst", "extLst", "notesMasterIdLst"}:
            root.remove(child)
    for rel in list(rels):
        if rel.get("Type", "").endswith(("/slide", "/notesMaster", "/commentAuthors")):
            rels.remove(rel)
    new_ids = etree.Element(f"{{{P}}}sldIdLst")
    master_ids = root.find(f"{{{P}}}sldMasterIdLst")
    root.insert(list(root).index(master_ids) + 1 if master_ids is not None else 0, new_ids)
    used_ids = {rel.get("Id") for rel in rels}
    for number, source_index in enumerate(indices, 1):
        old_name = source[source_index - 1]
        new_name = f"ppt/slides/intranetGenerated{number}.xml"
        while new_name in parts:
            new_name = new_name.removesuffix(".xml") + "x.xml"
        parts[new_name] = parts[old_name]
        old_rels = posixpath.join(posixpath.dirname(old_name), "_rels", posixpath.basename(old_name) + ".rels")
        slide_rels = _xml(parts[old_rels]) if old_rels in parts else etree.Element(f"{{{REL}}}Relationships")
        for rel in list(slide_rels):
            rel_type = rel.get("Type", "")
            if rel_type.endswith(("/notesSlide", "/comments")):
                slide_rels.remove(rel)
            elif rel_type.endswith("/slide"):
                raise ValueError("母版示例页包含跨页跳转，请先移除跳转")
            else:
                target = rel.get("Target", "")
                absolute = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join(posixpath.dirname(old_name), target))
                if rel_type.endswith("/themeOverride"):
                    if absolute not in parts:
                        raise ValueError("母版 themeOverride 关系无效")
                    clone_name = f"ppt/theme/intranetOverride{number}.xml"
                    while clone_name in parts:
                        clone_name = clone_name.removesuffix(".xml") + "x.xml"
                    parts[clone_name] = parts[absolute]
                    etree.SubElement(types, f"{{{CT}}}Override", PartName="/" + clone_name, ContentType="application/vnd.openxmlformats-officedocument.themeOverride+xml")
                    absolute = clone_name
                rel.set("Target", posixpath.relpath(absolute, posixpath.dirname(new_name)))
        parts[posixpath.join(posixpath.dirname(new_name), "_rels", posixpath.basename(new_name) + ".rels")] = _serialize(slide_rels)
        rid = f"rIdIntranet{number}"
        while rid in used_ids:
            rid += "x"
        used_ids.add(rid)
        etree.SubElement(rels, f"{{{REL}}}Relationship", Id=rid, Type=f"{R}/slide", Target=posixpath.relpath(new_name, "ppt"))
        etree.SubElement(new_ids, f"{{{P}}}sldId", id=str(255 + number), attrib={f"{{{R}}}id": rid})
        etree.SubElement(types, f"{{{CT}}}Override", PartName="/" + new_name, ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml")
    parts["ppt/presentation.xml"] = _serialize(root)
    parts["ppt/_rels/presentation.xml.rels"] = _serialize(rels)
    parts["[Content_Types].xml"] = _serialize(types)
    return _zip(parts)


def _zip(parts):
    stream = BytesIO()
    with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
        for name, blob in parts.items():
            archive.writestr(name, blob)
    return stream.getvalue()


def _scrub(prs):
    for attr in ("title", "subject", "author", "keywords", "comments", "last_modified_by", "category", "identifier", "language"):
        setattr(prs.core_properties, attr, "")
    package = prs.part.package
    for rel in list(package._rels.values()):
        if any(token in rel.reltype.lower() for token in ("thumbnail", "extended-properties", "custom-properties")):
            package._rels.pop(rel.rId)
    for part in list(package.iter_parts()):
        for rel in list(part.rels.values()):
            if any(token in rel.reltype.lower() for token in ("notesslide", "notesmaster", "comment", "thumbnail", "custom-properties", "/customxml", "/tags")):
                part.drop_rel(rel.rId)
    for child in list(prs.part._element):
        if etree.QName(child).localname == "notesMasterIdLst":
            prs.part._element.remove(child)


def _save(prs, path):
    _scrub(prs)
    stream = BytesIO()
    prs.save(stream)
    data = stream.getvalue()
    _package(data)
    path = _local(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def inspect_pptx(path):
    path = _local(path)
    data = path.read_bytes()
    _package(data)
    prs = Presentation(BytesIO(data))
    return {"pageCount": len(prs.slides), "pageSize": {"width": round(prs.slide_width / EMU_PX, 4), "height": round(prs.slide_height / EMU_PX, 4)}, "slides": [{"index": i, "name": slide.name, "shapeCount": len(slide.shapes)} for i, slide in enumerate(prs.slides, 1)]}


def _color(value, default="25334D"):
    if value is None:
        value = default
    value = str(value).lstrip("#")
    if len(value) == 3:
        value = "".join(c * 2 for c in value)
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", value):
        raise ValueError(f"颜色必须为 #RRGGBB：{value}")
    return RGBColor.from_string(value.upper())


def _number(value, name, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < minimum:
        raise ValueError(f"{name} 必须是大于等于 {minimum} 的有限数字")
    return value


def _page_size(page_size):
    page_size = page_size or {"width": 1280, "height": 720}
    return _number(page_size["width"], "pageSize.width", 1), _number(page_size["height"], "pageSize.height", 1)


def _style_shape(shape, style, scale):
    fill = style.get("fill")
    if fill and fill != "transparent":
        shape.fill.solid()
        shape.fill.fore_color.rgb = _color(fill)
    elif hasattr(shape, "fill"):
        shape.fill.background()
    if style.get("borderColor") and style.get("borderWidth", 1) > 0:
        shape.line.color.rgb = _color(style["borderColor"])
        shape.line.width = int(style.get("borderWidth", 1) * scale)
    else:
        shape.line.fill.background()


def _flat(shape):
    """Disable the theme shadow so generated shapes stay flat like the scene."""
    try:
        shape.shadow.inherit = False
    except (AttributeError, NotImplementedError, TypeError, ValueError):
        # GraphicFrames (tables) and other shapes without spPr keep their default.
        pass


def _radius(style, width, height, scale):
    """Return the border radius in EMU, clamped to half the shorter side."""
    value = style.get("borderRadius")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    if not math.isfinite(value) or value <= 0:
        return 0
    return min(float(value) * scale, min(width, height) / 2)


def _geometry(style, width, height, scale):
    """Pick the preset geometry that matches the style's corner radius."""
    radius = _radius(style, width, height, scale)
    if radius <= 0:
        return MSO_SHAPE.RECTANGLE
    if radius >= min(width, height) / 2:
        return MSO_SHAPE.OVAL
    return MSO_SHAPE.ROUNDED_RECTANGLE


def _apply_radius(shape, style, width, height, scale):
    """Translate the radius into the roundRect adjustment (fraction of the short side)."""
    radius = _radius(style, width, height, scale)
    side = min(width, height)
    if radius <= 0 or side <= 0 or radius >= side / 2:
        return
    try:
        shape.adjustments[0] = radius / side
    except (IndexError, KeyError, TypeError, ValueError):
        pass


def _line_spacing(style):
    value = style.get("lineHeight")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    value = float(value)
    return value if math.isfinite(value) and 0 < value <= 10 else None


def _font(run, style, scale):
    font = run.font
    family = style.get("fontFamily", "Microsoft YaHei")
    font.name = family
    font.size = int(_number(style.get("fontSize", 24), "fontSize", 1) * scale)
    font.color.rgb = _color(style.get("color"))
    for prop in ("bold", "italic", "underline"):
        if prop in style:
            setattr(font, prop, bool(style[prop]))
    rpr = run._r.get_or_add_rPr()
    for tag in ("ea", "cs"):
        child = rpr.find(f"{{{A}}}{tag}")
        if child is None:
            child = OxmlElement(f"a:{tag}")
            rpr.append(child)
        child.set("typeface", family)
    spacing = style.get("letterSpacing")
    if isinstance(spacing, (int, float)) and not isinstance(spacing, bool) and math.isfinite(spacing):
        # DrawingML character spacing is in 1/100 pt; px -> pt is 72/96.
        rpr.set("spc", str(int(round(float(spacing) * 75))))


def _runs(value):
    if isinstance(value, str):
        return [{"text": value}]
    if isinstance(value, dict) and "runs" in value:
        value = value["runs"]
    if not isinstance(value, list) or any(not isinstance(run, (str, dict)) for run in value):
        raise ValueError("文本须为字符串或 richtext runs 数组")
    return [{"text": run} if isinstance(run, str) else run for run in value]


def _text(tf, value, style, scale):
    tf.clear()
    tf.word_wrap = True
    tf.auto_size = None
    padding = style.get("padding", 0)
    if isinstance(padding, (list, tuple)):
        paddings = list(padding) if len(padding) == 4 else [padding[0]] * 4
    else:
        paddings = [padding] * 4
    tf.margin_top, tf.margin_right, tf.margin_bottom, tf.margin_left = [int(float(p) * scale) for p in paddings]
    tf.vertical_anchor = {"top": MSO_ANCHOR.TOP, "middle": MSO_ANCHOR.MIDDLE, "center": MSO_ANCHOR.MIDDLE, "bottom": MSO_ANCHOR.BOTTOM}.get(style.get("verticalAlign"), MSO_ANCHOR.TOP)
    # CSS line-height means size*ratio while a spcPct value multiplies the
    # font's natural line height, so absolute spcPts are written per paragraph
    # from its largest run size (page px -> pt at 0.75) to match the preview.
    line_spacing = _line_spacing(style) or 1.2
    paragraph = tf.paragraphs[0]
    align = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT, "justify": PP_ALIGN.JUSTIFY}.get(style.get("align"), PP_ALIGN.LEFT)
    paragraph.alignment = align
    paragraph.space_before = Pt(0)
    paragraph.space_after = Pt(0)
    max_sizes = [0.0]  # page-px font size ceiling per paragraph, in order
    for spec in _runs(value):
        merged = {**style, **spec.get("style", {}), **{k: v for k, v in spec.items() if k not in {"text", "style"}}}
        size = merged.get("fontSize", 24)
        if isinstance(size, bool) or not isinstance(size, (int, float)) or not math.isfinite(size):
            size = 24
        for index, chunk in enumerate(str(spec.get("text", "")).replace("\r\n", "\n").split("\n")):
            if index:
                paragraph = tf.add_paragraph()
                paragraph.alignment = align
                paragraph.space_before = paragraph.space_after = Pt(0)
                max_sizes.append(0.0)
            max_sizes[-1] = max(max_sizes[-1], float(size))
            run = paragraph.add_run()
            run.text = chunk
            _font(run, merged, scale)
    for paragraph, size in zip(tf.paragraphs, max_sizes):
        paragraph.line_spacing = Pt((size or 24) * 0.75 * line_spacing)


def _image(path):
    path = _local(path)
    if path.stat().st_size > 50 * 1024 * 1024:
        raise ValueError("图片超过 50 MiB")
    try:
        with Image.open(path) as source:
            if source.width * source.height > 40_000_000:
                raise ValueError("图片超过 4000 万像素")
            image = ImageOps.exif_transpose(source)
            stream = BytesIO()
            image.convert("RGBA" if image.mode in {"RGBA", "LA", "P"} else "RGB").save(stream, format="PNG")
            stream.seek(0)
            return stream, image.size
    except (OSError, Image.DecompressionBombError) as exc:
        raise ValueError(f"无法读取本地图片：{path.name}") from exc


_BORDER_TAGS = ("lnL", "lnR", "lnT", "lnB")


def _hex(value, default="C5D3DF"):
    """Normalize a scene color to the uppercase hex DrawingML expects."""
    value = str(value if value is not None else default).lstrip("#")
    if len(value) == 3:
        value = "".join(char * 2 for char in value)
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", value):
        raise ValueError(f"颜色必须为 #RRGGBB：{value}")
    return value.upper()


def _cell_borders(cell, style, scale):
    """Write explicit four-side borders on a table cell.

    ``a:lnL/lnR/lnT/lnB`` must precede the fill elements inside ``a:tcPr``, so the
    lines are inserted at the front of the property element in schema order; any
    inherited line elements are removed first to keep the result deterministic.
    A zero width writes explicit ``noFill`` lines so the default table style's
    grid cannot reappear (the HTML preview renders such cells with ``border:0``).
    """
    tc_pr = cell._tc.get_or_add_tcPr()
    for tag in _BORDER_TAGS:
        existing = tc_pr.find(f"{{{A}}}{tag}")
        if existing is not None:
            tc_pr.remove(existing)
    width = style.get("borderWidth") or 0
    solid = not (isinstance(width, bool) or not isinstance(width, (int, float)) or not math.isfinite(width) or width <= 0)
    emu = max(1, int(round(float(width) * scale))) if solid else 0  # scale is EMU per scene px
    color = _hex(style.get("borderColor"), "C5D3DF")
    for offset, tag in enumerate(_BORDER_TAGS):
        line = OxmlElement(f"a:{tag}")
        line.set("w", str(emu))
        line.set("cap", "flat")
        line.set("cmpd", "sng")
        line.set("algn", "ctr")
        if solid:
            fill = OxmlElement("a:solidFill")
            swatch = OxmlElement("a:srgbClr")
            swatch.set("val", color)
            fill.append(swatch)
            line.append(fill)
            dash = OxmlElement("a:prstDash")
            dash.set("val", "solid")
            line.append(dash)
        else:
            line.append(OxmlElement("a:noFill"))
        tc_pr.insert(offset, line)


def _render_node(slide, node, sx, sy):
    x, y, w, h = [float(node.get(k, 0)) for k in ("x", "y", "w", "h")]
    if not all(math.isfinite(v) for v in (x, y, w, h)) or w < 0 or h < 0:
        raise ValueError("scene 坐标和尺寸必须为有限数字且宽高非负")
    left, top, width, height = int(x * sx), int(y * sy), int(w * sx), int(h * sy)
    style = node.get("style", {})
    scale = min(sx, sy)
    kind = node["type"]
    if kind == "text":
        if _radius(style, width, height, scale) > 0:
            # Rounded/flat text panels need a real shape to carry the fill.
            shape = slide.shapes.add_shape(_geometry(style, width, height, scale), left, top, width, height)
            _flat(shape)
            _apply_radius(shape, style, width, height, scale)
            _style_shape(shape, style, scale)
            _text(shape.text_frame, node.get("runs", node.get("text", "")), style, scale)
        else:
            shape = slide.shapes.add_textbox(left, top, width, height)
            _flat(shape)
            _style_shape(shape, style, scale)
            _text(shape.text_frame, node.get("runs", node.get("text", "")), style, scale)
    elif kind == "rect":
        shape = slide.shapes.add_shape(_geometry(style, width, height, scale), left, top, width, height)
        _flat(shape)
        _apply_radius(shape, style, width, height, scale)
        _style_shape(shape, style, scale)
    elif kind == "line":
        shape = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, left, top, left + width, top + height)
        _flat(shape)
        shape.line.color.rgb = _color(style.get("borderColor", style.get("color", "2A64D6")))
        shape.line.width = int(style.get("borderWidth", 1) * scale)
    elif kind == "image":
        stream, (iw, ih) = _image(node["src"])
        ratio = min(width / iw, height / ih)
        nw, nh = int(iw * ratio), int(ih * ratio)
        shape = slide.shapes.add_picture(stream, left + (width - nw) // 2, top + (height - nh) // 2, nw, nh)
        _flat(shape)
    elif kind == "table":
        rows = node.get("rows", [])
        if not rows or not isinstance(rows, list) or not isinstance(rows[0], list) or not rows[0] or any(not isinstance(r, list) or len(r) != len(rows[0]) for r in rows):
            raise ValueError("表格 rows 必须是非空矩形二维数组")
        header_rows = node.get("headerRows") or 0
        if isinstance(header_rows, bool) or not isinstance(header_rows, int) or header_rows < 0:
            header_rows = 0
        header_rows = min(header_rows, len(rows))
        header_style = node.get("headerStyle") or {}
        shape = slide.shapes.add_table(len(rows), len(rows[0]), left, top, width, height)
        _flat(shape)
        table = shape.table
        table.first_row = False
        table.first_col = False
        table.last_row = False
        table.last_col = False
        table.horz_banding = False
        table.vert_banding = False
        for ri, row in enumerate(rows):
            for ci, cell_value in enumerate(row):
                cell = table.cell(ri, ci)
                cell_style = {**style, **header_style} if ri < header_rows else {**style}
                if isinstance(cell_value, dict) and "runs" in cell_value:
                    cell_style.update(cell_value.get("style", {}))
                _text(cell.text_frame, cell_value, cell_style, scale)
                fill = cell_style.get("fill")
                cell.fill.solid()
                cell.fill.fore_color.rgb = _color(fill if fill and fill != "transparent" else "FFFFFF", "FFFFFF")
                _cell_borders(cell, cell_style, scale)
        # Compact, content-based row heights: the estimator lives in
        # components.py and returns page-px values.
        row_heights = node.get("rowHeights")
        if isinstance(row_heights, list):
            total = count = 0
            for index, value in enumerate(row_heights[:len(rows)]):
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
                    continue
                emu = int(round(float(value) * sy))
                if emu <= 0:
                    continue
                table.rows[index].height = emu
                total += emu
                count += 1
            # Shrink the frame only when every row got an explicit height;
            # otherwise the unset rows would extend past the frame.
            if total > 0 and count == len(rows):
                shape.height = total
    else:
        raise ValueError(f"不支持的 scene 类型：{kind}")
    if node.get("id"):
        shape.name = str(node["id"])


def _theme_fonts(prs, family="Microsoft YaHei"):
    """Rewrite the theme font scheme so even hand-added text uses YaHei."""
    for master in prs.slide_masters:
        for rel in master.part.rels.values():
            if not rel.reltype.endswith("/theme"):
                continue
            part = rel.target_part
            root = _xml(part.blob)
            for scheme in root.iter(f"{{{A}}}fontScheme"):
                for group in ("majorFont", "minorFont"):
                    node = scheme.find(f"{{{A}}}{group}")
                    if node is None:
                        continue
                    # latin/ea/cs precede the a:font script list in schema order.
                    anchor = node.find(f"{{{A}}}font")
                    for tag in ("latin", "ea", "cs"):
                        child = node.find(f"{{{A}}}{tag}")
                        if child is None:
                            child = OxmlElement(f"a:{tag}")
                            if anchor is not None:
                                anchor.addprevious(child)
                            else:
                                node.append(child)
                        child.set("typeface", family)
            part._blob = _serialize(root)


def create_default_master(path, page_size=None, background=None, accent=None, line=None):
    width, height = _page_size(page_size)
    prs = Presentation()
    _theme_fonts(prs)
    prs.slide_width, prs.slide_height = int(width * EMU_PX), int(height * EMU_PX)
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = _color(background or "F7F9FD")
    _render_node(slide, {"type": "rect", "x": 0, "y": 0, "w": 12, "h": height, "style": {"fill": accent or "1748A6"}}, EMU_PX, EMU_PX)
    _render_node(slide, {"type": "line", "x": 48, "y": height - 36, "w": width - 96, "h": 0, "style": {"borderColor": line or "D5DDEA", "borderWidth": 1}}, EMU_PX, EMU_PX)
    out = _save(prs, path)
    return {"output": str(out), "pageCount": 1, "pageSize": {"width": width, "height": height}}


def render_pptx(master_path, pages, page_size, out_path):
    master_path, out_path = _local(master_path), _local(out_path)
    if master_path == out_path:
        raise ValueError("输出不能覆盖源母版")
    data = master_path.read_bytes()
    prs = Presentation(BytesIO(_clone_slides(data, [p.get("masterSlide", 1) for p in pages])))
    width, height = _page_size(page_size)
    sx, sy = prs.slide_width / width, prs.slide_height / height
    for slide, page in zip(prs.slides, pages):
        if page.get("id"):
            slide.name = str(page["id"])
        for node in page.get("nodes", []):
            _render_node(slide, node, sx, sy)
    out = _save(prs, out_path)
    return {"output": str(out), "pageCount": len(pages)}


def _rgb(color):
    try:
        return "#" + str(color.rgb) if color and color.rgb is not None else None
    except (AttributeError, TypeError):
        return None


def _run_style(run):
    result = {}
    for key, value in (("fontFamily", run.font.name), ("fontSize", run.font.size.pt * 96 / 72 if run.font.size else None), ("bold", run.font.bold), ("italic", run.font.italic), ("underline", run.font.underline), ("color", _rgb(run.font.color))):
        if value is not None:
            result[key] = bool(value) if key in {"bold", "italic", "underline"} else value
    return result


def _frame_runs(tf):
    runs = []
    for index, paragraph in enumerate(tf.paragraphs):
        if index:
            runs.append({"text": "\n"})
        for run in paragraph.runs:
            runs.append({"text": run.text, **_run_style(run)})
    return runs or [{"text": ""}]


def _effective_font(shape):
    if shape.has_text_frame:
        current = shape
        seen = set()
        while current is not None and id(current) not in seen:
            seen.add(id(current))
            for p in current.text_frame.paragraphs:
                for run in p.runs:
                    if run.font.size:
                        return run.font.size.pt * 96 / 72
                if p.font.size:
                    return p.font.size.pt * 96 / 72
            level = shape.text_frame.paragraphs[0].level + 1
            props = current.text_frame._txBody.find(f"{{{A}}}lstStyle/{{{A}}}lvl{level}pPr/{{{A}}}defRPr")
            if props is not None and props.get("sz"):
                return int(props.get("sz")) / 100 * 96 / 72
            current = getattr(current, "_base_placeholder", None)
        part = shape.part
        master = part.slide_layout.slide_master
        level = shape.text_frame.paragraphs[0].level + 1
        placeholder_type = str(shape.placeholder_format.type) if shape.is_placeholder else ""
        style = "titleStyle" if "TITLE" in placeholder_type else "bodyStyle" if shape.is_placeholder else "otherStyle"
        props = master._element.find(f"{{{P}}}txStyles/{{{P}}}{style}/{{{A}}}lvl{level}pPr/{{{A}}}defRPr")
        if props is None:
            props = part.package.presentation_part._element.find(f"{{{P}}}defaultTextStyle/{{{A}}}lvl{level}pPr/{{{A}}}defRPr")
        if props is not None and props.get("sz"):
            return int(props.get("sz")) / 100 * 96 / 72
    return 24


def _shape_style(shape):
    style = {}
    if shape.has_text_frame:
        tf = shape.text_frame
        style["fontSize"] = round(_effective_font(shape), 4)
        style["fontFamily"] = "Microsoft YaHei"
        style["padding"] = [round(float(getattr(tf, "margin_" + side)) / EMU_PX, 3) for side in ("top", "right", "bottom", "left")]
        style["align"] = {PP_ALIGN.LEFT: "left", PP_ALIGN.CENTER: "center", PP_ALIGN.RIGHT: "right", PP_ALIGN.JUSTIFY: "justify"}.get(tf.paragraphs[0].alignment, "left")
        style["verticalAlign"] = {MSO_ANCHOR.TOP: "top", MSO_ANCHOR.MIDDLE: "middle", MSO_ANCHOR.BOTTOM: "bottom"}.get(tf.vertical_anchor, "top")
        if tf.paragraphs[0].runs:
            style.update(_run_style(tf.paragraphs[0].runs[0]))
    try:
        if shape.fill.type == 1:
            color = _rgb(shape.fill.fore_color)
            if color:
                style["fill"] = color
    except (AttributeError, TypeError, ValueError):
        pass
    try:
        color = _rgb(shape.line.color)
        if color:
            style["borderColor"] = color
            style["borderWidth"] = round((shape.line.width or 12700) / EMU_PX, 3)
    except (AttributeError, TypeError, ValueError):
        pass
    return style


def _css(style):
    result = []
    mapping = {"fontFamily": "font-family", "fontSize": "font-size", "color": "color", "fill": "background-color", "align": "text-align"}
    for key, css in mapping.items():
        if key in style:
            value = str(style[key]) + ("px" if key == "fontSize" else "")
            if key == "fontFamily":
                value = re.sub(r"[^\w \-,\u4e00-\u9fff]", "", value)
            result.append(css + ":" + value)
    if style.get("bold"):
        result.append("font-weight:bold")
    if style.get("italic"):
        result.append("font-style:italic")
    if style.get("underline"):
        result.append("text-decoration:underline")
    if "padding" in style:
        result.append("padding:" + " ".join(str(v) + "px" for v in style["padding"]))
    if style.get("borderColor"):
        result.append(f"border:{style.get('borderWidth', 1)}px solid {style['borderColor']}")
    return ";".join(result)


def _supported(shape):
    if abs(shape.rotation) > .01:
        return None, "旋转形状保留为原生静态对象"
    if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
        return None, "组合形状保留为原生静态对象"
    if shape.has_table:
        if any(c.is_merge_origin or c.is_spanned for row in shape.table.rows for c in row.cells):
            return None, "合并单元格表格保留为原生静态对象"
        return "table", None
    if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
        if any(abs(v) > .001 for v in (shape.crop_left, shape.crop_right, shape.crop_top, shape.crop_bottom)):
            return None, "裁剪图片保留为原生静态对象"
        return "image", None
    if shape.shape_type == MSO_SHAPE_TYPE.AUTO_SHAPE:
        if shape.auto_shape_type not in {MSO_SHAPE.RECTANGLE, MSO_SHAPE.ROUNDED_RECTANGLE}:
            return None, "复杂自选图形保留为原生静态对象"
    if shape.has_text_frame:
        return "text", None
    return None, "该对象类型尚不支持提取，保留为原生静态对象"


def extract_pptx(source, out_dir):
    source, out_dir = _local(source), _local(out_dir)
    if out_dir.exists() and any(out_dir.iterdir()):
        raise ValueError("提取输出目录必须为空")
    data = source.read_bytes()
    _package(data)
    prs = Presentation(BytesIO(_clone_slides(data, list(range(1, len(Presentation(BytesIO(data)).slides) + 1)))))
    page_size = {"width": round(prs.slide_width / EMU_PX, 4), "height": round(prs.slide_height / EMU_PX, 4)}
    components, pages, warnings = [], [], []
    image_outputs = {}
    for index, slide in enumerate(prs.slides, 1):
        elements = []
        for shape in list(slide.shapes):
            kind, reason = _supported(shape)
            sid = f"shape-{index}-{shape.shape_id}"
            if kind is None:
                warnings.append({"slide": index, "shapeId": shape.shape_id, "name": shape.name, "reason": reason})
                continue
            box = {k: round(float(getattr(shape, prop)) / EMU_PX, 4) for k, prop in (("x", "left"), ("y", "top"), ("w", "width"), ("h", "height"))}
            if box["w"] <= 0 or box["h"] <= 0 or max(box["w"], box["h"]) > 8192 or box["x"] < 0 or box["y"] < 0 or box["x"] + box["w"] > page_size["width"] + .01 or box["y"] + box["h"] > page_size["height"] + .01:
                warnings.append({"slide": index, "shapeId": shape.shape_id, "reason": "对象零尺寸、超出页面或超过组件尺寸上限，保留为静态"})
                continue
            if len(components) >= 200:
                warnings.append({"slide": index, "shapeId": shape.shape_id, "reason": "元素库超过 200 个组件上限，保留为静态"})
                continue
            style = _shape_style(shape)
            css = "position:absolute;left:0;top:0;width:100%;height:100%;" + _css(style)
            inputs, input_values = {}, {}
            if kind == "text":
                inputs["text"] = {"type": "richtext", "required": True}
                input_values["text"] = _frame_runs(shape.text_frame)
                if len(input_values["text"]) > 500 or sum(len(r["text"]) for r in input_values["text"]) > 50000 or style.get("fontSize", 24) > 240 or max(style.get("padding", [0])) > 100:
                    warnings.append({"slide": index, "shapeId": shape.shape_id, "reason": "文本、字号或内边距超过组件容量，保留为静态"})
                    continue
                html = f'<div style="{escape(css, quote=True)}" data-slot="text"></div>'
            elif kind == "image":
                try:
                    with Image.open(BytesIO(shape.image.blob)) as img:
                        if img.width * img.height > 40_000_000:
                            raise ValueError("图片超过 4000 万像素")
                        image_stream = BytesIO()
                        img.convert("RGBA").save(image_stream, "PNG")
                    filename = f"{sid}.png"
                    image_outputs[filename] = image_stream.getvalue()
                except (OSError, ValueError, Image.DecompressionBombError):
                    warnings.append({"slide": index, "shapeId": shape.shape_id, "reason": "图片格式无法本地转换，保留为静态"})
                    continue
                inputs["src"] = {"type": "image", "required": True}
                input_values["src"] = "library/assets/" + filename
                html = f'<img style="{escape(css, quote=True)}" data-slot="src" />'
            else:
                if len(shape.table.rows) > 100 or len(shape.table.columns) > 30:
                    warnings.append({"slide": index, "shapeId": shape.shape_id, "reason": "表格超过组件 100 行/30 列上限，保留为静态"})
                    continue
                inputs["rows"] = {"type": "table", "required": True}
                input_values["rows"] = [[_frame_runs(cell.text_frame) for cell in row.cells] for row in shape.table.rows]
                style.setdefault("fontSize", 18)
                html = f'<table style="{escape(css + ";font-size:18px", quote=True)}" data-slot="rows"></table>'
            components.append({"id": sid, "name": shape.name or sid, "description": f"提取自第 {index} 页形状 {shape.shape_id}；复杂样式需本地复核", "size": {"width": box["w"], "height": box["h"]}, "inputs": inputs, "html": html})
            elements.append({"id": sid, "component": "extracted/" + sid, "box": box, "inputs": input_values})
            shape._element.getparent().remove(shape._element)
        # Remove relationships that would retain deleted sample pictures.
        used = {value for node in slide._element.iter() for attr, value in node.attrib.items() if attr.startswith("{" + R + "}")}
        for rel in list(slide.part.rels.values()):
            if rel.reltype.endswith("/image") and rel.rId not in used:
                slide.part.drop_rel(rel.rId)
        pages.append({"id": f"slide-{index}", "masterSlide": index, "elements": elements})
    out_dir.mkdir(parents=True, exist_ok=True)
    library_dir = out_dir / "library"
    (library_dir / "assets").mkdir(parents=True, exist_ok=True)
    for filename, blob in image_outputs.items():
        (library_dir / "assets" / filename).write_bytes(blob)
    library = {"schemaVersion": 1, "id": "extracted", "name": source.stem + " 提取元素库", "components": components}
    deck = {"schemaVersion": 1, "title": source.stem, "master": "master.pptx", "pageSize": page_size, "libraries": ["library/library.json"] if components else [], "pages": pages}
    report = {"pageCount": len(pages), "componentCount": len(components), "warnings": warnings, "notes": ["支持的正文对象已从 master.pptx 移除，背景、母版和未支持对象保留。", "提取内容将追加到静态对象之上，混合页面的相对遮挡顺序可能变化。", "HTML/PPTX 为受限样式映射；未解析的主题色使用组件默认色，主题字体使用 Microsoft YaHei；表格主题和复杂效果需本地复核。", "提取的 deck.json 和库含源文件正文及图片；请在内网保存。"]}
    _save(prs, out_dir / "master.pptx")
    for path, obj in ((library_dir / "library.json", library), (out_dir / "deck.json", deck), (out_dir / "extraction-report.json", report)):
        path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"output": str(out_dir), **report}
