"""Original, escaped HTML component renderer. No third party dependencies."""
import html
import re
from pathlib import Path
from string import Template

ROOT = Path(__file__).resolve().parents[1]
TYPES = ('stats', 'table', 'bar-chart', 'line-chart', 'activity', 'form', 'detail',
         'cards', 'kanban', 'steps', 'accordion', 'alert', 'empty', 'progress', 'image', 'tabs')


def h(value):
    return html.escape(str(value), quote=True)


def icon(kind):
    paths = {
        'table':'M4 4h16v16H4z M4 9h16 M9 9v11',
        'stats':'M5 19V12 M12 19V5 M19 19V9',
        'cards':'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
        'form':'M8 4H5v16h14V4h-3 M8 3h8v4H8z M8 12h8 M8 16h5',
        'activity':'M6 5v14 M6 6h14 M6 12h10 M6 18h7',
        'detail':'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6',
        'kanban':'M4 5h16 M5 9v10 M12 9v7 M19 9v9',
        'progress':'M4 12h16 M4 6h10 M4 18h7',
        'alert':'M12 4 2 20h20L12 4z M12 10v4 M12 17h.01',
        'plus':'M12 5v14 M5 12h14',
        'previous':'M14 6l-6 6 6 6',
        'next':'M10 6l6 6-6 6',
        'sort':'M8 17V5 M5 8l3-3 3 3 M16 7v12 M13 16l3 3 3-3',
        'empty':'M4 8l3-4h10l3 4v12H4z M4 13h5l2 3h2l2-3h5',
    }
    path = paths.get(kind, 'M4 19V5 M4 19h16 M8 14l4-5 4 3 4-7')
    return f'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="{path}"/></svg>'


CHEVRON = '<svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
MAGNIFIER = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M20 20l-4.8-4.8"/></svg>'


def select_wrap(inner):
    return f'<span class="select-wrap">{inner}{CHEVRON}</span>'


def badge(value):
    if not isinstance(value, dict):
        return h(value)
    tone = value.get('tone', 'neutral')
    if tone not in ('neutral', 'success', 'warning', 'danger', 'primary'):
        tone = 'neutral'
    return f'<span class="badge {tone}">{h(value.get("text", ""))}</span>'


def button(label, message=None):
    return f'<button type="button" class="btn btn-small" data-notify="{h(message or label + "：本地演示操作已触发")}">{h(label)}</button>'


def fields(items, prefix):
    result = []
    for i, field in enumerate(items):
        kind = field.get('type', 'text')
        name = f'{prefix}-field-{i}'
        required = ' required' if field.get('required') else ''
        hint = f'<span class="field-help" id="{name}-help">{h(field["help"])}</span>' if field.get('help') else ''
        help_attr = f' aria-describedby="{name}-help"' if hint else ''
        attrs = f'id="{name}" name="{name}"{required}{help_attr}'
        if kind == 'select':
            options = ''.join(f'<option'+(' selected' if x == field.get('value') else '')+f'>{h(x)}</option>' for x in field.get('options', []))
            control = select_wrap(f'<select {attrs}>{options}</select>')
        elif kind == 'textarea':
            control = f'<textarea {attrs} placeholder="{h(field.get("placeholder", ""))}">{h(field.get("value", ""))}</textarea>'
        else:
            extra = ' min="0"' if kind == 'number' else ''
            control = f'<input type="{kind}" {attrs}{extra} value="{h(field.get("value", ""))}" placeholder="{h(field.get("placeholder", ""))}">'
        wide = ' class="field-wide"' if kind == 'textarea' else ''
        required_mark = '<span class="required" aria-hidden="true">*</span>' if required else ''
        result.append(f'<label{wide} for="{name}"><span>{h(field["label"])}{required_mark}</span>{control}{hint}</label>')
    return ''.join(result)


def render_block(key, b, index=1):
    kind = b['type']
    title = h(b.get('title', ''))
    description = f'<p>{h(b["description"])}</p>' if b.get('description') else ''
    head = f'<div class="panel-head"><div><h2 id="{key}-heading">{title}</h2>{description}</div></div>'
    body = ''
    if kind == 'stats':
        cards = []
        for item in b['items']:
            foot = f'<div class="stat-foot"><span class="stat-change">{h(item.get("change", ""))}</span>{h(item.get("hint", ""))}</div>' if item.get('change') or item.get('hint') else ''
            cards.append(f'<div class="stat"><div class="stat-label">{h(item["label"])}</div><div class="stat-value">{h(item["value"])}</div>{foot}</div>')
        content = f'<h2 class="visually-hidden" id="{key}-heading">{title}</h2><div class="stats-grid">{"".join(cards)}</div>'
    elif kind == 'table':
        numeric_columns = {i for i in range(len(b['columns'])) if b['rows'] and all(not isinstance(row[i], dict) and re.fullmatch(r'[+-]?(?:[¥￥$€]\s*)?[\d,]+(?:\.\d+)?(?:%|元|万元)?', str(row[i])) for row in b['rows'])}
        cols = ''.join(f'<th scope="col"'+(' class="numeric"' if i in numeric_columns else '')+f'><button type="button" class="sort-btn" data-sort="{i}" aria-label="按{h(c)}排序">{h(c)}{icon("sort")}</button></th>' for i, c in enumerate(b['columns']))
        rows = []
        status_index = b.get('statusColumn', len(b['columns']) - 1)
        statuses = []
        for row in b['rows']:
            value = row[status_index]
            status = str(value.get('text', '')) if isinstance(value, dict) else str(value)
            if status not in statuses:
                statuses.append(status)
            cells = ''.join('<td'+(' class="numeric"' if i in numeric_columns else '')+f'>{badge(value)}</td>' for i, value in enumerate(row))
            rows.append(f'<tr data-status="{h(status)}">{cells}</tr>')
        opts = ''.join(f'<option value="{h(s)}">{h(s)}</option>' for s in statuses)
        skeleton = '<div class="table-skeleton" data-skeleton aria-hidden="true" hidden>'+''.join('<div><i></i><i></i><i></i></div>' for _ in range(4))+'</div>'
        filter_select = select_wrap('<select data-filter><option value="">全部状态</option>'+opts+'</select>')
        state_select = select_wrap('<select data-state><option value="ready">正常</option><option value="loading">加载中</option><option value="empty">空状态</option><option value="error">加载失败</option></select>')
        body = f'''<div class="table-toolbar"><label class="search-label">搜索记录<span class="input-wrap">{MAGNIFIER}<input type="search" data-search placeholder="搜索任意字段…"></span></label><label class="filter-label">状态{filter_select}</label></div><div class="table-scroll" tabindex="0" role="region" aria-label="{title}，宽表格可横向滚动"><table class="data-table"><caption class="visually-hidden">{title}</caption><thead><tr>{cols}</tr></thead><tbody>{''.join(rows)}</tbody></table><div class="state-message" data-empty hidden><p>没有匹配记录，请调整搜索或筛选条件。</p><button type="button" class="btn btn-small" data-reset-filters>清除搜索与筛选</button></div></div>{skeleton}<div class="table-state" data-table-state hidden><p class="state-message" role="status" data-state-message></p><button type="button" class="btn btn-small" data-retry hidden>重试</button></div><div class="table-footer"><span role="status" data-table-status></span><div class="pagination" aria-label="记录分页"><button type="button" class="btn btn-small" data-prev aria-label="上一页">{icon("previous")}</button><span data-pages></span><button type="button" class="btn btn-small" data-next aria-label="下一页">{icon("next")}</button></div></div><details class="state-tools"><summary>预览加载、空与错误状态</summary><label>显示状态{state_select}</label></details>'''
        content = f'<div class="panel" data-table data-page-size="{b.get("pageSize", 5)}">{head}{body}</div>'
    elif kind == 'bar-chart':
        body = ''.join(f'<div class="chart-row"><span>{h(x["label"])}</span><div class="bar-track"><span class="bar-fill" style="width:{x["value"]}%"></span></div><span class="chart-value">{x["value"]}%</span></div>' for x in b['items'])
    elif kind == 'line-chart':
        values = b['values']
        top = max(max(values), 1)
        points = ' '.join(f'{i * 540 / max(len(values)-1,1):.1f},{150-v/top*120:.1f}' for i, v in enumerate(values))
        lines = ''.join(f'<line x1="0" x2="540" y1="{y}" y2="{y}" stroke="var(--border)" stroke-dasharray="3 5"/>' for y in (30, 70, 110, 150))
        desc = h('；'.join(f'{label}：{v}' for label, v in zip(b['labels'], values)))
        body = f'<div class="chart-summary"><strong>{h(b.get("summary", values[-1]))}</strong><span class="badge success">{h(b.get("change", "本周期"))}</span></div><svg class="line-chart" viewBox="-5 0 550 170" role="img" aria-labelledby="{key}-chart-title {key}-chart-desc"><title id="{key}-chart-title">{title}</title><desc id="{key}-chart-desc">{desc}</desc>{lines}<polyline points="{points}" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="chart-labels">'+''.join(f'<span>{h(x)}</span>' for x in b['labels'])+'</div><div class="chart-key"><span><i class="status-dot" style="background:var(--primary)"></i>本周期实际值</span><span>统计口径：示例数据</span></div>'
    elif kind == 'activity':
        body = '<ol class="timeline">'+''.join(f'<li><small>{h(x.get("time", ""))}</small><p>{h(x["title"])}</p><span>{h(x.get("description", ""))}</span></li>' for x in b['items'])+'</ol>'
    elif kind == 'form':
        body = f'<form data-form><div class="form-grid">{fields(b["fields"], key)}</div><div class="form-actions"><button type="submit" class="btn btn-primary">{h(b.get("submit", "校验并提交"))}</button><button type="reset" class="btn">重置</button></div><p class="form-feedback" role="status" data-feedback></p></form>'
    elif kind == 'detail':
        body = '<dl class="detail-grid">'+''.join(f'<div><dt>{h(x["label"])}</dt><dd>{badge(x["value"])}</dd></div>' for x in b['items'])+'</dl>'
    elif kind == 'cards':
        body = '<div class="cards">'+''.join(f'<article class="item-card"><div class="item-icon">{icon("cards")}</div><div class="item-copy"><h3>{h(x["title"])}</h3><p>{h(x.get("description", ""))}</p></div>{button(x.get("action", "查看详情"))}</article>' for x in b['items'])+'</div>'
    elif kind == 'kanban':
        columns = []
        for i, column in enumerate(b['columns']):
            tasks = []
            for task in column['items']:
                options = ''.join(f'<option value="{n}"'+(' selected' if i == n else '')+f'>{h(c["title"])}</option>' for n, c in enumerate(b['columns']))
                move = f'<select data-task-move aria-label="移动任务：{h(task["title"])}">{options}</select>'
                tasks.append(f'<article class="task"><span class="badge">{h(task.get("tag", "任务"))}</span><p>{h(task["title"])}</p><small>{h(task.get("owner", "未指派"))}</small><label>移动至{select_wrap(move)}</label></article>')
            columns.append(f'<section class="kanban-column" data-column="{i}"><h3>{h(column["title"])}<span class="badge neutral" data-count>{len(tasks)}</span></h3>{"".join(tasks)}</section>')
        body = '<div class="kanban">'+''.join(columns)+'</div>'
    elif kind == 'steps':
        body = '<ol class="steps">'+''.join(f'<li'+(' aria-current="step"' if i == b.get('current', 0) else '')+f'><span class="step-number">{i+1}</span>{h(x)}</li>' for i, x in enumerate(b['items']))+'</ol>'
    elif kind == 'accordion':
        body = '<div class="accordion">'+''.join(f'<details><summary>{h(x["title"])}</summary><p>{h(x["content"])}</p></details>' for x in b['items'])+'</div>'
    elif kind == 'alert':
        content = f'<div class="alert" role="note"><h2 id="{key}-heading">{title}</h2><p>{h(b["text"])}</p></div>'
    elif kind == 'empty':
        body = f'<div class="empty"><div class="empty-icon" aria-hidden="true">{icon("empty")}</div><h3>{h(b.get("heading", "暂无内容"))}</h3><p>{h(b["text"])}</p>{button(b.get("action", "创建第一项"))}</div>'
    elif kind == 'progress':
        body = ''.join(f'<div class="progress-item"><div class="row"><span>{h(x["label"])}</span><span class="muted">{x["value"]}%</span></div><progress value="{x["value"]}" max="100" aria-label="{h(x["label"])}">{x["value"]}%</progress></div>' for x in b['items'])
    elif kind == 'image':
        body = f'<figure style="margin:0"><img class="local-image" src="{h(b["src"])}" alt="{h(b["alt"])}"><figcaption class="image-caption">{h(b.get("caption", ""))}</figcaption></figure>'
    elif kind == 'tabs':
        tabs, panels = [], []
        for i, item in enumerate(b['items']):
            tabid, panelid = f'{key}-tab-{i}', f'{key}-panel-{i}'
            tabs.append(f'<button type="button" role="tab" id="{tabid}" aria-controls="{panelid}" aria-selected="{str(i==0).lower()}" tabindex="{0 if i==0 else -1}">{h(item["label"])}</button>')
            panels.append(f'<div class="tab-panel" role="tabpanel" id="{panelid}" aria-labelledby="{tabid}" tabindex="0"'+(' hidden' if i else '')+f'>{h(item["content"])}</div>')
        body = f'<div data-tabs><div class="tab-list" role="tablist" aria-label="{title}">{"".join(tabs)}</div>{"".join(panels)}</div>'
    if kind not in ('stats', 'table', 'alert'):
        content = f'<div class="panel">{head}<div class="panel-body">{body}</div></div>'
    span = 'full' if b.get('span', 'half') == 'full' else ''
    return f'<section class="block block-{kind} {span}" id="{key}" aria-labelledby="{key}-heading">{content}</section>'


def render_page(spec, style, mode):
    tokens = {**style['tokens'], **spec.get('tokens', {})}
    token_css = ';'.join(f'--{key}:{value}' for key, value in tokens.items())+';'
    blocks = ''.join(render_block(key, b, i+1) for i, (key, b) in enumerate(spec['blocks'].items()))
    nav = ''.join(f'<a href="#{key}"'+(' class="active" aria-current="location"' if i == 0 else '')+f'>{icon(b["type"])}<span>{h(b["title"])}</span></a>' for i, (key, b) in enumerate(spec['blocks'].items()))
    runtime = (ROOT/'assets/runtime.js').read_text(encoding='utf-8')
    script = f'<script>{runtime}</script>' if mode == 'single' else '<script defer src="'+('assets/ucd-runtime.js' if mode == 'library' else 'page.js')+'"></script>'
    values = {key:h(spec.get(key, default)) for key, default in {'title':'工作总览','product':'内部工作台','description':'查看并处理当前事项。','action':'新建事项','eyebrow':''}.items()}
    values.update(tokens=token_css, css=(ROOT/'assets/base.css').read_text(encoding='utf-8'),
                  blocks=blocks, nav=nav, layout=spec['layout'], density='dense' if spec.get('density') == 'compact' else '', script=script)
    return Template((ROOT/'assets/shell.html').read_text(encoding='utf-8')).substitute(values)


def component_css(kind):
    css = (ROOT/'assets/base.css').read_text(encoding='utf-8')
    marker = f'/* component: {kind} */'
    if marker not in css:
        return ''
    return css.split(marker, 1)[1].split('/*', 1)[0].strip()
