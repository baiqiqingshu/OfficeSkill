"""Regenerate the offline demonstration gallery; no network or dependencies."""
import argparse
import html
import struct
import zlib
from pathlib import Path

from ucd import ROOT, build, catalog, read_json, styles


def banner():
    width,height=720,240
    pixels=[]
    for y in range(height):
        row=bytearray()
        for x in range(width):
            color=(235,241,252)
            if (x-570)**2+(y-120)**2<135**2:color=(211,225,250)
            if 42<x<375 and 54<y<78:color=(39,92,206)
            if 42<x<290 and 94<y<107:color=(112,142,191)
            if 42<x<325 and 122<y<135:color=(151,172,208)
            if 42<x<155 and 169<y<199:color=(39,92,206)
            if 482<x<656 and 57<y<187:color=(255,255,255)
            if 506<x<630 and 84<y<94:color=(216,226,242)
            if 506<x<596 and 112<y<122:color=(216,226,242)
            if 506<x<615 and 141<y<158:color=(39,92,206)
            row.extend(color)
        pixels.append(b'\0'+row)
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(pixels)))+chunk(b'IEND',b'')


def make(out):
    out=Path(out)
    combinations=[('dashboard','ocean'),('admin','slate'),('workbench','jade'),('form','plum'),('detail','warm'),('kanban','midnight')]
    for layout,style in combinations:
        spec=read_json(ROOT/f'examples/{layout}.json');spec['style']=style
        build(spec,out/layout)
    # A complete component page also demonstrates packaging local media.
    component_out=out/'components';local=component_out/'local';local.mkdir(parents=True,exist_ok=True)
    if not (local/'cover.png').exists():(local/'cover.png').write_bytes(banner())
    spec=read_json(ROOT/'examples/dashboard.json')
    spec.update(title='组件与状态',description='16 种生成区块的完整预览；基础按钮、字段与弹窗可通过本地检索按需获取。',action='体验弹窗',assets=[{'source':'local/cover.png','name':'cover.png'}],blocks={})
    for entry in catalog():
        if entry['kind']!='component' or entry.get('primitive'):continue
        block={**entry['example']}
        if entry['id'] in ('stats','table','kanban','alert','steps','image'):block['span']='full'
        if entry['id']=='image':block.update(src='assets/cover.png',alt='本地生成的界面示意封面',caption='使用 Python 标准库生成的 PNG；页面不请求任何远程媒体。')
        spec['blocks']['sample-'+entry['id']]=block
    build(spec,component_out)
    for mode in ('library','editable'):
        build(read_json(ROOT/'examples/admin.json'),out/mode,mode)
    panels=[]
    names=read_json(ROOT/'data/layouts.json')
    for i,(layout,style) in enumerate(combinations,1):
        tokens=styles()[style]['tokens']
        panels.append(f'''<a class="sample" href="{layout}/index.html" style="--accent:{tokens['primary']};--tint:{tokens['soft']}"><div class="sample-visual"><div class="mini-side"><i></i><i></i><i></i></div><div class="mini-main"><div class="mini-title"></div><div class="mini-stats"><b></b><b></b><b></b></div><div class="mini-content"><b></b><b></b><b></b></div></div><span>{i:02d}</span></div><div class="sample-copy"><small>{layout.upper()}</small><h2>{html.escape(names[layout]['title'])}<span>↗</span></h2><p>{html.escape(styles()[style]['title'])} / 可交互单页</p></div></a>''')
    swatches=''.join(f'<div class="swatch"><span style="background:{s["tokens"]["primary"]}"></span><div><strong>{html.escape(s["title"])}</strong><small>{key}</small></div></div>' for key,s in styles().items())
    gallery='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';connect-src 'none';object-src 'none';base-uri 'none';form-action 'none'"><title>UCD Studio · 离线设计样例</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7f8fb;color:#17243b;font:14px/1.65 'Segoe UI','Microsoft YaHei',DengXian,system-ui,sans-serif}a{color:inherit;text-decoration:none}:focus-visible{outline:3px solid #275cce;outline-offset:5px}header{border-bottom:1px solid #e4e9f1;background:white;padding:22px max(24px,calc((100vw - 1120px)/2));display:flex;justify-content:space-between;gap:15px}header strong{letter-spacing:-.6px}header span{color:#64738b;font-size:12px}main{max-width:1168px;margin:auto;padding:60px 24px}.eyebrow{font-size:10px;letter-spacing:3px;color:#275cce;font-weight:700}h1{font-size:44px;letter-spacing:-1.6px;line-height:1.3;margin:16px 0}h1 span{color:#275cce}.lead{font-size:15px;color:#64738b;max-width:620px;margin:0 0 25px}.chips{display:flex;gap:8px;flex-wrap:wrap}.chips span{border:1px solid #e0e6f0;border-radius:6px;padding:5px 10px;background:white;color:#52637e;font-size:11px}.section-label{display:flex;justify-content:space-between;align-items:center;margin:52px 0 20px}.section-label h2{font-size:18px;margin:0}.section-label span{color:#738198;font-size:11px}.samples{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}.sample{border:1px solid #e1e7f0;border-radius:13px;overflow:hidden;background:white}.sample:hover{border-color:#97b3e3}.sample-visual{height:168px;display:flex;padding:18px 24px 0;background:var(--tint);position:relative;overflow:hidden;gap:12px}.sample-visual>span{position:absolute;right:12px;top:8px;font-size:9px;color:var(--accent);opacity:.65}.mini-side{width:30px;background:white;border-radius:4px 4px 0 0;padding:13px 6px;display:flex;flex-direction:column;gap:10px}.mini-side i{height:3px;width:18px;background:var(--accent);opacity:.3}.mini-side i:first-child{opacity:.8}.mini-main{flex:1;min-width:0;padding-top:6px}.mini-title{height:5px;width:50%;background:var(--accent);border-radius:3px;opacity:.65;margin-bottom:15px}.mini-stats{display:flex;gap:7px}.mini-stats b{flex:1;height:33px;border-radius:4px;background:white;position:relative}.mini-stats b::after{content:'';position:absolute;left:9px;top:11px;height:9px;width:14px;background:var(--accent);opacity:.4;border-radius:2px}.mini-content{height:85px;background:white;border-radius:5px;margin-top:10px;padding:13px 10px;display:flex;flex-direction:column;gap:10px}.mini-content b{height:4px;background:var(--tint);border-radius:2px;width:100%}.mini-content b:last-child{width:70%}.sample-copy{padding:19px 22px 21px}.sample-copy small{font-size:9px;letter-spacing:2px;color:#758199}.sample-copy h2{font-size:17px;display:flex;justify-content:space-between;margin:5px 0}.sample-copy h2 span{color:#8396b4;font-weight:400}.sample-copy p{font-size:11px;color:#758199;margin:0}.themes{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.swatch{display:flex;align-items:center;gap:11px;border:1px solid #e1e7f0;border-radius:8px;padding:14px;background:white}.swatch>span{width:28px;height:28px;border-radius:8px}.swatch strong{font-size:11px}.swatch small{display:block;color:#758199;font-size:10px}.tools{display:flex;gap:14px;flex-wrap:wrap}.tools a{border:1px solid #dce4f0;background:white;padding:12px 17px;border-radius:8px;font-size:12px}.note{font-size:11px;color:#758199;margin-top:34px;border-top:1px solid #e1e7f0;padding-top:22px}@media(max-width:850px){.samples{grid-template-columns:repeat(2,1fr)}.themes{grid-template-columns:repeat(2,1fr)}h1{font-size:36px}}@media(max-width:500px){.samples{grid-template-columns:1fr}main{padding-top:38px}h1{font-size:30px}.themes{grid-template-columns:1fr 1fr}.swatch{padding:10px;gap:8px}.swatch strong{font-size:10px}.swatch>span{width:22px;height:22px;flex-shrink:0}header span{display:none}}
</style></head><body><header><strong>◈ UCD STUDIO</strong><span>LOCAL DESIGN SYSTEM / 01</span></header><main><div class="eyebrow">DESIGNED FOR YOUR WORKSPACE</div><h1>从一个想法，<br>到<span>清晰可用的界面。</span></h1><p class="lead">选择贴近任务的布局，用一致的组件和视觉语言快速组织业务信息。所有样例均可离线打开，并支持继续修改。</p><div class="chips"><span>6 类页面布局</span><span>24 个复用组件</span><span>8 套语义主题</span><span>无远程资源</span></div><div class="section-label"><h2>面板与页面</h2><span>点击体验完整交互 ↗</span></div><div class="samples">PANELS</div><div class="section-label"><h2>从视觉语言开始</h2><span>可查询、可覆盖的语义 token</span></div><div class="themes">SWATCHES</div><div class="section-label"><h2>组件与输出模式</h2></div><div class="tools"><a href="components/index.html">完整组件与状态演示 ↗</a><a href="library/index.html">固定 JS 库模式 ↗</a><a href="editable/index.html">可修改 JS 模式 ↗</a><a href="dashboard/design-system.md">查看生成的设计规范 ↗</a></div><p class="note">UCD Studio 1.0.0 · 原生 HTML/CSS/JS · 示例仅使用本地脱敏数据。生成端需 Python，阅读端无需安装任何依赖。</p></main></body></html>'''
    (out/'index.html').write_text(gallery.replace('PANELS',''.join(panels)).replace('SWATCHES',swatches),encoding='utf-8')
    print(f'Generated 9 interactive pages + gallery: {out.absolute()}')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',default=str(ROOT/'demo'));args=parser.parse_args();make(args.out)
