UCD.register('table', {
  render(props, ctx) {
    const h = ctx.escape, state = ctx.state, fields = props.fields || [], rowKey = props.rowKey || 'id';
    state.filters ||= {};state.selected ||= [];state.page ||= 0;
    const all = ctx.data(props.data), byKey = Object.fromEntries(fields.map(field=>[field.key,field]));
    const columns = props.columns || fields.filter(field=>!field.hidden && field.type !== 'textarea').map(field=>field.key);
    const rows = all.filter(row=>Object.entries(state.filters).every(([key,value])=>!value || (byKey[key]?.type === 'select' ? String(row[key]) === value : String(row[key] ?? '').toLocaleLowerCase().includes(value.toLocaleLowerCase()))));
    if (state.sort) rows.sort((a,b)=>String(a[state.sort] ?? '').localeCompare(String(b[state.sort] ?? ''),'zh-CN',{numeric:true}) * (state.direction || 1));
    const size = props.pageSize || 8, pages = Math.max(1,Math.ceil(rows.length/size));
    state.page = Math.min(state.page,pages-1);state.selected = state.selected.filter(id=>all.some(row=>String(row[rowKey]) === id));
    const shown = rows.slice(state.page*size,(state.page+1)*size);state.shown = shown;
    const batch = props.batchActions || [], actions = props.actions || ['create'], rowActions = props.rowActions || ['detail','edit','delete'];
    const button = (value, index, attr, extra = '') => {const action = ctx.normalizeAction(value);return `<button type="button" class="${attr === 'data-row-action' ? 'btn-link' : `btn${action.primary ? ' btn-primary' : ''}`}" ${attr}="${index}" ${extra}>${h(action.label)}</button>`;};
    return `${ctx.slot('before')}<section class="panel table-panel"><header class="panel-head"><div><h2>${h(props.title || '记录列表')}</h2><p>${h(props.description || '查看记录并处理相关事项')}</p></div><div class="toolbar-actions">${ctx.slot('toolbar')}${actions.map((a,i)=>button(a,i,'data-table-action')).join('')}</div></header>
      ${(props.filters || []).length ? `<div class="filter-bar">${props.filters.map(key=>ctx.child('field',{field:{...byKey[key],required:false,default:'',type:byKey[key].type === 'select' ? 'select' : 'search'},value:state.filters[key] || '',filter:true})).join('')}<button type="button" class="btn" data-reset>重置</button></div>` : ''}
      ${batch.length ? `<div class="selection-bar"><span>已选择 <strong>${state.selected.length}</strong> 项</span>${batch.map((a,i)=>button(a,i,'data-batch-action',state.selected.length ? '' : 'disabled')).join('')}</div>` : ''}
      <div class="table-scroll"><table class="data-table"><caption class="visually-hidden">${h(props.title || '记录列表')}</caption><thead><tr>${batch.length ? `<th class="selection-cell"><input type="checkbox" data-select-all aria-label="选择本页全部记录"${shown.length && shown.every(row=>state.selected.includes(String(row[rowKey]))) ? ' checked' : ''}></th>` : ''}${columns.map(key=>`<th scope="col"${state.sort === key ? ` aria-sort="${state.direction === -1 ? 'descending' : 'ascending'}"` : ''}><button type="button" class="sort-button" data-sort="${h(key)}">${h(byKey[key]?.label || key)}<span aria-hidden="true">${state.sort === key ? (state.direction === -1 ? '↓' : '↑') : '↕'}</span></button></th>`).join('')}${rowActions.length ? '<th scope="col" class="row-actions">操作</th>' : ''}</tr></thead><tbody>${shown.map((row,index)=>`<tr data-row="${index}" tabindex="0" aria-label="${h(row[props.titleField || columns[0]] || '记录')}">${batch.length ? `<td class="selection-cell"><input type="checkbox" data-select="${index}" aria-label="选择${h(row[columns[0]])}"${state.selected.includes(String(row[rowKey])) ? ' checked' : ''}></td>` : ''}${columns.map(key=>`<td>${ctx.node.slots?.[`cell:${key}`] ? ctx.slot(`cell:${key}`,{row,valueData:row[key],field:byKey[key]}) : ctx.value(byKey[key] || {},row[key])}</td>`).join('')}${rowActions.length ? `<td class="row-actions">${rowActions.map((a,i)=>{const act = ctx.normalizeAction(a);return !act.when || row[act.when.field] === act.when.equals ? button(a,i,'data-row-action',`data-index="${index}"`) : '';}).join('')}</td>` : ''}</tr>`).join('')}</tbody></table>${!shown.length ? '<div class="empty-state"><strong>暂无匹配记录</strong><p>调整筛选条件，或新建一条记录。</p></div>' : ''}</div>
      <footer class="table-footer"><span role="status">共 ${rows.length} 条记录${rows.length ? ` · ${state.page*size+1}–${Math.min((state.page+1)*size,rows.length)}` : ''}</span><div class="pagination"><button type="button" class="btn btn-small" data-prev${state.page === 0 ? ' disabled' : ''}>上一页</button><span>${state.page+1} / ${pages}</span><button type="button" class="btn btn-small" data-next${state.page >= pages-1 ? ' disabled' : ''}>下一页</button></div></footer></section>${ctx.slot('after')}`;
  },
  mount(root, props, ctx) {
    const state = ctx.state, rowKey = props.rowKey || 'id', shown = state.shown;
    const refresh = () => {
      const active = document.activeElement, key = active?.dataset?.fieldKey, start = active?.selectionStart, end = active?.selectionEnd;
      ctx.refresh();
      if (key) {const input = [...root.querySelectorAll('[data-field-key]')].find(el=>el.dataset.fieldKey === key);input?.focus();if (start != null && input?.type === 'search') input.setSelectionRange(start,end);}
    };
    root.querySelectorAll('.filter-bar [data-field-key]').forEach(input=>input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input',()=>{state.filters[input.dataset.fieldKey] = input.value;state.page = 0;refresh();}));
    root.querySelector('[data-reset]')?.addEventListener('click',()=>{state.filters = {};state.page = 0;ctx.refresh();});
    root.querySelectorAll('[data-sort]').forEach(button=>button.addEventListener('click',()=>{state.direction = state.sort === button.dataset.sort ? -state.direction : 1;state.sort = button.dataset.sort;ctx.refresh();}));
    root.querySelector('[data-prev]').addEventListener('click',()=>{state.page--;ctx.refresh();});
    root.querySelector('[data-next]').addEventListener('click',()=>{state.page++;ctx.refresh();});
    root.querySelectorAll('[data-select]').forEach(input=>input.addEventListener('change',()=>{const key = String(shown[Number(input.dataset.select)][rowKey]);state.selected = input.checked ? [...new Set([...state.selected,key])] : state.selected.filter(id=>id !== key);ctx.refresh();}));
    root.querySelector('[data-select-all]')?.addEventListener('change',event=>{const keys = shown.map(row=>String(row[rowKey]));state.selected = event.target.checked ? [...new Set([...state.selected,...keys])] : state.selected.filter(id=>!keys.includes(id));ctx.refresh();});
    root.querySelectorAll('[data-table-action]').forEach(button=>button.addEventListener('click',()=>ctx.action((props.actions || ['create'])[Number(button.dataset.tableAction)])));
    root.querySelectorAll('[data-row-action]').forEach(button=>button.addEventListener('click',()=>ctx.action((props.rowActions || ['detail','edit','delete'])[Number(button.dataset.rowAction)],{row:shown[Number(button.dataset.index)]})));
    root.querySelectorAll('[data-batch-action]').forEach(button=>button.addEventListener('click',()=>ctx.action(props.batchActions[Number(button.dataset.batchAction)],{rows:ctx.data(props.data).filter(row=>state.selected.includes(String(row[rowKey])))})));
    root.querySelectorAll('[data-row]').forEach(row=>{
      const open = () => ctx.action('detail',{row:shown[Number(row.dataset.row)]});
      row.addEventListener('click',event=>{if (!event.target.closest('button,input,a,select,textarea')) open();});
      row.addEventListener('keydown',event=>{if (event.key === 'Enter' && event.target === row) {event.preventDefault();open();}});
    });
  }
});
