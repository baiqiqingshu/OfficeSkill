// @component: bar-chart
UCD.register('bar-chart', {
  render(props, ctx) {
    const h = ctx.escape;
    let items = props.items || [];
    if (!items.length && props.data && props.groupBy) {
      const counts = new Map();
      for (const row of ctx.data(props.data)) {
        const key = String(row[props.groupBy] ?? '未分类');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      items = [...counts.entries()].map(([label, value]) => ({label, value}));
    }
    const max = Math.max(1, ...items.map(i => Number(i.value) || 0));
    const unit = props.unit || '';
    const rows = items.map(item => {
      const val = Number(item.value) || 0;
      const pct = Math.max(2, Math.min(100, Math.round(val / max * 100)));
      return `<div class="chart-row"><span>${h(item.label)}</span><div class="bar-track"><span class="bar-fill ${h(item.tone || '')}" style="width:${pct}%"></span></div><span class="chart-value">${h(item.display ?? `${val}${unit}`)}</span></div>`;
    }).join('');
    return `<section class="panel">${props.title ? `<header class="panel-head"><div><h2>${h(props.title)}</h2>${props.description ? `<p>${h(props.description)}</p>` : ''}</div></header>` : ''}<div class="panel-body">${rows || '<p class="muted">暂无数据</p>'}</div></section>`;
  }
});
// @end: bar-chart

// @component: line-chart
UCD.register('line-chart', {
  render(props, ctx) {
    const h = ctx.escape, values = (props.values || []).map(Number), labels = props.labels || [];
    const w = 520, ht = 160, padX = 12, padY = 14;
    const max = Math.max(1, ...values), min = Math.min(0, ...values), span = Math.max(1, max - min);
    const step = values.length > 1 ? (w - padX * 2) / (values.length - 1) : 0;
    const pts = values.map((v, i) => [+(padX + i * step).toFixed(1), +(ht - padY - ((v - min) / span) * (ht - padY * 2)).toFixed(1)]);
    const line = pts.map(p => p.join(',')).join(' ');
    const area = pts.length ? `${padX},${ht - padY} ${line} ${pts[pts.length - 1][0]},${ht - padY}` : '';
    const gid = `grad-${ctx.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
    const grid = [0.25, 0.5, 0.75, 1].map(r => `<line x1="${padX}" y1="${(ht - padY - r * (ht - padY * 2)).toFixed(1)}" x2="${w - padX}" y2="${(ht - padY - r * (ht - padY * 2)).toFixed(1)}" stroke="var(--border)" stroke-dasharray="3 3"/>`).join('');
    const dots = pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--surface)" stroke="var(--primary)" stroke-width="2"><title>${h(labels[i] ?? '')}: ${h(values[i])}</title></circle>`).join('');
    const summary = props.summary || props.change ? `<div class="chart-summary">${props.summary ? `<strong>${h(props.summary)}</strong>` : ''}${props.change ? `<span class="stat-change ${h(props.trend || '')}">${h(props.change)}</span>` : ''}</div>` : '';
    return `<section class="panel">${props.title ? `<header class="panel-head"><div><h2>${h(props.title)}</h2>${props.description ? `<p>${h(props.description)}</p>` : ''}</div></header>` : ''}<div class="panel-body">${summary}<svg class="line-chart-svg" viewBox="0 0 ${w} ${ht}" role="img" aria-label="${h(props.title || '趋势图')}"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--primary)" stop-opacity="0.22"/><stop offset="100%" stop-color="var(--primary)" stop-opacity="0.01"/></linearGradient></defs>${grid}${area ? `<polygon points="${area}" fill="url(#${gid})"/>` : ''}${line ? `<polyline fill="none" stroke="var(--primary)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="${line}"/>` : ''}${dots}</svg>${labels.length ? `<div class="chart-labels">${labels.map(l => `<span>${h(l)}</span>`).join('')}</div>` : ''}</div></section>`;
  }
});
// @end: line-chart

// @component: timeline
UCD.register('timeline', {
  render(props, ctx) {
    const h = ctx.escape;
    const items = props.items || (props.data ? ctx.data(props.data).map(row => ({
      title: row[props.titleField || 'title'],
      time: row[props.timeField || 'time'],
      description: row[props.descField || 'description'],
      tone: row[props.toneField || 'tone']
    })) : []);
    const list = `<ul class="timeline">${items.map(item => `<li class="${h(item.tone || '')}"><div class="timeline-head"><span class="timeline-title">${h(item.title || '')}</span>${item.time ? `<small>${h(item.time)}</small>` : ''}</div>${item.description ? `<p class="timeline-desc">${h(item.description)}</p>` : ''}</li>`).join('')}</ul>`;
    return props.panel === false ? list : `<section class="panel">${props.title ? `<header class="panel-head"><div><h2>${h(props.title)}</h2>${props.description ? `<p>${h(props.description)}</p>` : ''}</div></header>` : ''}<div class="panel-body">${list || '<p class="muted">暂无动态</p>'}</div></section>`;
  }
});
// @end: timeline

// @component: progress
UCD.register('progress', {
  render(props, ctx) {
    const h = ctx.escape;
    const rows = (props.items || []).map(item => {
      const pct = Math.max(0, Math.min(100, Number(item.value) || 0));
      return `<div class="progress-item"><div class="progress-head"><span>${h(item.label)}</span><small>${h(item.hint || `${pct}%`)}</small></div><div class="progress-track"><div class="progress-fill ${h(item.tone || '')}" style="width:${pct}%"></div></div></div>`;
    }).join('');
    return `<section class="panel">${props.title ? `<header class="panel-head"><div><h2>${h(props.title)}</h2>${props.description ? `<p>${h(props.description)}</p>` : ''}</div></header>` : ''}<div class="panel-body">${rows || '<p class="muted">暂无进度项</p>'}</div></section>`;
  }
});
// @end: progress
