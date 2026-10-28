"""Regenerate the offline demonstration gallery; no network or dependencies."""
import argparse
import html
import struct
import sys
import zlib
from pathlib import Path

sys.dont_write_bytecode = True
from ucd import ROOT, build, catalog, read_json, styles


def banner():
    width,height=720,240
    pixels=[]
    for y in range(height):
        row=bytearray()
        for x in range(width):
            color=(244,246,249)
            if (x-570)**2+(y-120)**2<135**2:color=(214,226,250)
            if 42<x<375 and 54<y<78:color=(31,79,216)
            if 42<x<290 and 94<y<107:color=(166,178,203)
            if 42<x<325 and 122<y<135:color=(208,216,231)
            if 42<x<155 and 169<y<199:color=(31,79,216)
            if 482<=x<=656 and 57<=y<=187:color=(255,255,255) if 483<=x<=655 and 58<=y<=186 else (227,232,240)
            if 506<x<630 and 84<y<94:color=(226,232,240)
            if 506<x<596 and 112<y<122:color=(226,232,240)
            if 506<x<615 and 141<y<158:color=(31,79,216)
            row.extend(color)
        pixels.append(b'\0'+row)
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(pixels)))+chunk(b'IEND',b'')


def make(out):
    out=Path(out)
    combinations=[('admin','ocean'),('dashboard','ocean'),('workbench','ocean'),('form','ocean'),('detail','ocean'),('kanban','slate')]
    for layout,style in combinations:
        spec=read_json(ROOT/f'examples/{layout}.json');spec['style']=style
        build(spec,out/layout)
    # A complete component page also demonstrates packaging local media.
    component_out=out/'components';local=component_out/'local';local.mkdir(parents=True,exist_ok=True)
    (local/'cover.png').write_bytes(banner())
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
    descriptions={
        'admin':'查询与筛选申请记录，核对状态并批量处理',
        'dashboard':'汇总待办、指标与进度，从概览进入办理',
        'workbench':'汇集常用入口、工作队列与办理动态',
        'form':'按业务要求填写字段，提交前完成本地校验',
        'detail':'查看申请上下文、字段明细与处理记录',
        'kanban':'按阶段归集任务卡片，逐卡更新办理状态'}
    tags={
        'admin':'列表 · 筛选',
        'dashboard':'指标 · 待办',
        'workbench':'入口 · 队列',
        'form':'表单 · 校验',
        'detail':'详情 · 记录',
        'kanban':'看板 · 流转'}
    bars={'admin':5,'dashboard':4,'workbench':3,'form':5,'detail':6,'kanban':3}
    arrow='<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14 M13 6l6 6-6 6"/></svg>'
    names=read_json(ROOT/'data/layouts.json')
    for layout,style in combinations:
        visual=('<div class="browser"><div class="browser-bar"><i></i><i></i><i></i><span></span></div>'
                '<div class="browser-body"><div class="mini-side"><b></b><i></i><i></i><i></i><i></i></div>'
                f'<div class="mini-main"><i class="mini-title"></i><div class="preview {layout}">'+'<i></i>'*bars[layout]+'</div></div></div></div>')
        panels.append(f'<a class="sample" href="{layout}/index.html"><div class="sample-visual" aria-hidden="true">{visual}</div><div class="sample-copy"><div class="sample-head"><h2>{html.escape(names[layout]["title"])}</h2>{arrow}</div><p>{html.escape(descriptions[layout])}</p><span class="chip">{html.escape(tags[layout])}</span></div></a>')
    swatches=''.join(f'<span class="swatch"><i style="background:{s["tokens"]["primary"]}"></i>{html.escape(s["title"])}</span>' for s in styles().values())
    gallery=(ROOT/'assets/gallery.html').read_text(encoding='utf-8')
    from string import Template
    (out/'index.html').write_text(Template(gallery).substitute(panels=''.join(panels),swatches=swatches),encoding='utf-8')
    print(f'Generated 9 interactive pages + gallery: {out.absolute()}')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',default=str(ROOT/'demo'));args=parser.parse_args();make(args.out)
