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
            options = ''.join(f'<option>{h(x)}</option>' for x in field.get('options', []))
            control = f'<select {attrs}>{options}</select>'
        elif kind == 'textarea':
            control = f'<textarea {attrs} placeholder="{h(field.get("placeholder", ""))}">{h(field.get("value", ""))}</textarea>'
        else:
            extra = ' min="0"' if kind == 'number' else ''
            control = f'<input type="{kind}" {attrs}{extra} value="{h(field.get("value", ""))}" placeholder="{h(field.get("placeholder", ""))}">'
        wide = ' class="field-wide"' if kind == 'textarea' else ''
        result.append(f'<label{wide} for="{name}">{h(field["label"])}{control}{hint}</label>')
    return ''.join(result)


def render_block(key, b, index=1):
    kind = b['type']
    title = h(b.get('title', ''))
    description = f'<p>{h(b["description"])}</p>' if b.get('description') else ''
    head = f'<div class="panel-head"><div><h2 id="{key}-heading">{title}</h2>{description}</div><span class="section-index">{index:02d}</span></div>'
    body = ''
    if kind == 'stats':
        cards = []
        for n, item in enumerate(b['items']):
            bars = ''.join(f'<i style="height:{v}px"></i>' for v in (10, 19, 14, 24, 21, 30))
            cards.append(f'<div class="stat"><div class="stat-label">{h(item["label"])}</div><div class="stat-value">{h(item["value"])}</div><div class="stat-foot"><span class="stat-change">{h(item.get("change", ""))}</span>{h(item.get("hint", "较上一周期"))}</div><div class="mini-bars" aria-hidden="true">{bars}</div></div>')
        content = f'<h2 class="muted" id="{key}-heading" style="font-size:11px;margin-bottom:12px">{title}</h2><div class="stats-grid">{"".join(cards)}</div>'
    elif kind == 'table':
        cols = ''.join(f'<th scope="col"><button type="button" class="sort-btn" data-sort="{i}" aria-label="按{h(c)}排序">{h(c)}</button></th>' for i, c in enumerate(b['columns']))
        rows = []
        status_index = b.get('statusColumn', len(b['columns']) - 1)
        statuses = []
        for row in b['rows']:
            value = row[status_index]
            status = str(value.get('text', '')) if isinstance(value, dict) else str(value)
            if status not in statuses:
                statuses.append(status)
            cells = ''.join(f'<td>{badge(value)}</td>' for value in row)
            rows.append(f'<tr data-status="{h(status)}">{cells}</tr>')
        opts = ''.join(f'<option value="{h(s)}">{h(s)}</option>' for s in statuses)
        body = f'''<div class="table-toolbar"><label class="search-label">搜索记录<input type="search" data-search placeholder="搜索任意字段…"></label><label class="filter-label">状态<select data-filter><option value="">全部状态</option>{opts}</select></label></div><div class="table-scroll"><table class="data-table"><caption hidden>{title}</caption><thead><tr>{cols}</tr></thead><tbody>{''.join(rows)}</tbody></table><p class="state-message" data-empty hidden>没有匹配记录，请调整搜索或筛选条件。</p></div><p class="state-message" role="status" data-state-message hidden></p><div class="table-footer"><span role="status" data-table-status></span><div class="pagination"><button type="button" class="btn btn-small" data-prev aria-label="上一页">←</button><span data-pages></span><button type="button" class="btn btn-small" data-next aria-label="下一页">→</button></div></div><details class="state-tools"><summary>预览异常状态</summary><label>显示状态<select data-state><option value="ready">正常</option><option value="loading">加载中</option><option value="empty">空状态</option><option value="error">加载失败</option></select></label></details>'''
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
        body = '<div class="cards">'+''.join(f'<article class="item-card"><div class="item-icon" aria-hidden="true">{i+1:02d}</div><h3>{h(x["title"])}</h3><p>{h(x.get("description", ""))}</p>{button(x.get("action", "查看详情"))}</article>' for i, x in enumerate(b['items']))+'</div>'
    elif kind == 'kanban':
        columns = []
        for i, column in enumerate(b['columns']):
            tasks = []
            for task in column['items']:
                options = ''.join(f'<option value="{n}"'+(' selected' if i == n else '')+f'>{h(c["title"])}</option>' for n, c in enumerate(b['columns']))
                tasks.append(f'<article class="task"><span class="badge">{h(task.get("tag", "任务"))}</span><p>{h(task["title"])}</p><small>{h(task.get("owner", "未指派"))}</small><label>移动至<select data-task-move aria-label="移动任务：{h(task["title"])}">{options}</select></label></article>')
            columns.append(f'<section class="kanban-column" data-column="{i}"><h3>{h(column["title"])}<span class="badge neutral" data-count>{len(tasks)}</span></h3>{"".join(tasks)}</section>')
        body = '<div class="kanban">'+''.join(columns)+'</div>'
    elif kind == 'steps':
        body = '<ol class="steps">'+''.join(f'<li'+(' aria-current="step"' if i == b.get('current', 0) else '')+f'><span class="step-number">{i+1}</span>{h(x)}</li>' for i, x in enumerate(b['items']))+'</ol>'
    elif kind == 'accordion':
        body = '<div class="accordion">'+''.join(f'<details><summary>{h(x["title"])}</summary><p>{h(x["content"])}</p></details>' for x in b['items'])+'</div>'
    elif kind == 'alert':
        content = f'<div class="alert" role="note"><h2 id="{key}-heading">{title}</h2><p>{h(b["text"])}</p></div>'
    elif kind == 'empty':
        body = f'<div class="empty"><div class="empty-icon" aria-hidden="true">＋</div><h3>{h(b.get("heading", "暂无内容"))}</h3><p>{h(b["text"])}</p>{button(b.get("action", "创建第一项"))}</div>'
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
    return f'<section class="block {span}" id="{key}" aria-labelledby="{key}-heading">{content}</section>'


def render_page(spec, style, mode):
    tokens = {**style['tokens'], **spec.get('tokens', {})}
    token_css = ';'.join(f'--{key}:{value}' for key, value in tokens.items())+';'
    blocks = ''.join(render_block(key, b, i+1) for i, (key, b) in enumerate(spec['blocks'].items()))
    nav = ''.join(f'<a href="#{key}"'+(' class="active" aria-current="location"' if i == 0 else '')+f'><span class="nav-dot" aria-hidden="true"></span>{h(b["title"])}</a>' for i, (key, b) in enumerate(spec['blocks'].items()))
    runtime = (ROOT/'assets/runtime.js').read_text(encoding='utf-8')
    script = f'<script>{runtime}</script>' if mode == 'single' else '<script defer src="'+('assets/ucd-runtime.js' if mode == 'library' else 'page.js')+'"></script>'
    values = {key:h(spec.get(key, default)) for key, default in {'title':'工作总览','product':'Workplace','description':'聚焦重要事项，推进每一项工作。','action':'新建事项','eyebrow':'Workspace overview'}.items()}
    values.update(tokens=token_css, css=(ROOT/'assets/base.css').read_text(encoding='utf-8'),
                  blocks=blocks, nav=nav, layout=spec['layout'], density='dense' if spec.get('density') == 'compact' else '', script=script)
    return Template((ROOT/'assets/shell.html').read_text(encoding='utf-8')).substitute(values)


def component_css(kind):
    css = (ROOT/'assets/base.css').read_text(encoding='utf-8')
    marker = f'/* component: {kind} */'
    if marker not in css:
        return ''
    return css.split(marker, 1)[1].split('/*', 1)[0].strip()
