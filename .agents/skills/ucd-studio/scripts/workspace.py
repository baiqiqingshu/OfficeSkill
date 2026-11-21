"""Prepare portable configuration projects and build from an isolated copy."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT/'assets/workspace'
spec = importlib.util.spec_from_file_location('ucd_project_engine', TEMPLATE/'build.py')
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


def component_catalog():
    return engine.read_json(TEMPLATE, 'registry.json')


def apply_sets(value, pairs):
    """Set object paths and existing array indexes without replacing whole arrays."""
    result = json.loads(json.dumps(value, ensure_ascii=False))
    for pair in pairs:
        engine.require('=' in pair, '--set 需要 path=value')
        key, raw = pair.split('=', 1)
        parts = key.strip().split('.')
        engine.require(all(parts), f'无效字段路径：{key}')
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            value = raw
        cursor = result
        for index, part in enumerate(parts):
            last = index == len(parts) - 1
            if isinstance(cursor, list):
                engine.require(part.isdigit() and int(part) < len(cursor), f'数组索引不存在：{key}')
                if last:
                    cursor[int(part)] = value
                else:
                    cursor = cursor[int(part)]
            else:
                engine.require(isinstance(cursor, dict), f'路径经过非对象值：{key}')
                if last:
                    cursor[part] = value
                else:
                    cursor = cursor.setdefault(part, {})
    return result


def prepare(directory):
    root = engine.local_root(directory)
    app, pages, data, registry = engine.load_project(root)
    available = component_catalog()
    merged = {**available, **registry}
    order = engine.dependency_order(pages, merged)
    for name in order:
        entry = merged[name]
        destination = engine.source_path(root, entry['file'])
        if not destination.exists():
            engine.require(name in available and entry['file'] == available[name]['file'], f'自定义组件缺少文件：{entry["file"]}')
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(TEMPLATE/entry['file'], destination)
        registry[name] = entry
    engine.atomic_write(root/'components.json', engine.json_bytes(registry))
    return root


def create(directory, config=None, title=None, style=None):
    root = engine.local_root(directory)
    engine.require(not root.exists() or root.is_dir() and not any(root.iterdir()), 'project 仅允许新目录或空目录')
    root.mkdir(parents=True, exist_ok=True)
    for path in (TEMPLATE/'starter').rglob('*'):
        if path.is_file():
            target = root/path.relative_to(TEMPLATE/'starter')
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
    shutil.copyfile(TEMPLATE/'build.py', root/'build.py')
    shutil.copytree(TEMPLATE/'runtime', root/'runtime')
    shutil.copyfile(ROOT/'data/styles.json', root/'runtime/themes.json')
    engine.atomic_write(root/'project.json', engine.json_bytes({'format': 1, 'engineVersion': engine.VERSION}))
    app = engine.read_json(root, 'app.json')
    if config:
        config_path = engine.local_root(config)
        base = config_path.parent
        override = json.loads(config_path.read_text(encoding='utf-8-sig'))
        engine.require(isinstance(override, dict), '--config 必须是 app.json 的对象补丁')
        app.update(override)
        registry = engine.read_json(root, 'components.json')
        if (base/'components.json').is_file():
            registry.update(engine.read_json(base, 'components.json'))
        engine.atomic_write(root/'components.json', engine.json_bytes(registry))
        # Only copy explicitly referenced files; never import the surrounding project.
        names = list(app.get('pages', {}).values()) + list(app.get('data', {}).values()) + list(app.get('assets', {}).values())
        for name in names:
            source = engine.source_path(base, name)
            if source.is_file():
                engine.atomic_write(engine.source_path(root, name), source.read_bytes())
        engine.atomic_write(root/'app.json', engine.json_bytes(app))
        _, pages, records, _ = engine.load_project(root)
        merged = {**component_catalog(), **registry}
        for name in engine.dependency_order(pages, merged):
            filename = merged[name]['file']
            source = engine.source_path(base, filename)
            if source.is_file():
                engine.atomic_write(engine.source_path(root, filename), source.read_bytes())
        def copy_assets(value):
            if isinstance(value, str) and value.startswith('assets/'):
                source = engine.source_path(base, value)
                if source.is_file():
                    engine.atomic_write(engine.source_path(root, value), source.read_bytes())
            elif isinstance(value, dict):
                for child in value.values():
                    copy_assets(child)
            elif isinstance(value, list):
                for child in value:
                    copy_assets(child)
        copy_assets(pages)
        copy_assets(records)
    if title is not None:
        app['title'] = title
    if style is not None:
        app['style'] = style
    engine.atomic_write(root/'app.json', engine.json_bytes(app))
    return build_project(root)


def build_project(directory, output=None):
    root = prepare(directory)
    target = engine.local_root(output or root/'index.html')
    engine.verify_output(target)
    *_, sources = engine.collect(root)
    source_paths = [root/name for name in sources]
    engine.require(target not in source_paths and target.with_suffix('.manifest.json') not in source_paths, 'HTML 或清单输出不能覆盖工程源码')
    with tempfile.TemporaryDirectory(prefix='ucd-project-build-') as temporary:
        stage = Path(temporary)
        for name, data in sources.items():
            path = stage/name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        result = subprocess.run([sys.executable, '-B', 'build.py'], cwd=stage, capture_output=True, encoding='utf-8')
        engine.require(result.returncode == 0, result.stderr.strip() or result.stdout.strip() or '临时工程构建失败')
        engine.atomic_write(target, (stage/'index.html').read_bytes())
        engine.atomic_write(target.with_suffix('.manifest.json'), (stage/'index.manifest.json').read_bytes())
        summary = json.loads(result.stdout)
        summary.update(html=str(target), directory=str(root), staged=True)
        return summary


def summary(directory):
    root = engine.local_root(directory)
    app, pages, data, registry = engine.load_project(root)
    return {'mode': 'project', 'title': app['title'], 'style': app.get('style', 'ocean'),
            'pages': {key: {'file': app['pages'][key], 'title': page['title'], 'nodes': [{'id': n.get('id'), 'component': n['component']} for n in engine.nodes_in(page)]} for key, page in pages.items()},
            'data': {key: {'file': app['data'][key], 'rows': len(rows)} for key, rows in data.items()},
            'components': {key: entry['file'] for key, entry in registry.items()},
            'edit': '修改对应 JSON/组件后 build；只有 HTML 时先 unpack，避免编辑 index.html。'}


def check(directory):
    root = engine.local_root(directory)
    *_, sources = engine.collect(root)
    html_path = root/'index.html'
    embedded, modified = engine.decode_html(html_path.read_bytes().decode('utf-8'))
    engine.require(sources == embedded, '源码已变化，请先 build')
    return {'ok': True, 'mode': 'project', 'sourceFiles': len(sources), 'html': str(html_path), 'sourceMatches': True}
