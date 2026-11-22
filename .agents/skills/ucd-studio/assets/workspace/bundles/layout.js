// @component: panel
UCD.register('panel', {
  render(props, ctx) {
    const columns = Math.max(1, Math.min(4, Number(props.columns) || 1));
    return `<section class="panel">${props.title ? `<header class="panel-head"><div><h2>${ctx.escape(props.title)}</h2>${props.description ? `<p>${ctx.escape(props.description)}</p>` : ''}</div><div class="toolbar-actions">${ctx.slot('actions')}</div></header>` : ''}<div class="panel-body slot-columns columns-${columns}">${ctx.slot()}</div></section>`;
  }
});
// @end: panel

// @component: split
UCD.register('split', {
  render(props, ctx) {
    const slots = ctx.node.slots || {};
    const names = Object.keys(slots);
    let template = '';
    if (typeof props.columns === 'string' && /^[0-9a-zA-Z.%(),\s-]+$/.test(props.columns)) {
      template = props.columns;
    } else if (Array.isArray(props.columns) && props.columns.length) {
      template = props.columns.map(col => typeof col === 'number' ? `minmax(0, ${col}fr)` : /^[0-9]+(px|%|fr|rem)$/.test(String(col)) ? String(col) : 'minmax(0, 1fr)').join(' ');
    } else {
      template = `repeat(${Math.max(1, names.length)}, minmax(0, 1fr))`;
    }
    return `<div class="split-grid" style="grid-template-columns:${ctx.escape(template)}">${names.map(name => `<div class="split-pane">${ctx.slot(name)}</div>`).join('')}</div>`;
  }
});
// @end: split

// @component: tabs
UCD.register('tabs', {
  render(props, ctx) {
    const items = props.items || [];
    if (!items.some(item => item.key === ctx.state.active)) ctx.state.active = items[0]?.key;
    const prefix = ctx.id.replace(/[^a-zA-Z0-9-]/g, '-');
    return `<section class="tabs-shell"><div class="tab-list" role="tablist">${items.map((item, i) => `<button type="button" role="tab" id="${prefix}-tab-${i}" aria-controls="${prefix}-panel-${i}" aria-selected="${item.key === ctx.state.active}" tabindex="${item.key === ctx.state.active ? 0 : -1}" data-tab="${ctx.escape(item.key)}">${ctx.escape(item.label)}</button>`).join('')}</div>${items.map((item, i) => `<div class="tab-panel" role="tabpanel" id="${prefix}-panel-${i}" aria-labelledby="${prefix}-tab-${i}"${item.key === ctx.state.active ? '' : ' hidden'}>${ctx.slot(item.key)}</div>`).join('')}</section>`;
  },
  mount(root, props, ctx) {
    const tabs = [...root.querySelectorAll('[data-tab]')];
    const select = (key, focus) => {
      ctx.state.active = key;
      ctx.refresh();
      if (focus) [...root.querySelectorAll('[data-tab]')].find(tab => tab.dataset.tab === key)?.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab.dataset.tab, false));
      tab.addEventListener('keydown', event => {
        const index = {ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1}[event.key];
        if (index != null) { event.preventDefault(); select(tabs[index].dataset.tab, true); }
      });
    });
  }
});
// @end: tabs

// @component: steps
UCD.register('steps', {
  render(props, ctx) {
    const h = ctx.escape, current = Number(props.current) || 0;
    const items = (props.items || []).map(item => typeof item === 'object' ? item : {title: item});
    const list = `<ol class="steps">${items.map((item, idx) => {
      const done = idx < current, active = idx === current;
      const badge = done ? ctx.icon('check') : String(idx + 1);
      return `<li class="${done ? 'done' : ''}"${active ? ' aria-current="step"' : ''}><span class="step-number">${badge}</span><div><span>${h(item.title)}</span>${item.description ? `<span class="step-meta">${h(item.description)}</span>` : ''}</div></li>`;
    }).join('')}</ol>`;
    return props.panel === false ? list : `<section class="panel">${props.title ? `<header class="panel-head"><div><h2>${h(props.title)}</h2>${props.description ? `<p>${h(props.description)}</p>` : ''}</div></header>` : ''}<div class="panel-body">${list}</div></section>`;
  }
});
// @end: steps

// @component: cards
UCD.register('cards', {
  render(props, ctx) {
    const h = ctx.escape, items = props.items || [];
    const grid = `<div class="cards-grid">${items.map((item, idx) => {
      const act = item.action ? ctx.normalizeAction(item.action) : null;
      return `<article class="feature-card"><div class="feature-card-head"><span class="feature-card-icon">${ctx.icon(item.icon || 'layers')}</span>${item.badge ? `<span class="badge ${h(item.tone || 'primary')}">${h(item.badge)}</span>` : ''}</div><h3>${h(item.title)}</h3>${item.description ? `<p>${h(item.description)}</p>` : ''}${act ? `<div class="feature-card-foot"><button type="button" class="btn btn-small" data-card-action="${idx}">${h(item.actionLabel || act.label)}</button></div>` : ''}</article>`;
    }).join('')}</div>`;
    return props.title ? `<section class="panel"><header class="panel-head"><div><h2>${h(props.title)}</h2>${props.description ? `<p>${h(props.description)}</p>` : ''}</div></header><div class="panel-body">${grid}</div></section>` : grid;
  },
  mount(root, props, ctx) {
    root.querySelectorAll('[data-card-action]').forEach(btn => btn.addEventListener('click', () => {
      const item = (props.items || [])[Number(btn.dataset.cardAction)];
      if (item?.action) ctx.action(item.action);
    }));
  }
});
// @end: cards
