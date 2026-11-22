#!/usr/bin/env python3
"""Portable UCD project builder. Python 3.10+, standard library, no network."""
import argparse
import base64
import hashlib
import html as html_lib
import io
import json
import mimetypes
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile
import zipfile

sys.dont_write_bytecode = True
VERSION = '1.1.0'
MAX_SOURCE = 50 * 1024 * 1024
SOURCE = re.compile(r'<script id="ucd-source" type="application/octet-stream" data-format="1" data-source-sha="([a-f0-9]{64})" data-page-sha="([a-f0-9]{64})">([A-Za-z0-9+/=\r\n]+)</script>')
IDENTIFIER = re.compile(r'^[a-z][a-z0-9-]{0,63}$')
FIELD_KEY = re.compile(r'^[A-Za-z][A-Za-z0-9_]*$')
ASSET_TYPES = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.otf'}
SUPPORTED_FIELD_TYPES = {'text', 'email', 'date', 'number', 'select', 'textarea', 'checkbox', 'switch', 'radio', 'tags', 'search', 'tel', 'url'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def relative(name):
    require(isinstance(name, str) and bool(name) and not re.search(r'[:\\\x00-\x1f]', name), f'非法工程路径：{name}')
    path = PurePosixPath(name)
    require(not path.is_absolute() and '..' not in path.parts and path.as_posix() == name, f'非法工程路径：{name}')
    require(not any(part.startswith('.') for part in path.parts), f'不打包隐藏文件：{name}')
    return path


def local_root(value):
    require(not str(value).startswith(('\\\\', '//')) and '://' not in str(value), '仅支持本地磁盘目录')
    path = Path(value).absolute()
    for part in [path, *path.parents]:
        require(not part.is_symlink() and not (hasattr(part, 'is_junction') and part.is_junction()), f'工程路径不能经过链接：{part}')
    return path


def source_path(root, name):
    path = root.joinpath(*relative(name).parts)
    for part in [path, *path.parents]:
        if part == root:
            break
        require(not part.is_symlink() and not (hasattr(part, 'is_junction') and part.is_junction()), f'源码不能经过链接：{name}')
    return path


def read_json(root, name):
    path = source_path(root, name)
    require(path.is_file() and path.stat().st_size <= 2 * 1024 * 1024, f'JSON 缺失或超过 2 MB：{name}')
    try:
        return json.loads(path.read_text(encoding='utf-8-sig'))
    except json.JSONDecodeError as exc:
        raise ValueError(f'{name} JSON 语法错误（第 {exc.lineno} 行第 {exc.colno} 列）：{exc.msg}') from exc


def nodes_in(value):
    if isinstance(value, dict):
        if 'component' in value:
            yield value
        for key, child in value.items():
            # props may contain arbitrary business data, not component declarations.
            if key != 'props':
                yield from nodes_in(child)
    elif isinstance(value, list):
        for child in value:
            yield from nodes_in(child)


def load_project(root):
    app = read_json(root, 'app.json')
    require(isinstance(app, dict) and app.get('version') == 1, '[app.json] version 必须为 1')
    require(isinstance(app.get('title'), str) and app['title'].strip(), '[app.json] title 不能为空')
    require(app.get('density', 'compact') in ('compact', 'comfortable'), '[app.json] density 仅支持 compact 或 comfortable')
    require(app.get('shell', 'sidebar') in ('sidebar', 'topnav'), '[app.json] shell 仅支持 sidebar 或 topnav')
    refs = app.get('pages')
    require(isinstance(refs, dict) and 0 < len(refs) <= 30, '[app.json] pages 需要 1–30 个页面路径映射')
    pages, data = {}, {}
    for key, name in refs.items():
        require(IDENTIFIER.fullmatch(key) is not None and isinstance(name, str) and name.startswith('pages/'), f'[app.json] 非法页面引用 {key} -> {name}（id 需小写字母/数字/短横线，路径以 pages/ 开头）')
        page = read_json(root, name)
        require(isinstance(page, dict) and isinstance(page.get('title'), str) and isinstance(page.get('content'), list), f'[{name}] 需要 title 字符串和 content 数组')

        def validate_node(node, ctx_path):
            require(isinstance(node, dict) and isinstance(node.get('component'), str), f'[{name} {ctx_path}] 节点需要 component 字符串，插槽不能直接放文本')
            slots = node.get('slots', {})
            require(isinstance(slots, dict), f'[{name} {ctx_path}] slots 必须是对象')
            for slot_name, children in slots.items():
                require(isinstance(children, (dict, list)), f'[{name} {ctx_path}.slots.{slot_name}] 插槽需要节点对象或节点数组')
                for idx, child in enumerate(children if isinstance(children, list) else [children]):
                    validate_node(child, f'{ctx_path}.slots.{slot_name}[{idx}]')

        require(isinstance(page.get('views', {}), dict), f'[{name}] views 必须是视图名称到节点的映射')
        for idx, node in enumerate(page['content']):
            validate_node(node, f'content[{idx}]')
        for view_name, node in page.get('views', {}).items():
            validate_node(node, f'views.{view_name}')
        ids = set()
        for node in nodes_in(page):
            require(isinstance(node['component'], str) and IDENTIFIER.fullmatch(node['component']), f'[{name}] 包含非法 component：{node.get("component")}')
            if 'id' in node:
                require(isinstance(node['id'], str) and IDENTIFIER.fullmatch(node['id']) and node['id'] not in ids, f'[{name}] 包含重复或非法节点 id：{node["id"]}')
                ids.add(node['id'])
            require(isinstance(node.get('props', {}), dict), f'[{name} #{node.get("id", node["component"])}] props 必须是对象')
        pages[key] = page
    require(app.get('startPage', next(iter(pages))) in pages, f'[app.json] startPage "{app.get("startPage")}" 不在 pages {list(pages)} 中')
    require(isinstance(app.get('data', {}), dict), '[app.json] data 必须是数据名称到文件路径的映射')
    for key, name in app.get('data', {}).items():
        require(IDENTIFIER.fullmatch(key) is not None and isinstance(name, str) and name.startswith('data/'), f'[app.json] 非法数据引用：{key} -> {name}')
        rows = read_json(root, name)
        require(isinstance(rows, list) and all(isinstance(row, dict) for row in rows), f'[{name}] 必须是记录对象数组')
        data[key] = rows
    for page_key, page in pages.items():
        page_file = refs[page_key]
        for node in nodes_in(page):
            props = node.get('props', {})
            label = f'[{page_file} #{node.get("id", node["component"])}]'
            if 'data' in props and isinstance(props['data'], str):
                require(props['data'] in data, f'{label} 引用了不存在的数据集 "{props["data"]}"，可用数据集：{list(data)}')
            if node['component'] == 'table':
                fields = props.get('fields', [])
                require(
                    isinstance(fields, list) and fields and all(
                        isinstance(f, dict) and isinstance(f.get('key'), str) and FIELD_KEY.fullmatch(f['key']) and isinstance(f.get('label'), str)
                        for f in fields
                    ),
                    f'{label} table.fields 需要带稳定 key/label 的字段数组（key 需字母开头的字母数字下划线）'
                )
                for f in fields:
                    ftype = f.get('type', 'text')
                    require(ftype in SUPPORTED_FIELD_TYPES, f'{label} 字段 "{f["key"]}" 类型 "{ftype}" 不受支持，可选：{sorted(SUPPORTED_FIELD_TYPES)}')
                keys = [f['key'] for f in fields]
                require(len(set(keys)) == len(keys), f'{label} table.fields.key 不允许重复')
                for option in ('columns', 'filters'):
                    require(isinstance(props.get(option, []), list) and all(k in keys for k in props.get(option, [])), f'{label} table.{option} 必须引用 fields 中已定义的 key：{keys}')
                require(type(props.get('pageSize', 8)) is int and 1 <= props.get('pageSize', 8) <= 100, f'{label} table.pageSize 需要 1–100 的整数')
                require('data' in props, f'{label} table 缺少 data 数据集名称')
                row_key = props.get('rowKey', 'id')
                records = data[props['data']]
                values = [r.get(row_key) for r in records]
                require(all(isinstance(v, (str, int)) and not isinstance(v, bool) for v in values) and len({str(v) for v in values}) == len(values), f'{label} 数据集 "{props["data"]}" 每条记录需要唯一的 {row_key}')
    registry = read_json(root, 'components.json')
    require(isinstance(registry, dict), '[components.json] 必须是组件注册表对象')
    return app, pages, data, registry


def dependency_order(pages, registry):
    order, active, done = [], set(), set()

    def visit(name):
        require(isinstance(name, str) and IDENTIFIER.fullmatch(name), f'非法组件名称：{name}')
        require(name in registry, f'组件未注册：{name}；请确认名称正确（运行 ucd.py components 查看内置组件），或在 components.json 声明自定义组件')
        require(name not in active, f'组件依赖存在循环：{name}')
        if name in done:
            return
        entry = registry[name]
        require(isinstance(entry, dict) and isinstance(entry.get('file'), str) and entry['file'].startswith('components/') and entry['file'].endswith('.js'), f'[components.json] {name}.file 需要 components/ 下的 .js 文件')
        relative(entry['file'])
        if 'css' in entry and entry['css'] is not None:
            require(isinstance(entry['css'], str) and entry['css'].startswith('components/') and entry['css'].endswith('.css'), f'[components.json] {name}.css 需要 components/ 下的 .css 文件')
            relative(entry['css'])
        require(isinstance(entry.get('dependencies', []), list), f'[components.json] {name}.dependencies 必须是数组')
        active.add(name)
        for dep in entry.get('dependencies', []):
            require(isinstance(dep, str), f'[components.json] {name}.dependencies 项必须为组件名称')
            visit(dep)
        active.remove(name)
        done.add(name)
        order.append(name)

    for page in pages.values():
        for node in nodes_in(page):
            visit(node['component'])
    return order


def collect(root):
    app, pages, data, registry = load_project(root)
    order = dependency_order(pages, registry)
    files = {'build.py', 'app.json', 'components.json', 'project.json', 'runtime/runtime.js', 'runtime/style.css', 'runtime/themes.json'}
    files.update(app['pages'].values())
    files.update(app.get('data', {}).values())
    for name in order:
        files.add(registry[name]['file'])
        if registry[name].get('css'):
            files.add(registry[name]['css'])
    assets = app.get('assets', {})
    require(isinstance(assets, dict) and all(isinstance(v, str) and v.startswith('assets/') for v in assets.values()), '[app.json] assets 必须映射到 assets/ 本地素材')
    files.update(assets.values())

    def find_assets(value):
        if isinstance(value, str) and value.startswith('assets/'):
            files.add(value)
        elif isinstance(value, dict):
            for child in value.values():
                find_assets(child)
        elif isinstance(value, list):
            for child in value:
                find_assets(child)

    find_assets(pages)
    find_assets(data)
    sources = {}
    for name in sorted(files):
        path = source_path(root, name)
        require(path.is_file(), f'缺少源文件：{name}；新增内置组件后请通过 skill 的 build 命令同步依赖')
        require(path.stat().st_size <= 20 * 1024 * 1024, f'源文件超过 20 MB：{name}')
        if name.startswith('assets/'):
            require(path.suffix.lower() in ASSET_TYPES, f'不支持的素材类型：{name}')
        sources[name] = path.read_bytes()
    require(sum(map(len, sources.values())) <= MAX_SOURCE, '工程源码合计超过 50 MB')
    project = json.loads(sources['project.json'].decode('utf-8-sig'))
    require(project.get('format') == 1 and project.get('engineVersion') == VERSION, '工程构建器版本不匹配，请保留工程自带的 build.py')
    return app, pages, data, registry, order, sources


def archive(sources):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as output:
        for name, data in sorted(sources.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            output.writestr(info, data)
    return buffer.getvalue()


def decode_html(html, allow_modified=False):
    matches = list(SOURCE.finditer(html))
    require(len(matches) == 1, 'HTML 缺少唯一的 UCD 工程源码包；不支持反编译旧版或第三方 HTML')
    match = matches[0]
    modified = sha((html[:match.start()] + html[match.end():]).encode('utf-8')) != match[2]
    require(not modified or allow_modified, 'HTML 存在外部手工修改；请保留原文件。使用 --allow-modified 仅恢复内嵌源码，不包含外部修改')
    raw = base64.b64decode(match[3], validate=True)
    require(len(raw) <= MAX_SOURCE and sha(raw) == match[1], '内嵌工程摘要不匹配或归档过大')
    sources, names = {}, set()
    with zipfile.ZipFile(io.BytesIO(raw)) as package:
        require(len(package.infolist()) <= 1000 and sum(i.file_size for i in package.infolist()) <= MAX_SOURCE, '源码包文件数或展开体积超限')
        for info in package.infolist():
            relative(info.filename)
            require(not info.is_dir() and ((info.external_attr >> 16) & 0o170000) != 0o120000, '源码包不允许目录项或符号链接')
            require(info.filename.casefold() not in names and not info.flag_bits & 1, '源码包含重复路径或加密内容')
            names.add(info.filename.casefold())
            sources[info.filename] = package.read(info)
    require({'app.json', 'build.py', 'project.json', 'components.json'} <= sources.keys(), '源码包缺少工程入口')
    return sources, modified


def verify_output(path):
    if path.exists():
        require(path.is_file() and path.stat().st_size <= 100 * 1024 * 1024, '输出目标不是文件或超过 100 MB')
        decode_html(path.read_bytes().decode('utf-8'))


def atomic_write(path, data):
    path = local_root(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(prefix='.ucd-', dir=path.parent)
    try:
        with os.fdopen(handle, 'wb') as output:
            output.write(data)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def build(root, output=None, write_manifest=True):
    root = local_root(root)
    output = local_root(output or root/'index.html')
    verify_output(output)
    app, pages, data, registry, order, sources = collect(root)
    source_paths = [root.joinpath(*relative(name).parts) for name in sources]
    require(output not in source_paths and output.with_suffix('.manifest.json') not in source_paths, 'HTML 或清单输出不能覆盖工程源码')
    urls = {}
    for name, content in sources.items():
        if name.startswith('assets/'):
            mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
            urls[name] = f'data:{mime};base64,' + base64.b64encode(content).decode('ascii')

    def inline(value):
        if isinstance(value, str):
            return urls.get(value, value)
        if isinstance(value, list):
            return [inline(v) for v in value]
        if isinstance(value, dict):
            return {k: inline(v) for k, v in value.items()}
        return value

    themes = json.loads(sources['runtime/themes.json'].decode('utf-8-sig'))
    require(app.get('style', 'ocean') in themes, f'[app.json] 未知 style "{app.get("style")}"，可选：{list(themes)}')
    tokens = {**themes[app.get('style', 'ocean')]['tokens'], **app.get('tokens', {})}
    for key, value in tokens.items():
        require(re.fullmatch(r'[a-z][a-z0-9-]*', key) and isinstance(value, str) and not re.search(r'[;{}<>]|url\s*\(|@import', value, re.I), f'非法主题 token：{key}')
    css_parts = [':root{' + ';'.join(f'--{k}:{v}' for k, v in tokens.items()) + '}', sources['runtime/style.css'].decode('utf-8-sig')]
    included_css = set()
    for name in order:
        css_file = registry[name].get('css')
        if css_file and css_file not in included_css:
            css_parts.append(sources[css_file].decode('utf-8-sig'))
            included_css.add(css_file)
    css = '\n'.join(css_parts)
    payload = {'app': inline(app), 'pages': inline(pages), 'data': inline(data), 'assets': {k: urls[v] for k, v in app.get('assets', {}).items()}}
    script = sources['runtime/runtime.js'].decode('utf-8-sig') + '\n'
    included = set()
    for name in order:
        filename = registry[name]['file']
        if filename not in included:
            script += sources[filename].decode('utf-8-sig') + '\n'
            included.add(filename)
    for resource, url in urls.items():
        css = css.replace(resource, url)
        script = script.replace(resource, url)
    require(not re.search(r'@import|url\s*\(\s*[\'"]?(?:https?:|//|file:|assets/)', css, re.I), '样式存在未内联或远程资源，请在 app.assets 声明素材')
    script = re.sub(r'</script', r'<\\/script', script, flags=re.I)
    css = re.sub(r'</style', r'<\\/style', css, flags=re.I)
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    title = html_lib.escape(app['title'])
    document = f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'">
<title>{title}</title><style>{css}</style></head><body><div id="ucd-app"></div>
<dialog id="ucd-overlay"><div class="overlay-head"><h2 id="ucd-overlay-title"></h2><button type="button" class="btn btn-small" data-overlay-close aria-label="关闭">关闭</button></div><div id="ucd-overlay-body"></div></dialog>
<dialog id="ucd-confirm" class="modal confirm-modal"><div class="overlay-head"><h2 id="ucd-confirm-title">请确认操作</h2></div><div class="confirm-body" id="ucd-confirm-message"></div><div class="confirm-foot"><button type="button" class="btn" data-confirm-cancel>取消</button><button type="button" class="btn btn-primary" data-confirm-ok>确认</button></div></dialog>
<div id="ucd-toast" role="status" aria-live="polite" hidden></div>
<script id="ucd-config" type="application/json">{payload_json}</script><script>{script}
UCD.boot(JSON.parse(document.getElementById('ucd-config').textContent));</script>
<!-- UCD:SOURCE -->
</body></html>
'''
    package = archive(sources)
    clean = document.replace('<!-- UCD:SOURCE -->', '')
    source_tag = f'<script id="ucd-source" type="application/octet-stream" data-format="1" data-source-sha="{sha(package)}" data-page-sha="{sha(clean.encode("utf-8"))}">{base64.b64encode(package).decode("ascii")}</script>'
    content = document.replace('<!-- UCD:SOURCE -->', source_tag).encode('utf-8')
    atomic_write(output, content)
    if write_manifest:
        manifest = {'tool': 'ucd-studio-project', 'engineVersion': VERSION, 'components': order, 'sourceFiles': {name: sha(value) for name, value in sources.items()}, 'htmlSha256': sha(content)}
        atomic_write(output.with_suffix('.manifest.json'), json_bytes(manifest))
    return {'ok': True, 'html': str(output), 'components': order, 'sourceFiles': len(sources), 'bytes': len(content)}


def unpack(html_path, output, allow_modified=False, force=False):
    html_path, root = local_root(html_path), local_root(output)
    require(html_path.is_file() and html_path.stat().st_size <= 100 * 1024 * 1024, 'HTML 不存在或超过 100 MB')
    if root.exists() and any(root.iterdir()):
        require(force, '解包目录必须不存在或为空，避免覆盖已有源码（若目录为旧 UCD 工程可加 --force 覆盖）')
        require((root/'project.json').is_file() and (root/'app.json').is_file(), '目标目录非 UCD 配置工程，拒绝 --force 覆盖')
    sources, modified = decode_html(html_path.read_bytes().decode('utf-8'), allow_modified)
    # Validate the complete archive before exposing the recovered project.
    with tempfile.TemporaryDirectory(prefix='ucd-unpack-') as temporary:
        stage = Path(temporary)
        for name, content in sources.items():
            path = source_path(stage, name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        collect(stage)
        root.parent.mkdir(parents=True, exist_ok=True)
        root.mkdir(exist_ok=True)
        for name, content in sources.items():
            atomic_write(source_path(root, name), content)
    result = {'ok': True, 'directory': str(root), 'sourceFiles': len(sources), 'externallyModified': modified}
    if modified:
        result['note'] = '仅恢复内嵌源码；外部手工修改保留在原 HTML 中，未合并进工程。'
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', help='HTML 路径，默认工程目录/index.html')
    parser.add_argument('--no-manifest', action='store_true', help='不生成旁的 .manifest.json 文件')
    args = parser.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
    try:
        print(json_bytes(build(Path(__file__).resolve().parent, args.out, write_manifest=not args.no_manifest)).decode('utf-8'), end='')
    except (ValueError, OSError, KeyError, TypeError, zipfile.BadZipFile) as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
