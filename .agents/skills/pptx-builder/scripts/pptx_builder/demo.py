"""Generate the self-contained offline element-library gallery (library-demo.html).

The page puts whole-page examples first: every ``examples/*.json`` deck is
compiled through the normal component pipeline into a real 1280×720 slide and
shown scaled inside a card (with a lightbox for the full size). Below that the
loaded libraries are browsed group by group with searchable cards, the sample
inputs used for compilation, and a copy button that emits a paste-ready element
fragment. Theme palettes are embedded so the browser can repeat the same hex
swap the renderer performs server-side.

It is a display artifact only: nothing here is loaded back by the toolchain.
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
EXAMPLES_DIR = SKILL_ROOT / "examples"
DEMO_FILENAME = "library-demo.html"
SAMPLE_IMAGE = "images/sample.png"  # 生成到输出目录的占位图，编译图片输入的 base_dir
DEFAULT_PAGE_SIZE = {"width": 1280, "height": 720}
CARD_FALLBACK_WIDTH = 272  # 无 JS 时的组件画布宽度（卡片最小宽度减去内边距）
SLIDE_FALLBACK_WIDTH = 520  # 无 JS 时的整页画布宽度

_TABLE_SAMPLE = {"rows": [["项目", "指标", "状态"], ["接口联调", "86%", "正常"], ["数据迁移", "42%", "关注"]]}
_TEXT_HINTS = {
    "value": "92.6%", "num": "03", "number": "03", "no": "03", "index": "03", "step": "03",
    "date": "2026-01", "period": "第一阶段", "percent": "86%", "version": "v2.1",
    "label": "示例标签", "tag": "标签", "status": "进行中", "badge": "NEW",
    "title": "示例标题", "heading": "示例标题", "name": "示例名称", "caption": "示例图注",
}


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


def _stage_images(component, inputs, stage, base, prefix):
    """Rewrite image inputs so they resolve inside the staged output directory.

    Samples and deck elements may reference files next to the library manifest
    or next to the deck JSON; those are copied to stage/images/. Missing or
    invalid references fall back to the generated placeholder so compilation
    never fails on an image.
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
                    root = Path(base).resolve()
                    candidate = (root / normalized).resolve()
                    if (candidate.is_relative_to(root) and candidate.is_file()
                            and candidate.suffix.lower() in components.IMAGE_SUFFIXES):
                        name = f"{prefix}-{slot}{candidate.suffix.lower()}"
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


def _stage_image_inputs(component, inputs, stage):
    """Stage a component's own sample image inputs against the library folder."""
    return _stage_images(component, inputs, stage, component["_root"],
                         f"{component['libraryId']}-{component['id']}")


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


def _canvas(nodes, width, height, fallback_width, grid):
    """Scaled scene: a clipped canvas whose .surface is transformed to fit.

    Inline sizes are a no-JS fallback; the page script recomputes them from the
    real card width on load and on every resize.
    """
    scale = min(1.0, fallback_width / width)
    body = "".join(components._preview_node_html(node) for node in nodes)
    css_class = "canvas grid" if grid else "canvas"
    return (f'<div class="{css_class}" data-w="{width:g}" data-h="{height:g}" data-max="1" '
            f'style="width:{width * scale:.1f}px;height:{height * scale:.1f}px">'
            f'<div class="surface" style="width:{width:g}px;height:{height:g}px;'
            f'transform:scale({scale:.5f});transform-origin:top left">{body}</div></div>')


def _signature(component):
    parts = []
    for slot, spec in component.get("inputs", {}).items():
        required = '<span class="req">*</span>' if spec.get("required") else ""
        parts.append(f'{escape(str(slot))}: {escape(str(spec.get("type")))}' + required)
    return " · ".join(parts) if parts else "无输入"


def _element_snippet(component, key, inputs):
    size = component["size"]
    return {"id": str(component["id"]), "component": key,
            "box": {"x": 0, "y": 0, "w": size["width"], "h": size["height"]},
            "inputs": inputs}


def _component_card(key, component, stage):
    size = component["size"]
    width, height = size["width"], size["height"]
    inputs = _inputs_for(component, stage)
    element = _element_snippet(component, key, inputs)
    nodes = components.compile_element(element, {key: component}, Path(stage), {"width": width, "height": height})
    details = ""
    if component.get("inputs"):
        sample = escape(json.dumps(inputs, ensure_ascii=False, indent=2))
        details = f'<details class="sample"><summary>示例输入 JSON</summary><pre>{sample}</pre></details>'
    description = str(component.get("description", ""))
    haystack = " ".join(part for part in (str(component.get("name", "")), key, description) if part).lower()
    snippet = escape(json.dumps(element, ensure_ascii=False, separators=(",", ":")), quote=True)
    return (
        f'<article class="comp-card" data-search="{escape(haystack, quote=True)}"'
        + (f' title="{escape(description, quote=True)}"' if description else "")
        + '><div class="comp-head">'
        f'<span class="comp-name">{escape(str(component.get("name", component["id"])))}</span>'
        f'<code class="comp-id">{escape(key)}</code>'
        f'<span class="comp-size">{width:g}×{height:g}</span></div>'
        f'<div class="comp-sig">{_signature(component)}</div>'
        '<div class="fit">' + _canvas(nodes, width, height, CARD_FALLBACK_WIDTH, grid=True) + '</div>'
        + details +
        '<div class="comp-foot"><button class="copy" type="button" data-copy="' + snippet
        + '">复制元素 JSON</button></div></article>')


def _group_libraries(libraries):
    """Group loaded components by libraryId, keeping manifest order."""
    groups, order = {}, []
    for key, component in libraries.items():
        lid = component["libraryId"]
        if lid not in groups:
            groups[lid] = []
            order.append((lid, str(component.get("libraryName", lid))))
        groups[lid].append((key, component))
    return [(lid, name, groups[lid]) for lid, name in order]


def _deck_element(element, libraries, base, stage, deck_name):
    """Copy image inputs of a deck element into stage/images and rewrite them."""
    if not isinstance(element, dict):
        return element
    component = libraries.get(element.get("component"))
    inputs = element.get("inputs")
    if component is None or not isinstance(inputs, dict):
        return element
    if not any(spec.get("type") == "image" for spec in component.get("inputs", {}).values()):
        return element
    prefix = f"deck-{deck_name}-{element.get('id', 'element')}"
    return {**element, "inputs": _stage_images(component, dict(inputs), stage, base, prefix)}


def _page_size(value):
    if not isinstance(value, dict):
        return dict(DEFAULT_PAGE_SIZE)
    try:
        size = {"width": float(value["width"]), "height": float(value["height"])}
    except (KeyError, TypeError, ValueError):
        return dict(DEFAULT_PAGE_SIZE)
    if size["width"] <= 0 or size["height"] <= 0:
        return dict(DEFAULT_PAGE_SIZE)
    return size


def _load_decks(libraries, stage):
    """Compile every examples/*.json deck; skip broken pages with a reason.

    A page referencing a component that the current library set does not
    provide, or a page that fails to compile (missing image, bad box, ...), is
    dropped instead of failing the whole demo build.
    """
    decks, warnings = [], []
    for path in sorted(EXAMPLES_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError) as exc:
            warnings.append(f"{path.name}：无法读取（{exc}）")
            continue
        if not isinstance(data, dict) or not isinstance(data.get("pages"), list):
            continue
        size = _page_size(data.get("pageSize"))
        pages = []
        for index, page in enumerate(data["pages"]):
            elements = page.get("elements") if isinstance(page, dict) else None
            page_id = str(page.get("id") or f"page-{index + 1}") if isinstance(page, dict) else f"page-{index + 1}"
            if not isinstance(elements, list) or not elements:
                warnings.append(f"{path.name} / {page_id}：没有元素，已跳过")
                continue
            missing = sorted({str(element.get("component")) for element in elements
                              if isinstance(element, dict) and element.get("component") not in libraries})
            if missing:
                warnings.append(f"{path.name} / {page_id}：当前库未提供组件 {'、'.join(missing)}，已跳过")
                continue
            try:
                nodes = []
                for element in elements:
                    prepared = _deck_element(element, libraries, path.parent, stage, path.stem)
                    nodes.extend(components.compile_element(prepared, libraries, stage, size))
            except Exception as exc:  # 单页失败不影响整页 demo
                warnings.append(f"{path.name} / {page_id}：编译失败（{exc}），已跳过")
                continue
            pages.append({"id": page_id, "nodes": nodes})
        if not pages:
            warnings.append(f"{path.name}：没有可展示的页面，已跳过该示例")
            continue
        decks.append({"title": str(data.get("title") or path.stem), "file": path.name,
                      "pageSize": size, "pages": pages})
    # 页数多的示例排前面：默认选中的就是 11 页的 technical-proposal。
    decks.sort(key=lambda deck: (-len(deck["pages"]), deck["title"]))
    return decks, warnings


def _slide_card(deck_index, page_index, page, deck):
    title = escape(deck["title"], quote=True)
    return (f'<figure class="slide-card" data-label="{title}" data-page-id="{escape(page["id"], quote=True)}">'
            f'<button class="slide-open" type="button" data-deck="{deck_index}" data-open="{page_index}"'
            f' aria-label="放大查看「{title}」第 {page_index + 1} 页">'
            + _canvas(page["nodes"], deck["pageSize"]["width"], deck["pageSize"]["height"],
                      SLIDE_FALLBACK_WIDTH, grid=False)
            + '</button>'
            f'<figcaption><span>第 {page_index + 1} 页</span><code>{escape(page["id"])}</code></figcaption>'
            '</figure>')


def _decks_section(decks, warnings):
    if not decks:
        return ('<section class="section" id="decks">'
                '<div class="sec-head"><h2>整页示例</h2></div>'
                '<p class="empty">未找到可展示的整页示例（examples/*.json）。</p></section>')
    tabs, panels = [], []
    for deck_index, deck in enumerate(decks):
        active = deck_index == 0
        tabs.append(f'<button class="tab{" active" if active else ""}" type="button" role="tab"'
                    f' id="deck-tab-{deck_index}" aria-controls="deck-panel-{deck_index}"'
                    f' aria-selected="{"true" if active else "false"}" data-deck-tab="{deck_index}">'
                    f'<span class="tab-title">{escape(deck["title"])}</span>'
                    f'<span class="n">{len(deck["pages"])} 页</span></button>')
        cards = "".join(_slide_card(deck_index, page_index, page, deck)
                        for page_index, page in enumerate(deck["pages"]))
        panels.append(f'<div class="deck-panel" role="tabpanel" id="deck-panel-{deck_index}"'
                      f' aria-labelledby="deck-tab-{deck_index}" data-deck-panel="{deck_index}"'
                      + ('' if active else ' hidden') + '>'
                      f'<div class="deck-meta">{escape(deck["file"])} · '
                      f'{deck["pageSize"]["width"]:g}×{deck["pageSize"]["height"]:g}</div>'
                      f'<div class="deck-pages">{cards}</div></div>')
    notice = ""
    if warnings:
        items = "".join(f"<li>{escape(item)}</li>" for item in warnings)
        notice = (f'<details class="notice"><summary>{len(warnings)} 条整页示例提示（被跳过的页面不会影响其余展示）'
                  f'</summary><ul>{items}</ul></details>')
    return ('<section class="section" id="decks" data-nav="decks">'
            '<div class="sec-head"><h2>整页示例</h2>'
            '<span class="sub">examples/*.json 编译进完整页面后等比缩放 · 点击卡片放大</span></div>'
            + notice + '<div class="tabs" role="tablist">' + "".join(tabs) + '</div>'
            + "".join(panels) + '</section>')


_STYLE = """*{box-sizing:border-box}
[hidden]{display:none!important}
html{scroll-behavior:smooth}
body{margin:0;background:#F2F5F9;color:#17324D;font-family:"Microsoft YaHei","Segoe UI",sans-serif;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
:root{--body:#33485C;--muted:#5C7285;--faint:#8496A8;--accent:#1476B8;--accent-soft:#E7F1FA;--line:#E2E8F0;--line-soft:#EDF2F7;--radius:12px;--shadow:0 1px 2px rgba(15,27,42,.05),0 10px 26px -16px rgba(15,27,42,.28)}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
/* ---------- sidebar ---------- */
.sidebar{position:fixed;left:0;top:0;bottom:0;width:248px;z-index:40;display:flex;flex-direction:column;background:#0F1B2A;color:#C9D6E4}
.brand{padding:22px 20px 12px}
.brand b{display:block;color:#fff;font-size:17px;letter-spacing:.6px}
.brand span{display:block;margin-top:2px;font-size:11px;letter-spacing:1.6px;color:#7E93A8}
.brand .count{margin-top:10px;font-size:12px;color:#8FA6BB}
.brand .count b{display:inline;font-size:12px;color:#5BB0E8;letter-spacing:0}
.search{padding:4px 16px 10px}
.search input{width:100%;padding:8px 10px;border-radius:8px;border:1px solid #24384F;background:#16263A;color:#E6EEF7;font:inherit;font-size:13px}
.search input::placeholder{color:#6E8398}
.search input:focus{border-color:#3E86BC;outline:none;box-shadow:0 0 0 2px rgba(62,134,188,.28)}
.swatches{display:flex;flex-wrap:wrap;gap:6px;padding:2px 16px 14px}
.swatch{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;border:1px solid #24384F;background:#16263A;color:#C9D6E4;font:inherit;font-size:12px;cursor:pointer}
.swatch i{width:10px;height:10px;border-radius:50%;background:var(--dot);box-shadow:0 0 0 1px rgba(255,255,255,.18) inset}
.swatch:hover{border-color:#3C5875;color:#fff}
.swatch.active{background:#1476B8;border-color:#2E8FD0;color:#fff}
.nav{flex:1 1 auto;overflow:auto;padding:6px 10px 14px;border-top:1px solid #1B2B3E}
.nav-label{padding:10px 10px 4px;font-size:11px;letter-spacing:1.2px;color:#647C92}
.nav a{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:7px;color:#B9C9D8;text-decoration:none;font-size:13px}
.nav a:hover{background:#16263A;color:#fff}
.nav a.active{background:#1476B8;color:#fff}
.nav a .n{font-size:11px;color:#7E93A8}
.nav a.active .n{color:#D6E8F6}
.side-foot{padding:12px 20px 16px;border-top:1px solid #1B2B3E;font-size:11px;line-height:1.7;color:#647C92}
/* ---------- main ---------- */
main{margin-left:248px;padding:34px 40px 64px}
.wrap{max-width:1200px;margin:0 auto}
.hero h1{margin:0 0 10px;font-size:30px;letter-spacing:.5px;color:#0F1B2A}
.hero p{margin:0 0 16px;max-width:860px;font-size:14px;line-height:1.8;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip{padding:6px 14px;border-radius:999px;border:1px solid var(--line);background:#fff;box-shadow:var(--shadow);font-size:12px;color:var(--muted)}
.chip b{margin-right:4px;font-size:14px;color:var(--accent)}
.section{margin-top:34px;scroll-margin-top:20px}
.sec-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.sec-head h2{margin:0;font-size:20px;color:#0F1B2A}
.sec-head h2::before{content:"";display:inline-block;width:4px;height:16px;margin-right:9px;border-radius:2px;background:var(--accent);vertical-align:-2px}
.sec-head .sub{font-size:12px;color:var(--faint)}
.notice{margin:0 0 14px;padding:10px 14px;border:1px solid #F0DFC0;border-radius:10px;background:#FDF7EC;font-size:12px;color:#8A6A2C}
.notice summary{cursor:pointer}
.notice ul{margin:8px 0 0;padding-left:18px;line-height:1.7}
.empty{margin:14px 0;padding:18px;border:1px dashed var(--line);border-radius:var(--radius);background:#fff;text-align:center;color:var(--faint);font-size:13px}
/* ---------- deck tabs ---------- */
.tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.tab{display:inline-flex;align-items:center;gap:8px;max-width:100%;padding:9px 14px;border-radius:10px;border:1px solid var(--line);background:#fff;box-shadow:var(--shadow);font:inherit;font-size:13px;color:var(--body);cursor:pointer}
.tab-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px}
.tab .n{padding:1px 7px;border-radius:999px;background:var(--line-soft);font-size:11px;color:var(--faint)}
.tab:hover{border-color:#B9D6EC;color:var(--accent)}
.tab.active{border-color:var(--accent);background:var(--accent);color:#fff}
.tab.active .n{background:rgba(255,255,255,.2);color:#fff}
.deck-panel{display:block}
.deck-meta{margin:0 0 10px;font-size:12px;color:var(--faint);font-family:Consolas,monospace}
.deck-pages{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
/* ---------- canvases ---------- */
.canvas{position:relative;overflow:hidden;border-radius:8px;background-color:var(--canvas);box-shadow:0 0 0 1px var(--canvas-line)}
.canvas.grid{background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:18px 18px}
.surface{position:relative;transform-origin:top left}
.surface .text{white-space:pre-wrap;overflow:hidden;line-height:1.2}
.surface table{table-layout:fixed;border-collapse:collapse}
.surface td,.surface th{padding:0;white-space:pre-wrap;overflow-wrap:anywhere}
.surface img{display:block}
/* ---------- slide cards ---------- */
.slide-card{margin:0;padding:12px;border:1px solid var(--line);border-radius:var(--radius);background:#fff;box-shadow:var(--shadow);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
.slide-card:hover{transform:translateY(-2px);border-color:#B9D6EC;box-shadow:0 16px 34px -20px rgba(15,27,42,.42)}
.slide-open{display:block;width:100%;padding:0;border:0;background:none;font:inherit;cursor:zoom-in;border-radius:8px}
.slide-card figcaption{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:10px;font-size:12px;color:var(--muted)}
.slide-card figcaption code{font-family:Consolas,monospace;font-size:11px;color:var(--faint)}
/* ---------- component cards ---------- */
.comp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
.comp-card{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--line);border-radius:var(--radius);background:#fff;box-shadow:var(--shadow);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
.comp-card:hover{transform:translateY(-2px);border-color:#B9D6EC;box-shadow:0 16px 34px -20px rgba(15,27,42,.42)}
.comp-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.comp-name{font-size:15px;font-weight:bold;color:#0F1B2A}
.comp-id{padding:1px 6px;border-radius:5px;background:var(--accent-soft);font-family:Consolas,monospace;font-size:11px;color:var(--accent)}
.comp-size{margin-left:auto;font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums}
.comp-sig{font-family:Consolas,monospace;font-size:12px;line-height:1.6;color:var(--muted);overflow-wrap:anywhere}
.comp-sig .req{color:#B3372F}
.fit{display:flex;align-items:center;justify-content:center;min-height:96px}
.sample{padding-top:8px;border-top:1px dashed var(--line);font-size:12px;color:var(--muted)}
.sample summary{cursor:pointer;color:var(--body)}
.sample summary:hover{color:var(--accent)}
.sample pre{margin:8px 0 0;max-height:220px;overflow:auto;padding:10px;border:1px solid var(--line-soft);border-radius:8px;background:#F7FAFD;font-family:Consolas,monospace;font-size:11px;line-height:1.55;color:#33506C}
.comp-foot{display:flex;justify-content:flex-end;margin-top:auto}
.copy{padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;font:inherit;font-size:12px;color:var(--body);cursor:pointer}
.copy:hover{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
.copy:active{transform:translateY(1px)}
/* ---------- lightbox ---------- */
.lb{position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
.lb-backdrop{position:absolute;inset:0;background:rgba(9,17,27,.86)}
.lb-fit{position:relative;z-index:1;display:flex;align-items:center;justify-content:center}
.lb-bar{position:relative;z-index:1;display:flex;align-items:center;gap:14px;max-width:90vw;font-size:13px;color:#DCE8F3}
.lb-bar #lb-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46vw}
.lb-bar #lb-page{flex:none;color:#8FA6BB;font-variant-numeric:tabular-nums}
.lb-nav{position:absolute;top:50%;z-index:2;width:44px;height:64px;margin-top:-32px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(22,38,58,.72);color:#E6EEF7;font-size:26px;line-height:1;cursor:pointer}
.lb-nav:hover{background:rgba(20,118,184,.9);border-color:#2E8FD0}
.lb-prev{left:18px}
.lb-next{right:18px}
.lb-close{position:absolute;top:16px;right:18px;z-index:2;width:38px;height:38px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(22,38,58,.72);color:#E6EEF7;font-size:20px;line-height:1;cursor:pointer}
.lb-close:hover{background:rgba(179,55,47,.9);border-color:#B3372F}
body.lb-open{overflow:hidden}
/* ---------- footer / toast ---------- */
.page-foot{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);font-size:12px;line-height:1.8;color:var(--faint)}
.toast{position:fixed;left:50%;bottom:26px;z-index:120;transform:translate(-50%,14px);padding:9px 18px;border-radius:999px;background:#0F1B2A;color:#fff;font-size:13px;opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease}
.toast.show{opacity:1;transform:translate(-50%,0)}
@media (max-width:1100px){.deck-pages{grid-template-columns:minmax(0,1fr)}}
@media (max-width:860px){main{margin-left:0;padding:20px 16px 48px}.sidebar{position:static;width:auto;flex-direction:row;flex-wrap:wrap;align-items:center}.nav{flex-basis:100%;max-height:220px}.side-foot{flex-basis:100%}}
@media print{.sidebar,.tabs,.lb,.toast,.copy,.search,.deck-meta{display:none}main{margin:0;padding:0}.wrap{max-width:none}.deck-panel[hidden]{display:block!important}.deck-pages{grid-template-columns:repeat(2,minmax(0,1fr))}.slide-card,.comp-card{break-inside:avoid;box-shadow:none;transform:none}body{background:#fff}}
"""

_SCRIPT = """(function () {
  "use strict";
  var THEMES = __THEMES__;
  var BASE = __CANONICAL__;
  var WARNINGS = __WARNINGS__;
  if (WARNINGS.length && window.console && window.console.warn) {
    WARNINGS.forEach(function (item) { window.console.warn("[library-demo] " + item); });
  }

  /* ---------- theme: replace canonical hex tokens inside .surface only ---------- */
  function hexKey(token) {
    var key = token.toUpperCase();
    if (key.length === 4) key = "#" + key[1] + key[1] + key[2] + key[2] + key[3] + key[3];
    return key;
  }
  function applyTheme(tid) {
    var target = THEMES[tid];
    if (!target) return;
    // Component HTML is compiled with the canonical palette; map those source
    // hexes to the target theme. Using one canonical source avoids collisions
    // between tokens that share a color inside a specific theme.
    var map = {};
    for (var token in BASE) {
      if (Object.prototype.hasOwnProperty.call(BASE, token)) map[BASE[token].toUpperCase()] = target.colors[token];
    }
    map["#000000"] = tid === "graphite" ? target.colors.BODY : "#000000";
    // Read the raw attribute: CSSOM (style.cssText) serializes colors as
    // rgb(...), which would hide every hex token from the swap. Keep the
    // original (blue) value so repeated switches always map from the source
    // palette instead of from the previously applied theme.
    var nodes = document.querySelectorAll(".surface [style]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (typeof node.__baseStyle !== "string") node.__baseStyle = node.getAttribute("style") || "";
      var raw = node.__baseStyle;
      if (!raw) continue;
      var next = raw.replace(/#[0-9a-fA-F]{6}\\b|#[0-9a-fA-F]{3}\\b/g,
        function (match) { return map[hexKey(match)] || match; });
      node.setAttribute("style", next);
    }
    document.body.setAttribute("data-theme", tid);
    var buttons = document.querySelectorAll("[data-theme-btn]");
    for (var j = 0; j < buttons.length; j++) {
      var on = buttons[j].getAttribute("data-theme-btn") === tid;
      buttons[j].classList.toggle("active", on);
      buttons[j].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  var themeButtons = document.querySelectorAll("[data-theme-btn]");
  for (var t = 0; t < themeButtons.length; t++) {
    themeButtons[t].addEventListener("click", function () {
      applyTheme(this.getAttribute("data-theme-btn"));
    });
  }

  /* ---------- scale canvases to their card width ---------- */
  function fitCanvas(canvas, availW, availH) {
    var w = parseFloat(canvas.getAttribute("data-w"));
    var h = parseFloat(canvas.getAttribute("data-h"));
    if (!w || !h) return;
    var max = parseFloat(canvas.getAttribute("data-max") || "1");
    var scale = max;
    if (availW > 0) scale = Math.min(scale, availW / w);
    if (availH > 0) scale = Math.min(scale, availH / h);
    if (!isFinite(scale) || scale <= 0) return;
    canvas.style.width = Math.round(w * scale) + "px";
    canvas.style.height = Math.round(h * scale) + "px";
    var surface = canvas.firstElementChild;
    if (surface) surface.style.transform = "scale(" + scale + ")";
  }
  function fitAll() {
    var list = document.querySelectorAll(".canvas[data-w]");
    for (var i = 0; i < list.length; i++) {
      var canvas = list[i];
      if (canvas.getAttribute("data-lb")) continue;
      var host = canvas.parentElement;
      var avail = host ? host.clientWidth : 0;
      if (!avail) continue;
      fitCanvas(canvas, avail, 0);
    }
    fitLightbox();
  }
  var pending = null;
  function scheduleFit() {
    if (pending) return;
    pending = window.requestAnimationFrame(function () { pending = null; fitAll(); });
  }
  window.addEventListener("resize", scheduleFit);
  window.addEventListener("load", scheduleFit);

  /* ---------- deck tabs ---------- */
  function showDeck(index) {
    var tabs = document.querySelectorAll("[data-deck-tab]");
    var panels = document.querySelectorAll("[data-deck-panel]");
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute("data-deck-tab") === index;
      tabs[i].classList.toggle("active", on);
      tabs[i].setAttribute("aria-selected", on ? "true" : "false");
    }
    for (var j = 0; j < panels.length; j++) {
      panels[j].hidden = panels[j].getAttribute("data-deck-panel") !== index;
    }
    fitAll();
  }

  /* ---------- lightbox ---------- */
  var lb = document.getElementById("lightbox");
  var lbFit = document.getElementById("lb-fit");
  var lbTitle = document.getElementById("lb-title");
  var lbPage = document.getElementById("lb-page");
  var lbState = { deck: "0", page: 0 };
  var lastFocus = null;

  function deckCards(deck) {
    return document.querySelectorAll('[data-deck-panel="' + deck + '"] .slide-card');
  }
  function fitLightbox() {
    if (!lb || lb.hidden || !lbFit) return;
    var canvas = lbFit.querySelector(".canvas");
    if (!canvas) return;
    fitCanvas(canvas, window.innerWidth * 0.9, window.innerHeight * 0.78);
  }
  function openLightbox(deck, page) {
    var cards = deckCards(deck);
    if (!cards.length) return;
    page = Math.max(0, Math.min(cards.length - 1, page));
    var canvas = cards[page].querySelector(".canvas");
    if (!canvas) return;
    lbFit.innerHTML = "";
    var clone = canvas.cloneNode(true);
    clone.setAttribute("data-lb", "1");
    clone.setAttribute("data-max", "1.6");
    var surface = clone.firstElementChild;
    if (surface) surface.style.transform = "";
    lbFit.appendChild(clone);
    lbState.deck = deck;
    lbState.page = page;
    lb.hidden = false;
    document.body.classList.add("lb-open");
    if (lbTitle) lbTitle.textContent = cards[page].getAttribute("data-label") || "";
    if (lbPage) {
      var pageId = cards[page].getAttribute("data-page-id") || "";
      lbPage.textContent = "第 " + (page + 1) + " / " + cards.length + " 页" + (pageId ? " · " + pageId : "");
    }
    fitLightbox();
    if (lastFocus === null) lastFocus = document.activeElement;
    var close = lb.querySelector(".lb-close");
    if (close) close.focus();
  }
  function closeLightbox() {
    if (!lb || lb.hidden) return;
    lb.hidden = true;
    document.body.classList.remove("lb-open");
    if (lbFit) lbFit.innerHTML = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }
  function stepLightbox(delta) {
    if (!lb || lb.hidden) return;
    var cards = deckCards(lbState.deck);
    if (!cards.length) return;
    openLightbox(lbState.deck, (lbState.page + delta + cards.length) % cards.length);
  }

  /* ---------- copy element JSON ---------- */
  var toast = document.getElementById("toast");
  var toastTimer = null;
  function notify(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("show");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 1800);
  }
  function legacyCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }
  function copyElement(button) {
    var text = button.getAttribute("data-copy") || "";
    function done(ok) {
      notify(ok ? "已复制元素 JSON，可直接粘贴到 pages[].elements" : "复制失败，请展开示例 JSON 手动复制");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); },
        function () { done(legacyCopy(text)); });
    } else {
      done(legacyCopy(text));
    }
  }

  /* ---------- search ---------- */
  var search = document.getElementById("search-input");
  var compCards = document.querySelectorAll(".comp-card");
  var libGroups = document.querySelectorAll(".lib-group");
  var emptyHint = document.getElementById("search-empty");
  function runSearch() {
    var term = (search && search.value ? search.value : "").trim().toLowerCase();
    var shown = 0;
    for (var i = 0; i < compCards.length; i++) {
      var hay = compCards[i].getAttribute("data-search") || "";
      var hit = !term || hay.indexOf(term) !== -1;
      compCards[i].hidden = !hit;
      if (hit) shown++;
    }
    for (var j = 0; j < libGroups.length; j++) {
      libGroups[j].hidden = !libGroups[j].querySelector(".comp-card:not([hidden])");
    }
    if (emptyHint) emptyHint.hidden = shown > 0;
  }
  if (search) search.addEventListener("input", runSearch);

  /* ---------- delegated clicks ---------- */
  document.addEventListener("click", function (event) {
    var node = event.target;
    if (!node || !node.closest) return;
    var opener = node.closest("[data-open]");
    if (opener) {
      openLightbox(opener.getAttribute("data-deck"), parseInt(opener.getAttribute("data-open"), 10));
      return;
    }
    if (node.closest("[data-lb-close]")) { closeLightbox(); return; }
    if (node.closest("[data-lb-prev]")) { stepLightbox(-1); return; }
    if (node.closest("[data-lb-next]")) { stepLightbox(1); return; }
    var tab = node.closest("[data-deck-tab]");
    if (tab) { showDeck(tab.getAttribute("data-deck-tab")); return; }
    var copy = node.closest("[data-copy]");
    if (copy) { copyElement(copy); }
  });

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", function (event) {
    if (!lb || lb.hidden) {
      if (event.key === "/" && search && document.activeElement !== search) {
        event.preventDefault();
        search.focus();
      }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); closeLightbox(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); stepLightbox(-1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); stepLightbox(1); }
  });

  /* ---------- scroll spy ---------- */
  var links = document.querySelectorAll(".nav a[href^='#']");
  var marks = [];
  for (var k = 0; k < links.length; k++) {
    var target = document.getElementById(links[k].getAttribute("href").slice(1));
    if (target) marks.push({ id: target.id, el: target, link: links[k] });
  }
  function markNav(id) {
    for (var i = 0; i < marks.length; i++) marks[i].link.classList.toggle("active", marks[i].id === id);
  }
  function syncNav() {
    var line = window.scrollY + window.innerHeight * 0.3;
    var current = marks.length ? marks[0].id : "";
    for (var i = 0; i < marks.length; i++) {
      if (marks[i].el.getBoundingClientRect().top + window.scrollY <= line) current = marks[i].id;
    }
    markNav(current);
  }
  var navPending = null;
  window.addEventListener("scroll", function () {
    if (navPending) return;
    navPending = window.requestAnimationFrame(function () { navPending = null; syncNav(); });
  }, { passive: true });

  /* ---------- boot ---------- */
  applyTheme(document.body.getAttribute("data-theme") || __DEFAULT_THEME__);
  var firstTab = document.querySelector("[data-deck-tab]");
  if (firstTab) showDeck(firstTab.getAttribute("data-deck-tab")); else fitAll();
  syncNav();
  runSearch();
}());
"""


def _theme_css():
    """Per-theme canvas variables; component/slide surfaces follow the theme."""
    rules = []
    for tid, theme in themes.THEMES.items():
        canvas = str(theme.get("canvas", "#FFFFFF"))
        try:
            rgb = [int(canvas[i:i + 2], 16) for i in (1, 3, 5)]
            dark = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) < 128
        except (ValueError, IndexError):
            dark = False
        grid = "rgba(255,255,255,.07)" if dark else "rgba(23,50,77,.055)"
        line = theme["colors"].get("BORDER_L", "#E2E8F0")
        rules.append(f'body[data-theme="{tid}"]{{--canvas:{canvas};--canvas-line:{line};--grid:{grid}}}')
    return "\n".join(rules)


def _theme_buttons(default):
    buttons = []
    for tid, theme in themes.THEMES.items():
        active = tid == default
        dot = theme["colors"].get("ACCENT", "#1476B8")
        buttons.append(f'<button class="swatch{" active" if active else ""}" type="button"'
                       f' data-theme-btn="{escape(tid)}" aria-pressed="{"true" if active else "false"}"'
                       f' style="--dot:{escape(dot)}"><i></i>{escape(str(theme.get("name", tid)))}</button>')
    return "".join(buttons)


def render_gallery(libraries, decks, warnings, stage):
    """Compile every component and return the demo HTML document."""
    groups = _group_libraries(libraries)
    component_total = len(libraries)
    page_total = sum(len(deck["pages"]) for deck in decks)
    theme_total = len(themes.THEMES)
    default_theme = themes.DEFAULT_THEME

    nav_links = [f'<a href="#decks">整页示例<span class="n">{page_total}</span></a>']
    group_sections = []
    for lid, name, items in groups:
        anchor = f"lib-{lid}"
        nav_links.append(f'<a href="#{escape(anchor)}">{escape(name)}<span class="n">{len(items)}</span></a>')
        cards = "".join(_component_card(key, component, stage) for key, component in items)
        group_sections.append(
            f'<section class="section lib-group" id="{escape(anchor)}">'
            f'<div class="sec-head"><h2>{escape(name)}</h2>'
            f'<span class="sub"><code>{escape(lid)}</code> · {len(items)} 个组件</span></div>'
            f'<div class="comp-grid">{cards}</div></section>')

    hero = (f'<header class="hero"><h1>PPTX Builder 元素库</h1>'
            f'<p>本页由 <code>ppt_tool.py demo</code> 离线生成：先用 <code>examples/*.json</code> 在完整页面里'
            f'（默认 1280×720）展示组件编排效果，再按库分组浏览全部 {component_total} 个组件。'
            f'主题色板按钮会让整页示例与组件预览同步换色（只替换规范色板内的色值）；'
            f'组件卡片里的「复制元素 JSON」可直接粘贴进配置的 <code>pages[].elements</code>。'
            f'整页示例只渲染组件内容，不显示公司母版的固定背景与页脚，最终以生成的 PPTX 为准。'
            f'页面无外部字体、图片与网络请求。</p>'
            f'<div class="chips"><span class="chip"><b>{component_total}</b>个组件</span>'
            f'<span class="chip"><b>{len(decks)}</b>份整页示例 · <b>{page_total}</b>页</span>'
            f'<span class="chip"><b>{theme_total}</b>套主题色板</span></div></header>')

    sidebar = ('<aside class="sidebar"><div class="brand"><b>PPTX Builder</b><span>元素库 v3</span>'
               f'<div class="count"><b>{component_total}</b> 组件 · <b>{page_total}</b> 整页</div></div>'
               '<div class="search"><input id="search-input" type="search" autocomplete="off"'
               ' placeholder="搜索组件名 / ID / 描述" aria-label="搜索组件"></div>'
               f'<div class="swatches" role="group" aria-label="主题色板">{_theme_buttons(default_theme)}</div>'
               '<nav class="nav" aria-label="页面导航"><div class="nav-label">浏览</div>'
               + "".join(nav_links) +
               '</nav><div class="side-foot">离线生成 · 双击 library-demo.html 打开<br>无外部字体、图片与网络请求</div>'
               '</aside>')

    lightbox = ('<div class="lb" id="lightbox" role="dialog" aria-modal="true" aria-label="整页示例放大查看" hidden>'
                '<div class="lb-backdrop" data-lb-close></div>'
                '<button class="lb-nav lb-prev" type="button" data-lb-prev aria-label="上一页">‹</button>'
                '<button class="lb-nav lb-next" type="button" data-lb-next aria-label="下一页">›</button>'
                '<div class="lb-fit" id="lb-fit"></div>'
                '<div class="lb-bar"><span id="lb-title"></span><span id="lb-page"></span></div>'
                '<button class="lb-close" type="button" data-lb-close aria-label="关闭">×</button></div>')

    footer = (f'<footer class="page-foot">本页为离线单文件产物：组件与整页示例均由 <code>components.compile_element</code> '
              f'编译，图片以 data URI 内联，无外部资源与网络请求。<br>'
              f'组件 {component_total} 个 · 整页示例 {len(decks)} 份 {page_total} 页 · 主题 {theme_total} 套 · '
              f'重新生成：<code>python scripts/ppt_tool.py demo --out 输出目录</code></footer>')

    body = (sidebar + '<main><div class="wrap">' + hero
            + _decks_section(decks, warnings)
            + '<section class="section" id="library">'
              '<div class="sec-head"><h2>组件库</h2>'
              f'<span class="sub">按库分组 · 预览按卡片宽度等比缩放（最大 1:1）</span></div>'
              '<p class="empty" id="search-empty" hidden>没有匹配的组件，换个关键词试试。</p></section>'
            + "".join(group_sections) + footer + '</div></main>' + lightbox
            + '<div class="toast" id="toast" role="status" aria-live="polite"></div>')

    style = _STYLE + "\n" + _theme_css() + "\n"
    script = (_SCRIPT
              .replace("__THEMES__", json.dumps(themes.THEMES, ensure_ascii=False).replace("</", "<\\/"))
              .replace("__CANONICAL__", json.dumps(themes.CANONICAL, ensure_ascii=False).replace("</", "<\\/"))
              .replace("__WARNINGS__", json.dumps(warnings, ensure_ascii=False).replace("</", "<\\/"))
              .replace("__DEFAULT_THEME__", json.dumps(themes.DEFAULT_THEME)))
    return (
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; '
        'style-src \'unsafe-inline\'; script-src \'unsafe-inline\'">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>PPTX Builder 元素库</title>'
        f'<style>{style}</style></head><body data-theme="{escape(default_theme)}">'
        + body + f'<script>{script}</script></body></html>')


def build(destination, library_paths, overwrite):
    """Generate DIR/library-demo.html through the output-directory transaction."""
    paths = [Path(p).resolve() for p in (library_paths or [])]
    libraries = components.load_libraries(paths)
    sources = [BUILTIN_LIBRARY, *paths, EXAMPLES_DIR]
    if any(source.is_relative_to(destination) for source in sources):
        raise ValueError("输出目录不能包含输入元素库或示例目录，请使用独立目录")

    def writer(stage):
        stage = Path(stage)
        _placeholder(stage)
        decks, warnings = _load_decks(libraries, stage)
        html = render_gallery(libraries, decks, warnings, stage)
        (stage / DEMO_FILENAME).write_text(html, encoding="utf-8")
        return {"output": str(destination), "html": str(destination / DEMO_FILENAME),
                "components": len(libraries), "themes": themes.theme_ids(),
                "decks": len(decks), "pages": sum(len(deck["pages"]) for deck in decks),
                "skipped": warnings}

    return _directory_transaction(destination, overwrite, writer)
