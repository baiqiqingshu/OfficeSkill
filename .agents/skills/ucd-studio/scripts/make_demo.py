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
    combinations=[('admin','ocean'),('dashboard','ocean'),('workbench','ocean'),('form','ocean'),('detail','ocean'),('kanban','slate')]
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
    descriptions={
        'admin':'查询记录、筛选状态与核对申请',
        'dashboard':'从待办开始，跟进申请进度',
        'workbench':'工具入口、工作队列与办理动态',
        'form':'填写业务字段，核对提交要求',
        'detail':'阅读申请上下文与处理记录',
        'kanban':'按阶段推进任务，更新办理状态'}
    names=read_json(ROOT/'data/layouts.json')
    for layout,style in combinations:
        panels.append(f'<a class="sample" href="{layout}/index.html"><div class="sample-visual" aria-hidden="true"><div class="mini-side"><i></i><i></i><i></i></div><div class="mini-main"><div class="mini-title"></div><div class="preview {layout}"><i></i><i></i><i></i><i></i></div></div></div><div class="sample-copy"><small>{layout}</small><h2>{html.escape(names[layout]["title"])}<span aria-hidden="true">&rarr;</span></h2><p>{html.escape(descriptions[layout])}</p></div></a>')
    swatches=''.join(f'<div class="swatch"><span style="background:{s["tokens"]["primary"]}"></span>{html.escape(s["title"])}</div>' for s in styles().values())
    gallery=(ROOT/'assets/gallery.html').read_text(encoding='utf-8')
    from string import Template
    (out/'index.html').write_text(Template(gallery).substitute(panels=''.join(panels),swatches=swatches),encoding='utf-8')
    print(f'Generated 9 interactive pages + gallery: {out.absolute()}')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',default=str(ROOT/'demo'));args=parser.parse_args();make(args.out)
