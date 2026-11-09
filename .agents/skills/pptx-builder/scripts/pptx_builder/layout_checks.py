"""Mandatory, shared scene and native-package layout checks for PPTX outputs."""
from __future__ import annotations

from io import BytesIO

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

from . import components, pptx_backend


def _finish(issues, **extra):
    issues.sort(key=lambda issue: (issue.get("pageIndex", 0), issue["kind"]))
    return {"checked": True, "status": "passed" if not issues else "issues", "issueCount": len(issues), "issues": issues, **extra}


def audit_prepared(prepared):
    pages, size = prepared["pages"], prepared["pageSize"]
    issues = list(components.audit_layout(pages, size, min_font=prepared["minFontSize"])["issues"])
    regions = []
    for index, page in enumerate(pages, 1):
        safe = page["masterRegions"]
        regions.append({"page": page["id"], "pageIndex": index, **safe})
        top, bottom = safe["titleHeight"], size["height"] - safe["footerHeight"]
        for element in page["elements"]:
            bounds = components._union_bounds(element["nodes"])
            if not bounds or element["region"] == "full":
                continue
            region = element["region"]
            detail = None
            if region == "body" and (bounds["y"] < top - 1 or bounds["y"] + bounds["h"] > bottom + 1):
                detail = f"正文元素 {element['id']} 侵入标题或页脚保留区；正文允许 y={top:.0f}..{bottom:.0f}px，元素 y={bounds['y']:.0f}..{bounds['y'] + bounds['h']:.0f}px"
            elif region == "title" and top > 0 and bounds["y"] + bounds["h"] > top + 1:
                detail = f"标题元素 {element['id']} 超出标题保留区高度 {top:.0f}px"
            elif region == "footer" and safe["footerHeight"] > 0 and bounds["y"] < bottom - 1:
                detail = f"页脚元素 {element['id']} 超出页脚保留区（起点 {bottom:.0f}px）"
            if detail:
                issues.append({"page": page["id"], "pageIndex": index, "kind": "reservedRegion", "elements": [element["id"]],
                               "detail": detail, "suggestions": ["移动或缩小元素至所属区域内", "核实 masterRegions 高度；封面装饰可显式指定 region: full"]})
    return _finish(issues, masterRegions=regions,
                   method="声明式场景几何、文字/表格高度估算及母版保留区检查；并非 PowerPoint 像素渲染。")


def _visible(shape):
    if getattr(shape, "has_text_frame", False) and shape.text.strip():
        return True
    if shape.shape_type in {MSO_SHAPE_TYPE.PICTURE, MSO_SHAPE_TYPE.GROUP} or getattr(shape, "has_table", False) or getattr(shape, "has_chart", False):
        return True
    try:
        if shape.fill.type is not None and int(shape.fill.type) != 5:
            return True
    except (AttributeError, TypeError, ValueError):
        pass
    return bool(shape._element.xpath(".//a:ln/a:solidFill | .//a:ln/a:prstDash"))


def _native_nodes(shape, prefix):
    rect = {key: float(getattr(shape, attr)) / pptx_backend.EMU_PX
            for key, attr in (("x", "left"), ("y", "top"), ("w", "width"), ("h", "height"))}
    if rect["w"] <= 0 or rect["h"] <= 0:
        return []
    node = {"elementId": prefix, **rect, "style": {}}
    if getattr(shape, "has_text_frame", False) and shape.text.strip():
        node.update(type="text", style=pptx_backend._shape_style(shape), runs=pptx_backend._frame_runs(shape.text_frame))
    elif getattr(shape, "has_table", False):
        node.update(type="table", rows=[[pptx_backend._frame_runs(c.text_frame) for c in row.cells] for row in shape.table.rows],
                    rowHeights=[row.height / pptx_backend.EMU_PX for row in shape.table.rows])
    elif shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
        node["type"] = "image"
    else:
        node["type"] = "rect"
    return [node]


def _fixed_content_overlaps(pages, existing, static_counts):
    """A text/image/table holding another shape is content, not a background.

    The scene auditor intentionally allows nested container rectangles. Native
    fixed content must not inherit that exception just because its outer box
    happens to fully contain newly appended content.
    """
    recorded = {(issue["pageIndex"], frozenset(issue["elements"]))
                for issue in existing if issue["kind"] == "overlap"}
    result = []
    for index, page in enumerate(pages, 1):
        entries = [(entry, components._union_bounds(entry["nodes"])) for entry in page["elements"]]
        for first, (left, lb) in enumerate(entries):
            for right, rb in entries[first + 1:]:
                if not lb or not rb or (index, frozenset((left["id"], right["id"]))) in recorded:
                    continue
                fixed_content = [entry for entry in (left, right)
                                 if (static_counts is None or entry["id"].startswith(("template-", "layout-", "master-")))
                                 and any(node["type"] in {"text", "image", "table"} for node in entry["nodes"])]
                if not fixed_content:
                    continue
                # Preserve intentional decoration rectangles behind their
                # children. Only a containing content object loses exemption.
                if not components._contains(lb, rb) or not any(node["type"] in {"text", "image", "table"} for node in left["nodes"]):
                    continue
                width = min(lb["x"] + lb["w"], rb["x"] + rb["w"]) - max(lb["x"], rb["x"])
                height = min(lb["y"] + lb["h"], rb["y"] + rb["h"]) - max(lb["y"], rb["y"])
                if width <= 0 or height <= 0 or width * height <= components._OVERLAP_MIN_AREA:
                    continue
                result.append({"page": page["id"], "pageIndex": index, "kind": "overlap",
                               "elements": [left["id"], right["id"]],
                               "detail": f"原生固定内容与其它元素重叠约 {width * height:.0f}px²（{width:.0f}×{height:.0f}px）；文字、图片或表格的包含关系不能作为背景容器豁免。",
                               "suggestions": ["移动新增元素，避免遮挡固定标题、图片或表格", "清理母版中不需要保留的固定正文"]})
    return result


def audit_pptx(path, static_counts=None):
    """Check the actual saved package, including visible native fixed objects.

    Inherited placeholder definitions are not rendered objects. Groups remain a
    single geometry boundary and are disclosed as a limitation in the report.
    """
    metadata = pptx_backend.inspect_pptx(path)
    prs = Presentation(BytesIO(pptx_backend._local(path).read_bytes()))
    pages, limitations = [], []
    for index, slide in enumerate(prs.slides, 1):
        elements, generated = [], {}
        inherited = slide._element.get("showMasterSp", "1") not in {"0", "false"}
        containers = [("slide", slide.shapes)]
        if inherited:
            containers += [("layout", slide.slide_layout.shapes), ("master", slide.slide_layout.slide_master.shapes)]
        for source, shapes in containers:
            for shape_index, shape in enumerate(shapes):
                if source != "slide" and shape.is_placeholder:
                    continue
                if not _visible(shape):
                    continue
                label = "template" if source == "slide" and static_counts is not None and shape_index < static_counts[index - 1] else source
                sid = f"{label}-{shape.shape_id}"
                if shape.shape_type == MSO_SHAPE_TYPE.GROUP or getattr(shape, "has_chart", False) or shape.rotation:
                    limitations.append({"pageIndex": index, "shape": sid, "detail": "组合、图表或旋转对象仅检查外框，不检查其内部排版。"})
                nodes = _native_nodes(shape, sid)
                if nodes:
                    if label == "slide" and shape.name.startswith("pptx-builder:"):
                        sid = "generated-" + shape.name.removeprefix("pptx-builder:")
                        entry = generated.get(sid)
                        if entry is None:
                            generated[sid] = entry = {"id": sid, "nodes": []}
                            elements.append(entry)
                        entry["nodes"].extend(nodes)
                    else:
                        elements.append({"id": sid, "nodes": nodes})
        pages.append({"id": slide.name or f"slide-{index}", "elements": elements})
    issues = components.audit_layout(pages, metadata["pageSize"])["issues"]
    # Text wrapping has already been audited from the exact compiled scene.
    # Native Office inherited typography is not fully available to python-pptx;
    # report package geometry here rather than inventing its effective font.
    issues = [issue for issue in issues if issue["kind"] in {"outOfPage", "overlap"}]
    issues += _fixed_content_overlaps(pages, issues, static_counts)
    if static_counts is not None:
        issues = [issue for issue in issues if issue["kind"] != "overlap" or
                  any(e.startswith(("template-", "layout-", "master-")) for e in issue["elements"])]
    return _finish(issues, pageCount=metadata["pageCount"], pageSize=metadata["pageSize"], limitations=limitations,
                   method="已保存 PPTX 的页面、布局及母版可见对象几何检查；组合对象按外框，原生字体换行需查看器复核。")


def merge_native(layout, native):
    issues = list(layout["issues"])
    for issue in native["issues"]:
        # Scene overlap reports have the user's element IDs and are easier to fix.
        # Include native overlaps only when at least one fixed inherited object is involved.
        issues.append({**issue, "source": "nativePptx"})
    return _finish(issues, masterRegions=layout["masterRegions"], method=layout["method"], native=native)
