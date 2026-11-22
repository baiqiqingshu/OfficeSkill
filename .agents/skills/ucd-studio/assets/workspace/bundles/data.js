// @component: table
UCD.register('table', {
  render(props, ctx) {
    const h = ctx.escape, state = ctx.state, fields = props.fields || [], rowKey = props.rowKey || 'id';
    state.filters ||= {}; state.selected ||= []; state.page ||= 0;
    const all = ctx.data(props.data), byKey = Object.fromEntries(fields.map(field => [field.key, field]));
    const columns = props.columns || fields.filter(field => !field.hidden && field.type !== 'textarea').map(field => field.key);
    const rows = all.filter(row => Object.entries(state.filters).every(([key, value]) => {
      if (value === '' || value == null) return true;
      const f = byKey[key];
      if (f?.type === 'select' || f?.type === 'radio' || !props.filters?.includes(key)) {
        return String(row[key] ?? '') === String(value);
      }
      return String(row[key] ?? '').toLocaleLowerCase().includes(String(value).toLocaleLowerCase());
    }));
    if (state.sort) rows.sort((a, b) => String(a[state.sort] ?? '').localeCompare(String(b[state.sort] ?? ''), 'zh-CN', {numeric: true}) * (state.direction || 1));
    const size = props.pageSize || 8, pages = Math.max(1, Math.ceil(rows.length / size));
    state.page = Math.min(state.page, pages - 1);
    state.selected = state.selected.filter(id => all.some(row => String(row[rowKey]) === id));
    const shown = rows.slice(state.page * size, (state.page + 1) * size);
    state.shown = shown;
    const batch = props.batchActions || [], actions = props.actions ?? ['create'], rowActions = props.rowActions ?? ['detail', 'edit', 'delete'];
    const hasFilter = Object.values(state.filters).some(v => v !== '' && v != null);
    const button = (value, index, attr, extra = '') => {
      const action = ctx.normalizeAction(value);
      if (attr === 'data-row-action') {
        const cls = action.type === 'delete' || action.danger ? 'btn-link danger' : 'btn-link';
        return `<button type="button" class="${cls}" ${attr}="${index}" ${extra}>${h(action.label)}</button>`;
      }
      const cls = `btn${action.primary ? ' btn-primary' : ''}${action.danger ? ' btn-danger' : ''}`;
      const lead = action.type === 'create' ? ctx.icon('plus') : '';
      return `<button type="button" class="${cls}" ${attr}="${index}" ${extra}>${lead}${h(action.label)}</button>`;
    };
    const colAlign = key => {
      const f = byKey[key];
      if (f?.align === 'right' || f?.type === 'number') return ' align-right';
      if (f?.align === 'center') return ' align-center';
      return '';
    };
    const colStyle = key => byKey[key]?.width ? ` style="width:${h(byKey[key].width)}"` : '';
    return `${ctx.slot('before')}<section class="panel table-panel"><header class="panel-head"><div><h2>${h(props.title || '记录列表')}</h2>${props.description ? `<p>${h(props.description)}</p>` : ''}</div><div class="toolbar-actions">${ctx.slot('toolbar')}${actions.map((a, i) => button(a, i, 'data-table-action')).join('')}</div></header>
      ${(props.filters || []).length ? `<div class="filter-bar">${props.filters.map(key => ctx.child('field', {field: {...byKey[key], required: false, default: '', type: byKey[key].type === 'select' ? 'select' : 'search'}, value: state.filters[key] || '', filter: true})).join('')}<button type="button" class="btn" data-reset${hasFilter ? '' : ' disabled'}>重置</button></div>` : ''}
      ${batch.length && state.selected.length ? `<div class="selection-bar"><span>已选择 <strong>${state.selected.length}</strong> 项</span>${batch.map((a, i) => button(a, i, 'data-batch-action')).join('')}<button type="button" class="btn-ghost selection-clear" data-clear-selection>取消选择</button></div>` : ''}
      <div class="table-scroll"><table class="data-table"><caption class="visually-hidden">${h(props.title || '记录列表')}</caption><thead><tr>${batch.length ? `<th class="selection-cell"><input type="checkbox" data-select-all aria-label="选择本页全部记录"${shown.length && shown.every(row => state.selected.includes(String(row[rowKey]))) ? ' checked' : ''}></th>` : ''}${columns.map(key => {
        const sortIcon = state.sort === key ? (state.direction === -1 ? 'sort-desc' : 'sort-asc') : 'sort';
        return `<th scope="col" class="${colAlign(key).trim()}"${colStyle(key)}${state.sort === key ? ` aria-sort="${state.direction === -1 ? 'descending' : 'ascending'}"` : ''}><button type="button" class="sort-button" data-sort="${h(key)}">${h(byKey[key]?.label || key)}${ctx.icon(sortIcon)}</button></th>`;
      }).join('')}${rowActions.length ? '<th scope="col" class="row-actions">操作</th>' : ''}</tr></thead><tbody>${shown.map((row, index) => {
        const isSel = state.selected.includes(String(row[rowKey]));
        return `<tr data-row="${index}" tabindex="0" class="${isSel ? 'is-selected' : ''}" aria-label="${h(row[props.titleField || columns[0]] || '记录')}">${batch.length ? `<td class="selection-cell"><input type="checkbox" data-select="${index}" aria-label="选择${h(row[columns[0]])}"${isSel ? ' checked' : ''}></td>` : ''}${columns.map((key, ci) => `<td class="${ci === 0 ? 'primary-col' : ''}${colAlign(key)}">${ctx.node.slots?.[`cell:${key}`] ? ctx.slot(`cell:${key}`, {row, valueData: row[key], field: byKey[key]}) : ctx.value(byKey[key] || {}, row[key])}</td>`).join('')}${rowActions.length ? `<td class="row-actions">${rowActions.map((a, i) => {
          const act = ctx.normalizeAction(a);
          return !act.when || row[act.when.field] === act.when.equals ? button(a, i, 'data-row-action', `data-index="${index}"`) : '';
        }).join('')}</td>` : ''}</tr>`;
      }).join('')}</tbody></table>${!shown.length ? '<div class="empty-state"><strong>暂无匹配记录</strong><p>尝试调整筛选条件，或新建一条记录。</p></div>' : ''}</div>
      <footer class="table-footer"><span role="status">共 ${rows.length} 条记录${rows.length ? ` · 第 ${state.page * size + 1}–${Math.min((state.page + 1) * size, rows.length)} 条` : ''}</span><div class="pagination"><button type="button" class="btn btn-small" data-prev${state.page === 0 ? ' disabled' : ''}>上一页</button><span class="pagination-info">${state.page + 1} / ${pages}</span><button type="button" class="btn btn-small" data-next${state.page >= pages - 1 ? ' disabled' : ''}>下一页</button></div></footer></section>${ctx.slot('after')}`;
  },
  mount(root, props, ctx) {
    const state = ctx.state, rowKey = props.rowKey || 'id', shown = state.shown;
    const refresh = () => {
      const active = document.activeElement, key = active?.dataset?.fieldKey, start = active?.selectionStart, end = active?.selectionEnd;
      ctx.refresh();
      if (key) {
        const input = [...root.querySelectorAll('[data-field-key]')].find(el => el.dataset.fieldKey === key);
        input?.focus();
        if (start != null && input?.type === 'search') input.setSelectionRange(start, end);
      }
    };
    root.querySelectorAll('.filter-bar [data-field-key]').forEach(input => input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
      state.filters[input.dataset.fieldKey] = input.value;
      state.page = 0;
      refresh();
    }));
    root.querySelector('[data-reset]')?.addEventListener('click', () => { state.filters = {}; state.page = 0; ctx.refresh(); });
    root.querySelector('[data-clear-selection]')?.addEventListener('click', () => { state.selected = []; ctx.refresh(); });
    root.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', () => {
      state.direction = state.sort === button.dataset.sort ? -state.direction : 1;
      state.sort = button.dataset.sort;
      ctx.refresh();
    }));
    root.querySelector('[data-prev]')?.addEventListener('click', () => { state.page--; ctx.refresh(); });
    root.querySelector('[data-next]')?.addEventListener('click', () => { state.page++; ctx.refresh(); });
    root.querySelectorAll('[data-select]').forEach(input => input.addEventListener('change', () => {
      const key = String(shown[Number(input.dataset.select)][rowKey]);
      state.selected = input.checked ? [...new Set([...state.selected, key])] : state.selected.filter(id => id !== key);
      ctx.refresh();
    }));
    root.querySelector('[data-select-all]')?.addEventListener('change', event => {
      const keys = shown.map(row => String(row[rowKey]));
      state.selected = event.target.checked ? [...new Set([...state.selected, ...keys])] : state.selected.filter(id => !keys.includes(id));
      ctx.refresh();
    });
    root.querySelectorAll('[data-table-action]').forEach(button => button.addEventListener('click', () => ctx.action((props.actions ?? ['create'])[Number(button.dataset.tableAction)])));
    root.querySelectorAll('[data-row-action]').forEach(button => button.addEventListener('click', () => ctx.action((props.rowActions ?? ['detail', 'edit', 'delete'])[Number(button.dataset.rowAction)], {row: shown[Number(button.dataset.index)]})));
    root.querySelectorAll('[data-batch-action]').forEach(button => button.addEventListener('click', () => ctx.action(props.batchActions[Number(button.dataset.batchAction)], {rows: ctx.data(props.data).filter(row => state.selected.includes(String(row[rowKey])))})));
    root.querySelectorAll('[data-row]').forEach(row => {
      const open = () => ctx.action('detail', {row: shown[Number(row.dataset.row)]});
      row.addEventListener('click', event => { if (!event.target.closest('button,input,a,select,textarea')) open(); });
      row.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target === row) { event.preventDefault(); open(); } });
    });
  }
});
// @end: table

// @component: stats
UCD.register('stats', {
  render(props, ctx) {
    const h = ctx.escape;
    return `<div class="stats-grid">${(props.items || []).map((item, idx) => {
      const value = item.data ? ctx.data(item.data).filter(row => !item.field || row[item.field] === item.equals).length : item.value;
      const marker = item.icon ? `<span class="stat-icon-box">${ctx.icon(item.icon)}</span>` : '<span class="stat-dot"></span>';
      const change = item.change ? `<span class="stat-change ${h(item.trend || '')}">${h(item.change)}</span>` : '';
      const clickable = item.action ? ` clickable" data-stat-action="${idx}" tabindex="0" role="button` : '';
      return `<article class="stat-card ${h(item.tone || '')}${clickable}"><div class="stat-head"><span class="stat-label">${h(item.label)}</span>${marker}</div><strong>${h(value)}</strong><div class="stat-foot">${change}${item.hint ? `<span>${h(item.hint)}</span>` : ''}</div></article>`;
    }).join('')}</div>`;
  },
  mount(root, props, ctx) {
    root.querySelectorAll('[data-stat-action]').forEach(card => {
      const run = () => {
        const item = (props.items || [])[Number(card.dataset.statAction)];
        if (item?.action) ctx.action(item.action);
      };
      card.addEventListener('click', run);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); } });
    });
  }
});
// @end: stats

// @component: tree
UCD.register('tree', {
  render(props, ctx) {
    const h = ctx.escape, state = ctx.state;
    state.expanded ||= {}; state.query ||= '';
    const active = state.selected ?? '';
    const q = state.query.trim().toLocaleLowerCase();
    const matches = item => {
      if (!q) return true;
      if (String(item.label).toLocaleLowerCase().includes(q)) return true;
      return (item.children || []).some(matches);
    };
    const renderNodes = items => `<ul class="tree-children">${items.filter(matches).map(item => {
      const hasKids = Array.isArray(item.children) && item.children.length > 0;
      const open = q ? true : (state.expanded[item.id] ?? item.expanded !== false);
      const val = props.matchValue === 'id' ? item.id : item.label;
      return `<li><div class="tree-row"><button type="button" class="tree-toggle${hasKids ? '' : ' leaf'}" data-toggle="${h(item.id)}" aria-expanded="${open}" aria-label="展开或折叠">${ctx.icon('chevron-right')}</button><button type="button" class="tree-btn${active === val ? ' active' : ''}" data-select="${h(val)}">${ctx.icon(item.icon || (hasKids ? 'folder' : 'tag'))}<span class="tree-label">${h(item.label)}</span>${item.count != null ? `<span class="tree-count">${h(item.count)}</span>` : ''}</button></div>${hasKids && open ? renderNodes(item.children) : ''}</li>`;
    }).join('')}</ul>`;
    const topNodes = (props.items || []).filter(matches).map(item => {
      const hasKids = Array.isArray(item.children) && item.children.length > 0;
      const open = q ? true : (state.expanded[item.id] ?? item.expanded !== false);
      const val = props.matchValue === 'id' ? item.id : item.label;
      return `<li><div class="tree-row"><button type="button" class="tree-toggle${hasKids ? '' : ' leaf'}" data-toggle="${h(item.id)}" aria-expanded="${open}" aria-label="展开或折叠">${ctx.icon('chevron-right')}</button><button type="button" class="tree-btn${active === val ? ' active' : ''}" data-select="${h(val)}">${ctx.icon(item.icon || (hasKids ? 'folder' : 'tag'))}<span class="tree-label">${h(item.label)}</span>${item.count != null ? `<span class="tree-count">${h(item.count)}</span>` : ''}</button></div>${hasKids && open ? renderNodes(item.children) : ''}</li>`;
    }).join('');
    return `<section class="panel tree-panel">${props.title ? `<header class="panel-head"><div><h2>${h(props.title)}</h2>${props.description ? `<p>${h(props.description)}</p>` : ''}</div></header>` : ''}
      ${props.searchable !== false ? `<div class="tree-search"><span class="input-wrap">${ctx.icon('search', 'input-icon')}<input type="search" data-tree-search value="${h(state.query)}" placeholder="搜索分类或节点"></span></div>` : ''}
      <ul class="tree-list">${props.allLabel !== false ? `<li><div class="tree-row"><span class="tree-toggle leaf"></span><button type="button" class="tree-btn${active === '' ? ' active' : ''}" data-select="">${ctx.icon('layers')}<span class="tree-label">${h(props.allLabel || '全部')}</span></button></div></li>` : ''}${topNodes}</ul></section>`;
  },
  mount(root, props, ctx) {
    const state = ctx.state;
    root.querySelector('[data-tree-search]')?.addEventListener('input', event => {
      const pos = event.target.selectionStart;
      state.query = event.target.value;
      ctx.refresh();
      const el = root.querySelector('[data-tree-search]');
      el?.focus();
      if (pos != null) el?.setSelectionRange(pos, pos);
    });
    root.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.toggle;
      state.expanded[id] = btn.getAttribute('aria-expanded') !== 'true';
      ctx.refresh();
    }));
    root.querySelectorAll('[data-select]').forEach(btn => btn.addEventListener('click', () => {
      state.selected = btn.dataset.select;
      if (props.target && props.filterField) {
        ctx.setFilter(props.target, {[props.filterField]: state.selected});
      } else {
        ctx.refresh();
      }
    }));
  }
});
// @end: tree

// @component: kanban
UCD.register('kanban', {
  render(props, ctx) {
    const h = ctx.escape, rows = props.data ? ctx.data(props.data) : [];
    const groupField = props.groupField || 'status', rowKey = props.rowKey || 'id';
    const titleField = props.titleField || 'title', metaFields = props.metaFields || [];
    const columns = (props.columns || []).map(c => typeof c === 'object' ? c : {value: c, label: c});
    const board = `<div class="kanban">${columns.map(col => {
      const items = rows.filter(r => String(r[groupField]) === String(col.value));
      return `<div class="kanban-column"><div class="kanban-head"><h3>${h(col.label)}</h3><span class="badge ${h(col.tone || 'neutral')}">${items.length}</span></div>${items.map(row => {
        const tag = props.tagField && row[props.tagField] ? `<span class="badge primary">${h(row[props.tagField])}</span>` : '';
        const meta = metaFields.map(k => row[k]).filter(Boolean).map(v => `<span>${h(v)}</span>`).join('');
        return `<article class="kanban-card">${tag}<div class="kanban-card-title">${h(row[titleField] || '')}</div>${meta ? `<div class="kanban-card-meta">${meta}</div>` : ''}<div class="kanban-card-move"><span class="select-wrap"><select data-move-id="${h(row[rowKey])}" aria-label="移动阶段">${columns.map(opt => `<option value="${h(opt.value)}"${String(opt.value) === String(row[groupField]) ? ' selected' : ''}>${h(opt.label)}</option>`).join('')}</select>${ctx.icon('chevron-down', 'select-chevron')}</span></div></article>`;
      }).join('')}</div>`;
    }).join('')}</div>`;
    return `<section class="panel">${props.title ? `<header class="panel-head"><div><h2>${h(props.title)}</h2>${props.description ? `<p>${h(props.description)}</p>` : ''}</div></header>` : ''}<div class="panel-body">${board}</div></section>`;
  },
  mount(root, props, ctx) {
    const groupField = props.groupField || 'status', rowKey = props.rowKey || 'id';
    root.querySelectorAll('[data-move-id]').forEach(select => select.addEventListener('change', () => {
      const id = select.dataset.moveId, next = select.value;
      const rows = ctx.data(props.data).map(row => String(row[rowKey]) === id ? {...row, [groupField]: next} : row);
      ctx.setData(props.data, rows);
      ctx.notify(`已移动至「${next}」`);
    }));
  }
});
// @end: kanban

// @component: empty
UCD.register('empty', {
  render(props, ctx) {
    const h = ctx.escape, act = props.action ? ctx.normalizeAction(props.action) : null;
    return `<section class="panel"><div class="empty-box"><div class="empty-icon">${ctx.icon(props.icon || 'inbox')}</div><h3>${h(props.title || '暂无内容')}</h3><p>${h(props.text || '当前暂无可展示的数据或记录。')}</p>${act ? `<button type="button" class="btn btn-primary" data-empty-action>${h(act.label)}</button>` : ''}</div></section>`;
  },
  mount(root, props, ctx) {
    root.querySelector('[data-empty-action]')?.addEventListener('click', () => props.action && ctx.action(props.action));
  }
});
// @end: empty
