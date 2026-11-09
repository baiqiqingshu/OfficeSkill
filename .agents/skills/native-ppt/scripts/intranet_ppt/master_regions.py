"""Read native template regions without changing the source presentation."""
from __future__ import annotations

from io import BytesIO
import math

from pptx import Presentation
from pptx.enum.shapes import PP_PLACEHOLDER

from . import pptx_backend

TITLE_TYPES = {PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE, PP_PLACEHOLDER.VERTICAL_TITLE}
FOOTER_TYPES = {PP_PLACEHOLDER.FOOTER, PP_PLACEHOLDER.DATE, PP_PLACEHOLDER.SLIDE_NUMBER}
TITLE_COMPONENTS = {"builtin/title", "builtin/eyebrow", "builtin/ar-header"}
FULL_COMPONENTS = {"builtin/cover", "builtin/section-break", "builtin/thanks"}


def validate_options(value, height, label="masterRegions"):
    if not isinstance(value, dict) or set(value) - {"detect", "titleHeight", "footerHeight"}:
        raise ValueError(f"{label} 仅支持 detect/titleHeight/footerHeight")
    if "detect" in value and not isinstance(value["detect"], bool):
        raise ValueError(f"{label}.detect 必须是布尔值")
    for name in ("titleHeight", "footerHeight"):
        if name in value:
            number = value[name]
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not 0 <= number < height:
                raise ValueError(f"{label}.{name} 必须是小于页面高度的非负有限数值")
    if value.get("titleHeight", 0) + value.get("footerHeight", 0) >= height:
        raise ValueError(f"{label} 标题与页脚高度之和必须小于页面高度")
    return dict(value)


def element_region(element):
    region = element.get("region")
    if region is None:
        component = element.get("component")
        if component in TITLE_COMPONENTS:
            return "title"
        if component in FULL_COMPONENTS:
            return "full"
        # A footnote is also useful under charts; only infer a footer near the edge.
        if component == "builtin/footnote":
            return "footer"
        return "body"
    if not isinstance(region, str) or region not in {"body", "title", "footer", "full"}:
        raise ValueError("元素 region 必须为 body/title/footer/full")
    return region


def _role(shape):
    if shape.is_placeholder:
        kind = shape.placeholder_format.type
        if kind in TITLE_TYPES:
            return "title"
        if kind in FOOTER_TYPES:
            return "footer"
    name = shape.name.casefold()
    if any(token in name for token in ("footer", "页脚")):
        return "footer"
    if any(token in name for token in ("header", "页眉", "标题区域", "title-region")):
        return "title"
    return None


def inspect_master(path):
    """Report visible title/footer boundaries plus all placeholder candidates.

    Heights are reserved edge bands: titleHeight is the title bottom coordinate,
    footerHeight is the distance from the footer top to the bottom of the slide.
    Uninstantiated layout/master placeholders do not reserve invisible areas;
    placeholders present on the source slide reserve their concrete geometry.
    """
    metadata = pptx_backend.inspect_pptx(path)
    prs = Presentation(BytesIO(pptx_backend._local(path).read_bytes()))
    height = prs.slide_height / pptx_backend.EMU_PX
    slides = []
    for index, slide in enumerate(prs.slides, 1):
        sources, candidates = [], []
        for source, shapes in (("slide", slide.shapes), ("layout", slide.slide_layout.shapes), ("master", slide.slide_layout.slide_master.shapes)):
            for shape in shapes:
                role = _role(shape)
                if not role:
                    continue
                top = shape.top / pptx_backend.EMU_PX
                bottom = (shape.top + shape.height) / pptx_backend.EMU_PX
                record = {"source": source, "shapeId": shape.shape_id, "name": shape.name,
                          "region": role, "y": round(top, 4), "height": round(shape.height / pptx_backend.EMU_PX, 4)}
                candidates.append(record)
                # Only slide placeholders are concrete. Inherited placeholders
                # are definitions until populated on the slide itself.
                if source != "slide" and shape.is_placeholder:
                    continue
                band = bottom if role == "title" else height - top
                if 0 <= band < height:
                    sources.append({**record, "reservedHeight": round(band, 4)})
        regions = {"titleHeight": max((r["reservedHeight"] for r in sources if r["region"] == "title"), default=0),
                   "footerHeight": max((r["reservedHeight"] for r in sources if r["region"] == "footer"), default=0)}
        slides.append({"index": index, "name": slide.name, "shapeCount": len(slide.shapes), "masterRegions": regions,
                       "sources": sources, "placeholderCandidates": candidates})
    return {**metadata, "slides": slides,
            "units": "px at 96dpi", "heightMeaning": "标题高度为顶部保留带下边界；页脚高度为底部保留带高度。版式/母版未实例化占位符仅列候选；源页占位符参与保留区。"}


def resolve_regions(size, detected=None, global_options=None, page_options=None):
    options = {"detect": True, **(global_options or {}), **(page_options or {})}
    validate_options(options, size["height"])
    detected = detected or {}
    result = {key: options.get(key, detected.get(key, 0) if options["detect"] else 0)
              for key in ("titleHeight", "footerHeight")}
    validate_options(result, size["height"])
    return {**result, "detect": options["detect"], "contentBounds": {
        "x": 0, "y": result["titleHeight"], "w": size["width"],
        "h": size["height"] - result["titleHeight"] - result["footerHeight"]}}


def scaled_regions(master_info, slide_index, size):
    if not master_info:
        return {}
    source = master_info["slides"][slide_index - 1]["masterRegions"]
    scale = size["height"] / master_info["pageSize"]["height"]
    return {key: value * scale for key, value in source.items()}
