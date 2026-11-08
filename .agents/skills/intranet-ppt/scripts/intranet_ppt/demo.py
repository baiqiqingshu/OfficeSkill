"""Generate the self-contained offline element-library gallery (library-demo.html).

The page previews every loaded component at its original size, shows the sample
inputs used for compilation, embeds the theme palettes for client-side color
switching, and optionally renders a few composed examples. It is a display
artifact only: nothing here is loaded back by the toolchain.
"""
from __future__ import annotations

import json
from html import escape
from pathlib import Path
import shutil

from . import components, themes
from .cli import _directory_transaction

SKILL_ROOT = Path(__file__).resolve().parents[2]
BUILTIN_LIBRARY = SKILL_ROOT / "assets/libraries/builtin/library.json"
DEMO_FILENAME = "library-demo.html"
CARD_WIDTH = 340    # 组件卡片内画布可用宽度（px）
COMBO_WIDTH = 1088  # 组合示例卡片内画布可用宽度（px）
SAMPLE_IMAGE = "images/sample.png"  # 生成到输出目录的占位图，编译图片输入的 base_dir

_TABLE_SAMPLE = {"rows": [["项目", "指标", "状态"], ["接口联调", "86%", "正常"], ["数据迁移", "42%", "关注"]]}
_TEXT_HINTS = {
    "value": "92.6%", "num": "03", "number": "03", "no": "03", "index": "03", "step": "03",
    "date": "2026-01", "period": "第一阶段", "percent": "86%", "version": "v2.1",
    "label": "示例标签", "tag": "标签", "status": "进行中", "badge": "NEW",
    "title": "示例标题", "heading": "示例标题", "name": "示例名称", "caption": "示例图注",
}

# 组合示例：按固定组件 ID 引用，库中缺任一组件则整个示例跳过。
COMBOS = [
    {"title": "流程图编排", "desc": "flow-step × 3 与 flow-arrow × 2 横向组合成流程图",
     "direction": "h", "gap": 12, "pad": 24,
     "items": ["builtin/flow-step", "builtin/flow-arrow", "builtin/flow-step", "builtin/flow-arrow", "builtin/flow-step"]},
    {"title": "分层架构", "desc": "layer × 4 竖向叠放成分层架构图",
     "direction": "v", "gap": 10, "pad": 24,
     "items": ["builtin/layer", "builtin/layer", "builtin/layer", "builtin/layer"]},
    {"title": "目录编排", "desc": "agenda-item × 4 竖排组合成目录页内容",
     "direction": "v", "gap": 8, "pad": 24,
     "items": ["builtin/agenda-item", "builtin/agenda-item", "builtin/agenda-item", "builtin/agenda-item"]},
    {"title": "指标行", "desc": "metric × 3 横向排列成关键指标行",
     "direction": "h", "gap": 16, "pad": 24,
     "items": ["builtin/metric", "builtin/metric", "builtin/metric"]},
]


def _read_samples(component):
    """Return curated inputs from the library's samples.json, or {} if absent.

    Accepts keys ``库ID/组件ID``（推荐）或裸 ``组件ID``；value 可以是 inputs
    对象本身，也可以是 {"inputs": {...}} 包装。
    """
    path = Path(component["_root"]) / "samples.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    declared = set(component.get("inputs", {}))
    sample = data.get(f'{component["libraryId"]}/{component["id"]}')
    if sample is None:
        sample = data.get(component["id"])
    if not isinstance(sample, dict):
        return {}
    if "inputs" in sample and isinstance(sample["inputs"], dict) and "inputs" not in declared:
        sample = sample["inputs"]
    return {slot: value for slot, value in sample.items() if slot in declared}


def _auto_inputs(component, index):
    """Generate reasonable demo inputs for every declared slot of a component."""
    inputs = {}
    name = str(component.get("name", component["id"]))
    suffix = f" {index + 1}" if index else ""
    for slot, spec in component.get("inputs", {}).items():
        kind = spec.get("type")
        if kind in {"text", "richtext"}:
            inputs[slot] = _TEXT_HINTS.get(slot, f"{name}示例文本{suffix}".rstrip())
        elif kind == "list":
            inputs[slot] = [f"示例要点{index * 3 + i + 1}" for i in range(3)]
        elif kind == "table":
            inputs[slot] = dict(_TABLE_SAMPLE)
        elif kind == "image":
            inputs[slot] = SAMPLE_IMAGE
    return inputs


def _stage_image_inputs(component, inputs, stage):
    """Rewrite image inputs so they resolve inside the staged output directory.

    Samples may reference files inside the library directory; those are copied
    to stage/images/. Missing/invalid references fall back to the placeholder.
    """
    for slot, spec in component.get("inputs", {}).items():
        if spec.get("type") != "image" or slot not in inputs:
            continue
        value = inputs[slot]
        src = value.get("src") if isinstance(value, dict) else value
        staged = None
        if isinstance(src, str) and src:
            normalized = src.replace("\\", "/")
            safe = normalized and not normalized.startswith("/") and ":" not in normalized and ".." not in normalized.split("/")
            if safe and (stage / normalized).is_file():
                staged = normalized
            elif safe:
                try:
                    root = Path(component["_root"]).resolve()
                    candidate = (root / normalized).resolve()
                    if candidate.is_relative_to(root) and candidate.is_file():
                        name = f"{component['libraryId']}-{component['id']}-{slot}{candidate.suffix.lower()}"
                        target = stage / "images" / name
                        target.parent.mkdir(parents=True, exist_ok=True)
                        if not target.exists():
                            shutil.copyfile(candidate, target)
                        staged = f"images/{name}"
                except (OSError, ValueError):
                    staged = None
        if staged is None:
            staged = SAMPLE_IMAGE
        inputs[slot] = {**value, "src": staged} if isinstance(value, dict) else staged
    return inputs


def _inputs_for(component, stage, index=0):
    inputs = _auto_inputs(component, index)
    inputs.update(_read_samples(component))
    return _stage_image_inputs(component, inputs, stage)


def _placeholder(stage):
    """Draw a light 552×360 placeholder PNG used for image inputs."""
    target = stage / "images" / "sample.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        return
    from PIL import Image, ImageDraw
    image = Image.new("RGB", (552, 360), "#F0F5FA")
    draw = ImageDraw.Draw(image)
    draw.rectangle([16, 16, 535, 343], outline="#C5D3DF", width=2)
    draw.line([16, 16, 535, 343], fill="#D8E4EF", width=2)
    draw.line([535, 16, 16, 343], fill="#D8E4EF", width=2)
    draw.rectangle([16, 300, 535, 343], fill="#E4EFF8")
    draw.rectangle([236, 312, 315, 330], fill="#3F92CC")
    image.save(target)


def _canvas(nodes, width, height, max_width, max_scale=1.0):
    """Absolutely-positioned scene inside a .surface canvas, scaled to fit."""
    scale = min(max_scale, max_width / width)
    body = "".join(components._preview_node_html(node) for node in nodes)
    return (f'<div class="stage" style="height:{height * scale:g}px">'
            f'<div class="surface" style="width:{width:g}px;height:{height:g}px;'
            f'transform:scale({scale:g});transform-origin:top left">{body}</div></div>')


def _signature(component):
    parts = []
    for slot, spec in component.get("inputs", {}).items():
        required = "*" if spec.get("required") else ""
        parts.append(f"{slot}: {spec.get('type')}{required}")
    return "、".join(parts) if parts else "无输入"


def _component_card(key, component, stage):
    size = component["size"]
    width, height = size["width"], size["height"]
    inputs = _inputs_for(component, stage)
    element = {"id": "preview", "component": key,
               "box": {"x": 0, "y": 0, "w": width, "h": height}, "inputs": inputs}
    nodes = components.compile_element(element, {key: component}, Path(stage), {"width": width, "height": height})
    details = ""
    if component.get("inputs"):
        sample = escape(json.dumps(inputs, ensure_ascii=False, indent=2))
        details = f'<details><summary>示例输入 JSON</summary><pre>{sample}</pre></details>'
    return (f'<article class="card"><div class="meta"><span class="cname">{escape(str(component.get("name", component["id"])))}</span>'
            f'<code class="cid">{escape(key)}</code><span class="size">{width:g}×{height:g} px</span></div>'
            f'<div class="sig">inputs　{escape(_signature(component))}　（* 为必填）</div>'
            + _canvas(nodes, width, height, CARD_WIDTH, 2.0) + details + "</article>")


def _combo(spec, libraries, stage):
    if any(key not in libraries for key in spec["items"]):
        return ""  # 固定 ID 引用的组件缺失时跳过该示例
    gap, pad = spec["gap"], spec["pad"]
    sizes = [libraries[key]["size"] for key in spec["items"]]
    positions = []
    if spec["direction"] == "h":
        width = sum(size["width"] for size in sizes) + gap * (len(sizes) - 1) + pad * 2
        height = max(size["height"] for size in sizes) + pad * 2
        cursor = pad
        for size in sizes:
            positions.append((cursor, pad + (height - pad * 2 - size["height"]) / 2))
            cursor += size["width"] + gap
    else:
        width = max(size["width"] for size in sizes) + pad * 2
        height = sum(size["height"] for size in sizes) + gap * (len(sizes) - 1) + pad * 2
        cursor = pad
        for size in sizes:
            positions.append((pad + (width - pad * 2 - size["width"]) / 2, cursor))
            cursor += size["height"] + gap
    page_size = {"width": width, "height": height}
    nodes = []
    for index, (key, (x, y)) in enumerate(zip(spec["items"], positions)):
        component = libraries[key]
        element = {"id": f"c{index}", "component": key,
                   "box": {"x": x, "y": y, "w": component["size"]["width"], "h": component["size"]["height"]},
                   "inputs": _inputs_for(component, stage, index)}
        nodes.extend(components.compile_element(element, libraries, Path(stage), page_size))
    return (f'<article class="card"><div class="meta"><span class="cname">{escape(spec["title"])}</span>'
            f'<span class="size">{escape(spec["desc"])}</span></div>'
            + _canvas(nodes, width, height, COMBO_WIDTH) + "</article>")


_STYLE = """*{box-sizing:border-box}
body{margin:0;padding:32px 24px 48px;background:#EDF1F5;color:#17324D;font-family:"Microsoft YaHei",sans-serif}
header,main{max-width:1120px;margin:0 auto}
header h1{font-size:26px;margin:0 0 8px}
header .desc{color:#52687A;font-size:14px;margin:0 0 16px;line-height:1.7;max-width:900px}
.themes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.themes .hint{font-size:13px;color:#8496A8;margin-right:4px}
.themes button{border:1px solid #C5D3DF;background:#fff;color:#263C50;padding:6px 16px;font-size:13px;cursor:pointer;font-family:inherit}
.themes button.active{background:#1476B8;border-color:#1476B8;color:#fff}
h2{font-size:18px;margin:30px 0 4px}
h2 .sub{color:#8496A8;font-size:13px;font-weight:normal;margin-left:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;margin-top:14px}
.combos{display:grid;grid-template-columns:1fr;gap:16px;margin-top:14px}
.card{background:#fff;border:1px solid #D8E4EF;padding:14px}
.card .meta{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.cname{font-size:15px;font-weight:bold}
.cid{font-family:Consolas,monospace;font-size:12px;color:#1476B8;background:#F0F5FA;padding:1px 6px}
.size{color:#8496A8;font-size:12px}
.sig{font-size:12px;color:#52687A;margin:6px 0 10px;font-family:Consolas,monospace}
.stage{overflow:hidden}
.surface{position:relative;background:#fff;border:1px solid #D8E4EF}
details{margin-top:10px;font-size:12px;color:#52687A}
summary{cursor:pointer}
pre{background:#F5F8FB;border:1px solid #D8E4EF;padding:8px;overflow:auto;font-size:11px;line-height:1.5}
.text{white-space:pre-wrap;overflow:hidden;line-height:1.2}
table{table-layout:fixed;border-collapse:collapse}
td{border:1px solid #cbd5e1;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere}
"""

_SCRIPT = """const THEMES = __THEMES__;
function hexKey(token){
  let key = token.toUpperCase();
  if (key.length === 4) key = "#" + key[1] + key[1] + key[2] + key[2] + key[3] + key[3];
  return key;
}
function applyTheme(tid){
  const target = THEMES[tid];
  if (!target) return;
  const map = {};
  for (const other in THEMES){
    const colors = THEMES[other].colors;
    for (const token in colors) map[colors[token].toUpperCase()] = target.colors[token];
  }
  document.querySelectorAll("[style]").forEach(el => {
    el.style.cssText = el.style.cssText.replace(/#[0-9a-fA-F]{6}\\b|#[0-9a-fA-F]{3}\\b/g,
      m => map[hexKey(m)] || m);
  });
  document.body.dataset.theme = tid;
  document.querySelectorAll("[data-theme-btn]").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.themeBtn === tid));
}
document.querySelectorAll("[data-theme-btn]").forEach(btn =>
  btn.addEventListener("click", () => applyTheme(btn.dataset.themeBtn)));
"""


def render_gallery(libraries, stage):
    """Compile every component + combo and return the demo HTML document."""
    combo_cards = [card for spec in COMBOS if (card := _combo(spec, libraries, stage))]
    sections = []
    if combo_cards:
        sections.append('<h2>组合示例<span class="sub">同一编译管线渲染的固定编排，随主题一起换色</span></h2>'
                        '<div class="combos">' + "".join(combo_cards) + "</div>")
    groups = {}
    order = []
    for key, component in libraries.items():
        lid = component["libraryId"]
        if lid not in groups:
            groups[lid] = []
            order.append((lid, str(component.get("libraryName", lid))))
        groups[lid].append((key, component))
    for lid, lib_name in order:
        cards = "".join(_component_card(key, component, stage) for key, component in groups[lid])
        sections.append(f'<h2>组件库 · {escape(lib_name)}<span class="sub">{escape(lid)}　共 {len(groups[lid])} 个组件</span></h2>'
                        f'<div class="grid">{cards}</div>')
    buttons = []
    for tid, theme in themes.THEMES.items():
        active = ' class="active"' if tid == "blue" else ""
        buttons.append(f'<button type="button" data-theme-btn="{escape(tid)}"{active}>{escape(str(theme["name"]))}</button>')
    theme_buttons = "".join(buttons)
    canvas_rules = "".join(
        f'body[data-theme="{tid}"] .surface{{background:{theme["canvas"]};border-color:{theme["colors"]["BORDER_L"]}}}\n'
        for tid, theme in themes.THEMES.items())
    themes_json = json.dumps(themes.THEMES, ensure_ascii=False).replace("</", "<\\/")
    script = _SCRIPT.replace("__THEMES__", themes_json)
    return (
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>内网 PPT 元素库预览</title><style>{_STYLE}{canvas_rules}</style></head>'
        '<body data-theme="blue"><header><h1>内网 PPT 元素库预览</h1>'
        '<p class="desc">本页为离线生成的单文件页面，按原始尺寸渲染元素库全部组件，并附示例输入 JSON。'
        '点击下方按钮可在 5 套主题色板间切换，仅作用于组件画布内的规范色板色值；'
        '生成 PPTX 时通过配置 JSON 顶层 "theme" 字段获得同样效果。</p>'
        f'<div class="themes"><span class="hint">主题色板</span>{theme_buttons}</div></header>'
        '<main>' + "".join(sections) + f'</main><script>{script}</script></body></html>')


def build(destination, library_paths, overwrite):
    """Generate DIR/library-demo.html through the output-directory transaction."""
    paths = [Path(p).resolve() for p in (library_paths or [])]
    libraries = components.load_libraries(paths)
    sources = [BUILTIN_LIBRARY, *paths]
    if any(source.is_relative_to(destination) for source in sources):
        raise ValueError("输出目录不能包含输入元素库，请使用独立目录")

    def writer(stage):
        stage = Path(stage)
        _placeholder(stage)
        html = render_gallery(libraries, stage)
        (stage / DEMO_FILENAME).write_text(html, encoding="utf-8")
        return {"output": str(destination), "html": str(destination / DEMO_FILENAME),
                "components": len(libraries), "themes": themes.theme_ids()}

    return _directory_transaction(destination, overwrite, writer)
