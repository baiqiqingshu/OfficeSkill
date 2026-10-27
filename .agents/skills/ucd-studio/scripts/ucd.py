#!/usr/bin/env python3
"""Offline UCD authoring: search, scaffold, render, patch, inspect and check.
Python 3.10+ standard library only. Never executes project code or uses network.
"""
import argparse
import copy
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

sys.dont_write_bytecode = True
from render import ROOT, TYPES, component_css, render_block, render_page

VERSION = '1.1.0'
MODES = ('single', 'library', 'editable')
IMAGE_EXT = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico'}
ASSET_EXT = IMAGE_EXT | {'.woff', '.woff2', '.ttf', '.otf'}
SKIP_DIRS = {'.git', '.history', 'node_modules', 'vendor', 'dist', 'build', 'coverage',
             '.next', '__pycache__', '.venv', 'venv', '.aws', '.ssh', '.codex', '.agents'}
SOURCE_EXT = {'.html', '.vue', '.jsx', '.tsx', '.js', '.ts', '.css', '.scss', '.svelte'}
SECRET = re.compile(r'(^\.env($|\.)|secret|credential|password|private[-_.]?key|id_rsa|\.pem$|\.key$)', re.I)
ID = re.compile(r'^[a-z][a-z0-9-]{0,47}$')


def fail(message):
    raise ValueError(message)


def local_path(value):
    text = str(value)
    if text.startswith(('\\\\','//')) or re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*://',text):
        fail('仅允许本地磁盘路径，不接受 UNC 网络共享或 URI')
    return Path(value)


def read_json(path):
    path = local_path(path)
    if path.stat().st_size > 1024 * 1024:
        fail(f'JSON 超过 1 MB：{path}')
    return json.loads(path.read_text(encoding='utf-8-sig'))


def json_text(data):
    return json.dumps(data, ensure_ascii=False, indent=2) + '\n'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def catalog():
    return read_json(ROOT/'data/catalog.json')


def styles():
    return read_json(ROOT/'data/styles.json')


def require(condition, message):
    if not condition:
        fail(message)


def validate(spec):
    require(isinstance(spec, dict), 'page.json 必须是对象')
    allowed = {'version', 'title', 'product', 'description', 'action', 'eyebrow', 'layout', 'style',
               'density', 'tokens', 'audience', 'goal', 'primaryTask', 'successCriteria',
               'assumptions', 'sources', 'assets', 'blocks'}
    require(not set(spec) - allowed, f'未知页面字段：{set(spec)-allowed}')
    require(spec.get('version') == 1, 'version 必须是 1')
    require(spec.get('layout') in read_json(ROOT/'data/layouts.json'), '未知 layout，请 search --kind layout')
    require(spec.get('style') in styles(), '未知 style，请 search --kind style')
    require(spec.get('density', 'comfortable') in ('comfortable', 'compact'), 'density 仅支持 comfortable/compact')
    for key in ('title', 'product', 'description', 'action', 'eyebrow', 'audience', 'goal', 'primaryTask'):
        require(isinstance(spec.get(key, ''), str), f'{key} 必须是字符串')
    require(bool(spec.get('title', '').strip()), 'title 不能为空')
    for key in ('successCriteria', 'assumptions', 'sources'):
        require(isinstance(spec.get(key, []), list) and all(isinstance(v, str) for v in spec.get(key, [])), f'{key} 必须是字符串数组')
    tokens = spec.get('tokens', {})
    require(isinstance(tokens, dict), 'tokens 必须是对象')
    for key, value in tokens.items():
        require(key in styles()[spec['style']]['tokens'], f'未知 token：{key}')
        pattern = r'\d{1,2}px' if key == 'radius' else r'#[0-9a-fA-F]{6}'
        require(isinstance(value, str) and re.fullmatch(pattern, value), f'token {key} 必须是六位 HEX 颜色，radius 为 0–99px')
    blocks = spec.get('blocks')
    require(isinstance(blocks, dict) and 0 < len(blocks) <= 30, 'blocks 必须包含 1–30 个区块')
    entries = {c['id']: c for c in catalog() if c['kind'] == 'component'}
    for key, block in blocks.items():
        require(ID.fullmatch(key) is not None and key not in ('main', 'toast', 'create-dialog', 'dialog-title'), f'非法或保留区块 ID：{key}')
        require(isinstance(block, dict), f'{key} 必须是对象')
        kind = block.get('type')
        require(kind in TYPES, f'{key}: 未知 type {kind}')
        require(isinstance(block.get('title'), str) and bool(block['title'].strip()), f'{key}: title 不能为空')
        require(block.get('span', 'half') in ('full', 'half'), f'{key}: span 仅支持 full/half')
        require(isinstance(block.get('description', ''), str), f'{key}: description 必须是字符串')
        rule = entries[kind]
        extra = set(block) - {'type', 'title', 'description', 'span'} - set(rule['properties'])
        require(not extra, f'{key}: 未知属性 {extra}')
        require(all(x in block for x in rule['required']), f'{key}: 缺少 {rule["required"]}')
        if kind in ('stats', 'bar-chart', 'activity', 'detail', 'cards', 'steps', 'accordion', 'progress', 'tabs'):
            require(isinstance(block['items'], list) and 0 < len(block['items']) <= 40, f'{key}: items 需要 1–40 项')
            if kind == 'steps':
                require(all(isinstance(x, str) for x in block['items']), f'{key}: steps.items 必须是字符串')
                require(type(block.get('current', 0)) is int and 0 <= block.get('current', 0) < len(block['items']), f'{key}: current 越界')
            else:
                required = {'stats':('label', 'value'), 'bar-chart':('label', 'value'), 'activity':('title',),
                            'detail':('label','value'), 'cards':('title',), 'accordion':('title','content'),
                            'progress':('label','value'), 'tabs':('label','content')}[kind]
                require(all(isinstance(x, dict) and all(k in x for k in required) for x in block['items']), f'{key}: 每项需包含 {required}')
            if kind in ('bar-chart', 'progress'):
                require(all(type(x['value']) in (int, float) and 0 <= x['value'] <= 100 for x in block['items']), f'{key}: value 必须在 0–100')
        if kind == 'table':
            columns, rows = block['columns'], block['rows']
            require(isinstance(columns, list) and 1 <= len(columns) <= 12 and all(isinstance(x, str) for x in columns), f'{key}: columns 需 1–12 个字符串')
            require(isinstance(rows, list) and len(rows) <= 500 and all(isinstance(r, list) and len(r) == len(columns) for r in rows), f'{key}: rows 长度必须与 columns 相同，最多 500 行')
            require(type(block.get('statusColumn', len(columns)-1)) is int and 0 <= block.get('statusColumn', len(columns)-1) < len(columns), f'{key}: statusColumn 越界')
            require(type(block.get('pageSize', 5)) is int and 1 <= block.get('pageSize', 5) <= 50, f'{key}: pageSize 需 1–50')
        if kind == 'line-chart':
            require(isinstance(block['values'], list) and 2 <= len(block['values']) <= 30 and all(type(v) in (int,float) and 0 <= v <= 1e12 for v in block['values']), f'{key}: values 需 2–30 个非负数字')
            require(isinstance(block['labels'], list) and len(block['labels']) == len(block['values']) and all(isinstance(x,str) for x in block['labels']), f'{key}: labels 与 values 不一致')
        if kind == 'form':
            require(isinstance(block['fields'], list) and 1 <= len(block['fields']) <= 30, f'{key}: fields 需 1–30 项')
            for field in block['fields']:
                require(isinstance(field, dict) and isinstance(field.get('label'), str), f'{key}: 字段需要 label')
                require(field.get('type', 'text') in ('text', 'email', 'date', 'number', 'select', 'textarea'), f'{key}: 不支持的字段类型')
                require(not set(field)-{'label','type','value','placeholder','required','help','options'}, f'{key}: 未知字段属性')
                if field.get('type') == 'select':
                    require(isinstance(field.get('options'), list) and len(field['options']) > 0 and all(isinstance(x,str) for x in field['options']), f'{key}: select 需要 options')
        if kind == 'kanban':
            require(isinstance(block['columns'], list) and 1 <= len(block['columns']) <= 6, f'{key}: 看板需 1–6 列')
            for col in block['columns']:
                require(isinstance(col,dict) and isinstance(col.get('title'),str) and isinstance(col.get('items'),list) and len(col['items']) <= 50, f'{key}: 看板列需 title/items')
                require(all(isinstance(t,dict) and isinstance(t.get('title'),str) for t in col['items']), f'{key}: 看板任务需要 title')
        if kind in ('alert', 'empty'):
            require(isinstance(block['text'], str), f'{key}: text 必须为字符串')
        if kind == 'image':
            require(isinstance(block['alt'], str) and bool(block['alt'].strip()), f'{key}: image.alt 不能为空')
            require(isinstance(block['src'], str) and re.fullmatch(r'assets/[A-Za-z0-9_.-]+', block['src']) and Path(block['src']).suffix.lower() in IMAGE_EXT, f'{key}: src 只能引用 assets 下本地图片')
    require(isinstance(spec.get('assets', []), list), 'assets 必须为数组')
    seen = set()
    for asset in spec.get('assets', []):
        require(isinstance(asset,dict) and set(asset) == {'source','name'} and isinstance(asset['source'],str) and isinstance(asset['name'],str), 'asset 必须包含 source/name')
        name = asset['name']
        require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,100}',name) is not None and '..' not in name and Path(name).suffix.lower() in ASSET_EXT and name not in seen, f'非法或重复素材名称：{name}')
        seen.add(name)
    for block in blocks.values():
        if block['type'] == 'image':
            require(block['src'][7:] in seen, f'未声明素材：{block["src"]}')


def terms(text):
    text = text.lower()
    result = set(re.findall(r'[a-z0-9]+|[\u4e00-\u9fff]{2,}', text))
    for word in list(result):
        if re.search(r'[\u4e00-\u9fff]', word):
            result.update(word[i:i+2] for i in range(len(word)-1))
    return result


def show_entry(entry, code=False, example=False):
    result = copy.deepcopy(entry)
    if not code and not example:
        result.pop('example', None)
        return result
    if code and entry['kind'] == 'component':
        if entry.get('primitive'):
            result['html'] = (ROOT/entry['file']).read_text(encoding='utf-8')
        elif entry['id'] == 'image':
            result['html'] = render_block('example', entry['example'])
        else:
            result['html'] = render_block('example', entry['example'])
        result['css'] = component_css(entry['id'])
        result['dependencies'] = ['assets/base.css: base + responsive', 'assets/runtime.js（行为组件）', 'data/styles.json: tokens']
    elif entry['kind'] == 'style':
        result.update(styles()[entry['id']])
    elif (code or example) and entry['kind'] == 'layout':
        result['example'] = read_json(ROOT/f'examples/{entry["id"]}.json')
    return result


def search(query, kind, limit, code, max_chars):
    words = terms(query)
    ranked = []
    for entry in catalog():
        if kind != 'all' and entry['kind'] != kind:
            continue
        haystack = ' '.join(str(entry.get(k,'')) for k in ('id','title','tags','description'))
        score = 20 * (query.lower() == entry['id']) + len(words & terms(haystack))
        if score:
            ranked.append((score, entry))
    ranked.sort(key=lambda x:(-x[0],x[1]['id']))
    result = [show_entry(entry, True) if code else {k:v for k,v in entry.items() if k != 'example'} for _, entry in ranked[:limit]]
    return bounded(result, max_chars)


def bounded(value, max_chars):
    # Bound whole JSON output, not a syntactically truncated JSON string.
    if isinstance(value, list):
        while len(value) > 1 and len(json_text(value)) > max_chars:
            value.pop()
    if len(json_text(value)) <= max_chars:
        return value
    item = copy.deepcopy(value[0] if isinstance(value, list) and value else value)
    for key in ('html','css','example'):
        item.pop(key, None)
    item['note'] = '内容超过预算，已仅返回元数据；按需增大 --max-chars 再取单项内容。'
    return item


def md(value):
    return str(value).replace('|','\\|').replace('\n',' ')


def page_summary(out, block=None, max_chars=2500):
    spec = read_json(local_path(out)/'page.json')
    if block is not None:
        require(block in spec['blocks'], f'未知区块：{block}')
        result = {'id':block, **spec['blocks'][block]}
        if len(json_text(result)) > max_chars:
            result = {key:value for key,value in result.items() if key not in ('rows','items','columns','fields')}
            result['note'] = '区块数据超过预算，已省略集合字段；按需增大 --max-chars 或本地读取 page.json。'
        return result
    return {'title':spec['title'], 'layout':spec['layout'], 'style':spec['style'],
            'density':spec.get('density','comfortable'),
            'blocks':[{'id':key, 'title':b['title'], 'type':b['type']}
                      for key,b in spec['blocks'].items()]}


def design_doc(spec, mode):
    style = styles()[spec['style']]
    overrides = spec.get('tokens', {})
    tokens = {**style['tokens'], **overrides}
    density = spec.get('density', 'comfortable')
    compact = density == 'compact'
    kinds = {block['type'] for block in spec['blocks'].values()}
    roles = {
        'primary':'主要操作、当前选择及键盘焦点', 'primary-ink':'主操作上的文字',
        'soft':'选中及主色弱背景', 'bg':'工作区与次级表面', 'surface':'内容与控件表面',
        'ink':'正文与标题', 'muted':'辅助文字与占位文字', 'border':'分隔线与结构边界',
        'radius':'面板圆角', 'success':'成功状态文字', 'success-soft':'成功状态背景',
        'warning':'警告状态文字', 'warning-soft':'警告状态背景',
        'danger':'错误状态文字', 'danger-soft':'错误状态背景',
    }
    rows = '\n'.join(f'| `{k}` | `{v}` | {roles.get(k,"主题扩展")} | {"页面覆盖" if k in overrides else "主题默认"} |'
                     for k,v in tokens.items())

    def luminance(color):
        values = [int(color[i:i+2], 16)/255 for i in (1, 3, 5)]
        linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values]
        return sum(v*w for v,w in zip(linear, (.2126, .7152, .0722)))

    dark = luminance(tokens['bg']) < .179
    color_pairs = [('正文 / 内容面','ink','surface'), ('辅助文字 / 内容面','muted','surface'),
                   ('辅助文字 / 工作区','muted','bg'), ('主操作文字 / 主色','primary-ink','primary'),
                   ('选中文字 / 选中背景','primary','soft'), ('成功文字 / 成功背景','success','success-soft'),
                   ('警告文字 / 警告背景','warning','warning-soft'), ('错误文字 / 错误背景','danger','danger-soft')]
    contrast_rows = []
    for label, foreground, background in color_pairs:
        light, shade = sorted((luminance(tokens[foreground]), luminance(tokens[background])), reverse=True)
        ratio = (light+.05)/(shade+.05)
        contrast_rows.append(f'| {label} | {ratio:.2f}:1 | {"达到 4.5:1" if ratio >= 4.5 else "需调整颜色"} |')

    def columns(block):
        if block.get('span') == 'full':
            return 12
        if spec['layout'] == 'workbench':
            return {'table':6, 'cards':3, 'activity':3}.get(block['type'], 4)
        if spec['layout'] == 'form':
            return {'form':8, 'detail':4}.get(block['type'], 6)
        return 6

    sections = '\n'.join(f'| `{key}` | {md(b["title"])} | `{b["type"]}` | {columns(b)} / 12 |'
                         for key,b in spec['blocks'].items())
    bullets = lambda values: '\n'.join('- '+md(x) for x in values) or '- 未提供；待业务评审确认。'
    interactions = ['- 页面主操作打开原生 dialog；Esc 或“取消”关闭并返回触发按钮，校验通过后显示本地草稿反馈，不写入业务记录。',
                    '- 本页导航使用区块锚点及当前项标记，不代表额外业务路由。']
    if 'table' in kinds:
        interactions.append('- 表格支持任意字段搜索、状态筛选、数字感知排序与分页；禁用不可用的翻页按钮。无匹配时可清除筛选；状态预览包含加载骨架、空与错误，就近恢复示例记录或重试，均无网络请求。')
    if 'form' in kinds:
        interactions.append('- 表单使用显式字段标签与原生必填、邮箱、日期、数字等校验；重置清除本地反馈，校验通过后明确说明未提交服务器。')
    if 'tabs' in kinds:
        interactions.append('- 页签支持点击、左右方向键、Home/End；当前页签与内容面板通过 ARIA 关联。')
    if 'kanban' in kinds:
        interactions.append('- 看板通过任务中的原生 select 移动至目标阶段，同时更新各列数量并显示本地反馈；不提供拖拽或真实协作同步。')
    if 'accordion' in kinds:
        interactions.append('- 折叠内容使用原生 details/summary，可通过鼠标和键盘展开。')
    if kinds & {'cards', 'empty'}:
        interactions.append('- 入口与独立空状态中的示例按钮显示本地操作提示；不跳转未实现页面，也不代表真实创建完成。')
    if 'steps' in kinds:
        interactions.append('- 步骤条表达当前阶段，只作状态指示，不自动切换步骤或跨步骤提交。')
    interactions.append('- 所有数据仅保存在当前页面内存，刷新恢复示例；没有登录、后端、上传、真实持久化或权限控制。')
    layout_notes = {
        'workbench':'工作台桌面默认区块 4 列，工具入口与动态各 3 列、队列表格 6 列；full 仍跨 12 列。1180px 及以下，工具、表格和动态改为 6 列，末尾动态跨 12 列。',
        'form':'表单布局桌面主表单 8 列、属性说明 4 列；1180px 及以下改为 7/5 列。其他区块仍遵循 6 列或 full；不强制把所有内容分为两栏。',
    }
    packaging = {
        'single':'single：CSS 与运行时均内嵌 index.html；无素材时单 HTML 可独立预览。',
        'library':'library：CSS 内嵌，运行时位于 assets/ucd-runtime.js；交付时复制整个目录。',
        'editable':'editable：CSS 内嵌，运行时位于 page.js，并保留对该文件的手工修改；定制行为需结合该文件复查。',
    }[mode]
    return f'''# {md(spec['title'])} · 设计规范

规范版本：2026.10 · 生成器：{VERSION}。本文件由 page.json、主题及内置模板生成，描述本次配置；交互与视觉验证结果需另行记录。

## 任务与依据

- 界面模式：Operate，优先完成业务任务、快速扫描与一致操作。
- 目标用户：{md(spec.get('audience','内部业务人员'))}
- 用户目标：{md(spec.get('goal','快速理解当前工作并完成主要任务'))}
- 主要任务：{md(spec.get('primaryTask',spec.get('action','处理事项')))}
- 布局：{spec['layout']}；主题：{md(style['title'])}；密度：{density}；输出：{mode}

验收标准：

{bullets(spec.get('successCriteria',[]))}

设计假设（非研究结论）：

{bullets(spec.get('assumptions',[]))}

源码依据：

{bullets(spec.get('sources',[]))}

## 色彩与语义 token

| Token | 当前值 | 用途 | 来源 |
|---|---|---|---|
{rows}

当前工作区按有效 bg token 判定为{"深色" if dark else "浅色"}；主题与页面覆盖已合并，不把深色主题称作浅色。主色用于操作、焦点和当前选择，成功/警告/错误同时显示文字。面板以弥散阴影与留白分组，平面元素保留 1px 边界；不以渐变、光晕或重复卡片装饰业务内容，品牌渐变仅用于标识方块。

静态 token 对比度（按 WCAG 相对亮度计算，未包含透明度、悬停、禁用或手工样式）：

| 文字与背景 | 比值 | 普通文字目标 |
|---|---|---|
{chr(10).join(contrast_rows)}

普通正文与占位文字目标至少 4.5:1，大号文字至少 3:1；交互边界与焦点标记也应检查 3:1。颜色覆盖不会自动修正对比度，以上仅检查列出的实色组合，不代表完整可访问性认证。

## 排版、尺寸与密度

系统字体 Segoe UI / Microsoft YaHei / PingFang SC / system-ui，不请求远程字体；数字使用等宽数字特性。标题与字段左对齐，主要说明建议控制在约 65–75ch；表格按数据结构容纳更多列，不套用正文行长。

| 项目 | 当前规则 |
|---|---|
| 页面 / 窄屏页面标题 | 24px / 22px |
| 区块 / 次级标题 | 15px / 14px |
| 正文 / 数据与控件 / 辅助文字 | 14px / 13px / 至少 12px |
| 基础间距 | 4px 基准，优先 8 / 12 / 16 / 20 / 24 / 28px |
| 当前桌面表格单元格内边距 | {"10px 16px" if compact else "12px 20px"} |
| 当前桌面面板头 / 内容内边距 | {"12px 16px / 16px" if compact else "16px 20px / 20px"} |
| 桌面常规 / 小按钮最小高度 | 36px / 32px |
| 760px 及以下的主要交互目标 | 最小高度 44px |
| 侧栏 / 收紧侧栏 | 216px / 192px |
| 顶栏 / 窄屏顶栏最小高度 | 56px / 48px |

密度只改变留白，不降低数据字号或改变信息含义。圆角读取上表 radius，主要用于内容面板；按钮和字段沿用同类控件的统一外形。页面标题直接说明任务，不显示装饰眉题；eyebrow 仅保留旧配置兼容。

760px 及以下两种密度的面板统一使用 12px 16px 头部与 16px 内容内边距；表格内边距保持所选密度，长表在局部容器滚动。

## 信息结构

| 稳定 ID | 标题 | 组件 | 桌面网格 |
|---|---|---|---|
{sections}

12 列网格，常规区块 6 列，full 跨 12 列。{layout_notes.get(spec['layout'],'1180px 及以下收紧侧栏和页面留白，普通区块仍遵循 6 列或 full。')}

760px 及以下全部区块跨 12 列、表单字段单列，侧栏转换为横向区块导航，看板按阶段纵向排列；表格只在自身容器滚动，保持可读字号。标题、长内容与操作区应在真实文案及浏览器缩放下复查，不能以隐藏页面溢出来掩盖内容丢失。

## 交互与状态

本页已配置的行为：

{chr(10).join(interactions)}

扩展组件时沿用同一状态语言：hover/active 给出操作反馈，focus-visible 保持可见，disabled 表明不可用；异步内容提供 loading、empty、error 与恢复路径，成功反馈沿用操作名称。这是扩展约定，不代表每个静态区块都具备异步行为。权限不足等真实业务状态需依据项目资料补充，不从原型推定。

## 可访问性与资源

内置模板提供可见键盘焦点、跳至主要内容、语义标题、标签关联、非纯颜色状态、ARIA 反馈与减少动态效果偏好。{"趋势图通过 SVG title/desc 提供图名与完整数值。" if 'line-chart' in kinds else ''}{"本地图片使用配置中的替代文本。" if 'image' in kinds else ''}无入场动画；交互过渡应简短且服务于状态变化。仍需检查实际内容的焦点顺序、缩放、对比度及辅助技术体验。

{packaging} 本地素材由 assets/ 清单声明，不用 CDN、远程字体、图片或网络接口。CSP 限制连接与表单外发；静态检查不替代浏览器验证及宿主网络隔离。

## 修改与复现

修改 page.json，运行 build；小范围修改用 patch，同步生成本规范。手工修改 HTML/规范会触发保护，保留并人工合并。manifest.json 记录版本与 SHA-256，.history/ 保存上次生成快照；editable 模式保留 page.js 修改。
'''


def safe_relative(name):
    require(isinstance(name,str) and not re.search(r'[:\\]',name), f'非法交付路径：{name}')
    path = Path(name)
    allowed = name in ('index.html','design-system.md','page.js') or re.fullmatch(r'assets/[A-Za-z0-9_.-]+',name) is not None
    require(not path.is_absolute() and '..' not in path.parts and '..' not in name and allowed, f'非法交付路径：{name}')
    return path


def linked(path):
    return path.is_symlink() or (hasattr(path,'is_junction') and path.is_junction())


def asset_bytes(spec, base):
    result = {}
    for item in spec.get('assets',[]):
        source = local_path(item['source'])
        source = source if source.is_absolute() else base/source
        require(not any(SECRET.search(p) for p in source.parts), f'拒绝凭证路径：{source.name}')
        require(not any(linked(p) for p in [source,*source.parents]), f'拒绝链接素材：{source}')
        source = source.resolve()
        require(source.is_file() and source.suffix.lower() in ASSET_EXT and source.suffix.lower() == Path(item['name']).suffix.lower(), f'素材不存在或扩展名不匹配：{source}')
        require(source.stat().st_size <= 20*1024*1024, '单个素材不得超过 20 MB')
        result['assets/'+item['name']] = source.read_bytes()
    require(sum(map(len,result.values())) <= 50*1024*1024, '素材合计超过 50 MB')
    return result


class OfflineHTML(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=set();self.refs=[];self.files=set();self.errors=[];self.csp='';self.active=None;self.code=[]

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script','style'):self.active=tag
        if 'id' in attrs:
            if attrs['id'] in self.ids:self.errors.append('重复 ID：'+attrs['id'])
            self.ids.add(attrs['id'])
        if tag in ('iframe','object','embed','base'):
            self.errors.append('禁止嵌入或 base：'+tag)
        if tag == 'meta' and attrs.get('http-equiv','').lower() == 'refresh':
            self.errors.append('禁止 meta refresh')
        if tag == 'meta' and attrs.get('http-equiv','').lower() == 'content-security-policy':
            self.csp=attrs.get('content','')
        for name,value in attrs.items():
            if name == 'style' and value:self.code.append(value)
            if name.startswith('on'):self.errors.append('禁止内联事件：'+name)
            if name in ('srcdoc','srcset','action','formaction','ping'):self.errors.append('禁止潜在外联属性：'+name)
            if name in ('src','href','poster','data') and value:
                if value.startswith('#'):self.refs.append(value[1:])
                elif re.fullmatch(r'(assets/[A-Za-z0-9_.-]+|page\.js)',value) and '..' not in value:self.files.add(value)
                else:self.errors.append('非本地资源/跳转：'+value)
            if name in ('aria-labelledby','aria-describedby','aria-controls') and value:
                self.refs.extend(value.split())

    def handle_data(self,data):
        if self.active:self.code.append(data)

    def handle_endtag(self,tag):
        if tag == self.active:self.active=None


def audit(files):
    parser = OfflineHTML();parser.feed(files['index.html'].decode('utf-8'))
    errors = parser.errors
    for ref in parser.refs:
        if ref not in parser.ids:errors.append('缺失锚点/ARIA 目标：'+ref)
    for name in parser.files:
        if name not in files:errors.append('缺失资源：'+name)
    for directive in ("default-src 'none'", "connect-src 'none'", "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'"):
        if directive not in parser.csp:errors.append('CSP 缺失：'+directive)
    forbidden = re.compile(r'https?://|wss?://|\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|eval|importScripts)\s*\(|\bimport\s*\(|\bnew\s+Function\b|serviceWorker|location\s*[.=\[]|window\s*\.\s*open\s*\(|@import|url\s*\(',re.I)
    if any(forbidden.search(code) for code in parser.code):errors.append('HTML 中存在外联或动态代码特征')
    for name,data in files.items():
        if Path(name).suffix in ('.js','.css') and forbidden.search(data.decode('utf-8')):
            errors.append('外联或动态代码特征：'+name)
    return errors


def old_manifest(out):
    path = out/'manifest.json'
    if not path.exists():
        require(not (out/'index.html').exists(), '已有 HTML 缺少 manifest，请局部编辑或在新目录构建')
        return None
    result = read_json(path)
    require(result.get('tool') == 'ucd-studio' and result.get('mode') in MODES and isinstance(result.get('files'),dict), '无效 manifest')
    return result


def guard(out, old):
    if not old:return
    require(old.get('version') == VERSION, '工具版本变化，需在新目录迁移')
    for name, sha in old['files'].items():
        path = out/safe_relative(name)
        if name == 'page.js' and old['mode'] == 'editable':continue
        require(path.is_file() and not linked(path) and digest(path.read_bytes()) == sha, f'检测到手工修改或文件缺失：{name}；请保留并人工合并，或在新目录构建')
    if old['mode'] == 'library':
        require(digest((out/'assets/ucd-runtime.js').read_bytes()) == digest((ROOT/'assets/runtime.js').read_bytes()), '固定运行库被修改，禁止覆盖')


def history_root(out):
    # Keep packaged examples small; user-created pages retain local .history/.
    if out.parent == (ROOT/'demo').resolve():
        repository = ROOT.parents[2]
        cache = repository/'temp/ucd-studio-history' if (repository/'.git').exists() else Path(tempfile.gettempdir())/'ucd-studio-history'/digest(str(ROOT).encode('utf-8'))[:12]
        return cache/out.name
    return out/'.history'


def build(spec, out, mode=None, source_base=None):
    validate(spec);out = local_path(out).absolute()
    require(not any(linked(p) for p in [out,*out.parents]), '输出目录不能经过符号链接或 junction')
    old = old_manifest(out);guard(out,old)
    mode = mode or (old['mode'] if old else 'single')
    require(mode in MODES, '未知输出模式')
    require(not old or old['mode'] == mode, '已有目录不支持切换模式，请新建目录迁移')
    files = asset_bytes(spec,source_base or out)
    files['index.html'] = render_page(spec,styles()[spec['style']],mode).encode('utf-8')
    files['design-system.md'] = design_doc(spec,mode).encode('utf-8')
    if mode != 'single':
        name = 'page.js' if mode == 'editable' else 'assets/ucd-runtime.js'
        files[name] = (out/name).read_bytes() if mode == 'editable' and (out/name).exists() else (ROOT/'assets/runtime.js').read_bytes()
    errors = audit(files)
    require(not errors, '离线检查失败：'+'；'.join(errors))
    # Refuse overwriting any untracked destination; do all validation before commit.
    for name in files:
        path = out/safe_relative(name)
        require(not any(linked(p) for p in [path,*path.parents]), '拒绝交付路径链接')
        require(not path.exists() or old and name in old['files'], f'目标已有非托管文件：{name}')
    manifest = {'tool':'ucd-studio','version':VERSION,'mode':mode,'style':spec['style'],
                'components':list(dict.fromkeys(b['type'] for b in spec['blocks'].values())),
                'sourceSpec':spec,
                'specSha256':digest(json_text(spec).encode('utf-8')),
                'files':{name:digest(data) for name,data in files.items()}}
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='ucd-stage-',dir=out.parent) as staging:
        stage = Path(staging)
        all_files = {**files,'page.json':json_text(spec).encode('utf-8'),'manifest.json':json_text(manifest).encode('utf-8')}
        for name,data in all_files.items():
            (stage/name).parent.mkdir(parents=True,exist_ok=True);(stage/name).write_bytes(data)
        if old:
            base = history_root(out)
            require(not any(linked(p) for p in [base,*base.parents]), '历史目录不能经过链接')
            history = base/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            for name in [*old['files'],'page.json','manifest.json']:
                source = out/name
                if source.is_file():
                    (history/name).parent.mkdir(parents=True,exist_ok=True)
                    if name == 'page.json' and 'sourceSpec' in old:
                        (history/name).write_text(json_text(old['sourceSpec']),encoding='utf-8')
                    else:shutil.copy2(source,history/name)
        out.mkdir(parents=True,exist_ok=True);(out/'assets').mkdir(exist_ok=True)
        for name in all_files:
            destination=out/name
            # Preserve unchanged assets and editable JS without replacing open files.
            if destination.is_file() and destination.read_bytes()==all_files[name]:
                continue
            destination.parent.mkdir(parents=True,exist_ok=True);os.replace(stage/name,destination)
        if old:
            for name in set(old['files'])-set(files):
                (out/safe_relative(name)).unlink()
    return {'ok':True,'directory':str(out),'mode':mode,'files':list(all_files)}


def merge(original, patch):
    if not isinstance(patch,dict):return copy.deepcopy(patch)
    result = copy.deepcopy(original) if isinstance(original,dict) else {}
    for key,value in patch.items():
        if value is None:result.pop(key,None)
        else:result[key]=merge(result.get(key),value)
    return result


def check(out):
    out = local_path(out).absolute();old = old_manifest(out)
    require(old is not None,'缺少 manifest');guard(out,old)
    spec = read_json(out/'page.json');validate(spec)
    require(digest(json_text(spec).encode('utf-8')) == old.get('specSha256'), 'page.json 已变化，请先 build')
    files = {name:(out/safe_relative(name)).read_bytes() for name in old['files']}
    errors = audit(files);require(not errors,'检查失败：'+'；'.join(errors))
    return {'ok':True,'mode':old['mode'],'files':len(files),'externalResources':0,'note':'静态检查通过；任意手工 JS 和实际交互仍需浏览器验证。'}


def inspect_source(root, out, max_files=100, max_bytes=160000):
    root=local_path(root).absolute()
    require(not any(linked(p) for p in [root,*root.parents]) and root.is_dir(),'源码目录无效或经过链接')
    records=[];used=0;truncated=False
    for directory,dirs,names in os.walk(root,followlinks=False):
        dirs[:]=sorted(d for d in dirs if d.lower() not in SKIP_DIRS and not d.startswith('.') and not SECRET.search(d) and not linked(Path(directory)/d))
        for name in sorted(names):
            path=Path(directory)/name
            if path.suffix.lower() not in SOURCE_EXT or SECRET.search(name) or linked(path):continue
            if len(records)>=max_files or used>=max_bytes:truncated=True;break
            size=min(12000,max_bytes-used)
            with path.open('rb') as stream:raw=stream.read(size)
            used+=len(raw)
            text=raw.decode('utf-8',errors='replace')
            signals=[]
            for n,line in enumerate(text.splitlines(),1):
                if re.search(r'<(?:template|h[1-3]|label|button|title)|(?:title|label|path|route|--[\w-]+)\s*[:=]',line,re.I):
                    signals.append({'line':n,'text':line.strip()[:180]})
                if len(signals)>=6:break
            records.append({'path':path.relative_to(root).as_posix(),'bytesRead':len(raw),'partial':path.stat().st_size>len(raw),'signals':signals})
        if truncated:break
    result={'files':records,'bytesRead':used,'truncated':truncated,'note':'仅线索，未执行源码；请按路径针对性阅读，业务假设需人工确认。'}
    out=local_path(out);require(not out.exists(),'扫描报告已存在，请使用新路径');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json_text(result),encoding='utf-8')
    return {'ok':True,'report':str(out.absolute()),'fileCount':len(records),'bytesRead':used,'truncated':truncated}


def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    p=sub.add_parser('search');p.add_argument('query');p.add_argument('--kind',choices=('all','style','component','layout'),default='all');p.add_argument('--limit',type=int,choices=range(1,6),default=2);p.add_argument('--code',action='store_true');p.add_argument('--max-chars',type=int,default=2500)
    p=sub.add_parser('show');p.add_argument('id');p.add_argument('--kind',choices=('style','component','layout'));p.add_argument('--code',action='store_true');p.add_argument('--example',action='store_true');p.add_argument('--max-chars',type=int,default=4500)
    p=sub.add_parser('init');p.add_argument('--layout',default='admin');p.add_argument('--style',default='ocean');p.add_argument('--mode',choices=MODES,default='single');p.add_argument('--out',required=True);p.add_argument('--title');p.add_argument('--config')
    p=sub.add_parser('summary');p.add_argument('--dir',required=True);p.add_argument('--block');p.add_argument('--max-chars',type=int,default=2500)
    p=sub.add_parser('build');p.add_argument('--dir',required=True);p.add_argument('--mode',choices=MODES)
    p=sub.add_parser('patch');p.add_argument('--dir',required=True);p.add_argument('--patch',required=True)
    p=sub.add_parser('check');p.add_argument('--dir',required=True)
    p=sub.add_parser('inspect');p.add_argument('--root',required=True);p.add_argument('--out',required=True);p.add_argument('--max-files',type=int,default=100);p.add_argument('--max-bytes',type=int,default=160000)
    args=parser.parse_args()
    if args.command in ('search','show'):
        require(1000<=args.max_chars<=50000,'max-chars 需 1000–50000')
        if args.command=='search':result=search(args.query,args.kind,args.limit,args.code,args.max_chars)
        else:
            matches=[e for e in catalog() if e['id']==args.id and (not args.kind or e['kind']==args.kind)]
            require(len(matches)>0,'未知 ID');require(len(matches)==1,'ID 存在多个种类，请加 --kind component 或 --kind layout')
            result=bounded(show_entry(matches[0],args.code,args.example),args.max_chars)
    elif args.command=='init':
        out=local_path(args.out);require(not out.exists() or not any(out.iterdir()),'init 只允许新目录或空目录')
        require(args.layout in read_json(ROOT/'data/layouts.json'),'未知 layout')
        spec=read_json(ROOT/f'examples/{args.layout}.json');spec['style']=args.style
        if args.config:
            patch=read_json(args.config);require(isinstance(patch,dict),'配置必须是对象');spec=merge(spec,patch)
        if args.title is not None:spec['title']=args.title
        result=build(spec,out,args.mode,source_base=local_path(args.config).absolute().parent if args.config else None)
    elif args.command=='summary':
        require(1000<=args.max_chars<=50000,'max-chars 需 1000–50000')
        result=page_summary(args.dir,args.block,args.max_chars)
    elif args.command=='build':result=build(read_json(Path(args.dir)/'page.json'),args.dir,args.mode)
    elif args.command=='patch':
        patch=read_json(args.patch);require(isinstance(patch,dict),'补丁必须是对象');result=build(merge(read_json(Path(args.dir)/'page.json'),patch),args.dir)
    elif args.command=='check':result=check(args.dir)
    else:
        require(1<=args.max_files<=500 and 1000<=args.max_bytes<=1000000,'扫描预算：1–500 文件、1000–1000000 bytes')
        result=inspect_source(args.root,args.out,args.max_files,args.max_bytes)
    print(json_text(result),end='')


if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    try:main()
    except (ValueError,OSError,KeyError,TypeError,json.JSONDecodeError) as exc:
        print(json_text({'ok':False,'error':str(exc)}),file=sys.stderr,end='');sys.exit(1)
