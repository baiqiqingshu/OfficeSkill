/* UCD configuration runtime. Local data, explicit actions, no external dependencies. */
window.UCD = (() => {
  'use strict';
  const definitions = new Map(), states = new Map(), cleanups = new Map();
  let model, currentPage, toastTimer, overlayReturn;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clone = value => JSON.parse(JSON.stringify(value));
  const labels = {create:'新建',edit:'编辑',detail:'详情',delete:'删除',approve:'通过',update:'更新',navigate:'打开',open:'打开',toast:'提示'};
  const normalizeAction = value => typeof value === 'string' ? {type:value,label:labels[value] || value} : {...value,label:value.label || labels[value.type] || '操作'};

  function dispose(root) {
    for (const [element, cleanup] of [...cleanups]) {
      if (element === root || root.contains(element)) {
        if (typeof cleanup === 'function') cleanup();
        cleanups.delete(element);
      }
    }
  }
  function notify(message) {
    const toast = q('#ucd-toast'); toast.textContent = String(message); toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.hidden = true, 3200);
  }
  function mount(node, root, path, extra = {}) {
    if (!node || !definitions.has(node.component)) throw new Error(`未注册组件：${node?.component}`);
    dispose(root);
    const definition = definitions.get(node.component), pending = [];
    const id = `${currentPage}:${node.id || path}${extra.row ? `:row:${String(extra.row[extra.rowKey || 'id'] ?? path)}` : ''}`;
    if (!states.has(id)) states.set(id, {});
    const props = node.props || {};
    const child = (value, scope = {}) => {
      const index = pending.push({value, scope}) - 1;
      return `<div class="ucd-child" data-ucd-child="${index}"></div>`;
    };
    const ctx = {
      ...extra, root, app:model.app, node, id, state:states.get(id), escape, q, qa, notify, normalizeAction,
      data:name => model.data[name] || [],
      asset:name => model.assets[name] || '',
      child:(component, values = {}, scope = {}) => child({component,props:values}, scope),
      slot:(name = 'default', scope = {}) => node.slots?.[name] ? child(node.slots[name], scope) : '',
      refresh:() => mount(node, root, path, extra),
      action:(value, scope = {}) => action(value, {...extra,...scope, node, props}),
      setData:(name, rows) => {if (!(name in model.data)) throw new Error(`数据集不存在：${name}`); model.data[name] = rows; renderPage();},
      open:(value, options = {}) => open(value, options), close:closeOverlay,
      navigate,
      value:(field, value) => {
        const option = field.options?.find(item => typeof item === 'object' && String(item.value) === String(value));
        const label = option ? option.label : value;
        if (field.tones?.[value]) return `<span class="badge ${escape(field.tones[value])}">${escape(label)}</span>`;
        if (field.type === 'checkbox') return value ? '是' : '否';
        return escape(value === '' || value == null ? '—' : label);
      }
    };
    root.className = `ucd-node node-${node.component}`;
    root.innerHTML = definition.render(props, ctx) || '';
    const placeholders = qa('[data-ucd-child]', root);
    for (const [index, item] of pending.entries()) {
      const target = placeholders[index];
      if (!target) continue;
      const children = Array.isArray(item.value) ? item.value : [item.value];
      for (const [position, value] of children.entries()) {
        const element = document.createElement('div'); target.append(element);
        mount(value, element, `${path}/${index}/${position}`, {...extra,...item.scope});
      }
    }
    const cleanup = definition.mount?.(root, props, ctx);
    cleanups.set(root, cleanup);
    return ctx;
  }
  function closeOverlay() { const dialog = q('#ucd-overlay'); if (dialog.open) dialog.close(); }
  function open(node, options = {}) {
    closeOverlay();
    const dialog = q('#ucd-overlay'), body = q('#ucd-overlay-body');
    overlayReturn = document.activeElement;
    dialog.className = options.mode === 'dialog' ? 'modal' : 'drawer';
    q('#ucd-overlay-title').textContent = options.title || node.props?.title || '详情';
    dialog.setAttribute('aria-labelledby', 'ucd-overlay-title');
    mount(node, body, 'overlay', options.context || {});
    dialog.showModal();
    (q('input:not([type=hidden]),select,textarea', body) || q('[data-overlay-close]')).focus();
  }
  function action(value, env = {}) {
    const act = normalizeAction(value), props = env.props || {}, dataName = act.data || props.data;
    const rowKey = props.rowKey || 'id', rows = model.data[dataName] || [];
    const selected = env.rows || (env.row ? [env.row] : []);
    if (act.type === 'navigate') return navigate(act.page);
    if (act.type === 'toast') return notify(act.message || act.label);
    if (act.type === 'open') {
      const node = model.pages[currentPage].views?.[act.target];
      if (!node) throw new Error(`找不到视图：${act.target}`);
      return open(node, {title:act.label, mode:act.mode, context:{row:env.row}});
    }
    if (!dataName || !(dataName in model.data)) return notify('请为此操作配置数据集');
    if (act.type === 'create' || act.type === 'edit') {
      const original = act.type === 'edit' ? env.row : null;
      if (act.type === 'edit' && !original) return;
      const fields = props.formFields || props.fields || [];
      const node = {component:'form', props:{fields,record:original || {},submitLabel:'保存'}, slots:{after:env.node?.slots?.form || []}};
      return open(node, {title:act.type === 'create' ? act.label : `编辑${props.title || '记录'}`, mode:act.mode,
        context:{row:original,rowKey,onSubmit:values => {
          const record = {...original,...values};
          if (!original) record[rowKey] = globalThis.crypto?.randomUUID?.() || `record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          model.data[dataName] = original ? model.data[dataName].map(row => row[rowKey] === original[rowKey] ? record : row) : [record,...model.data[dataName]];
          closeOverlay(); renderPage(); notify('已保存');
        }} });
    }
    if (act.type === 'detail') return open({component:'detail',props:{fields:props.fields || [],record:env.row || {}},slots:{after:env.node?.slots?.detail || []}}, {title:env.row?.[props.titleField || 'title'] || '记录详情',mode:act.mode,context:{row:env.row,rowKey}});
    if (!selected.length) return notify('请先选择记录');
    const ids = new Set(selected.map(row => row[rowKey]));
    if (act.type === 'delete') {
      if (!window.confirm(act.confirm || `确认删除选中的 ${selected.length} 条记录？`)) return;
      model.data[dataName] = rows.filter(row => !ids.has(row[rowKey]));
    } else if (act.type === 'update' || act.type === 'approve') {
      if (act.confirm && !window.confirm(act.confirm)) return;
      const values = act.values || {[props.statusField || 'status']:'已通过'};
      model.data[dataName] = rows.map(row => ids.has(row[rowKey]) ? {...row,...values} : row);
    } else return notify(`尚未实现的操作：${act.type}`);
    renderPage(); notify(act.message || '已更新记录');
  }
  function renderPage() {
    const page = model.pages[currentPage], root = q('#ucd-content');
    dispose(root); root.innerHTML = '';
    q('#ucd-page-title').textContent = page.title;
    q('#ucd-page-description').textContent = page.description || '';
    q('#ucd-breadcrumb').textContent = page.title;
    qa('[data-page]').forEach(button => {const active = button.dataset.page === currentPage; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');});
    try {
      page.content.forEach((node, i) => {const element = document.createElement('div');root.append(element);mount(node,element,`content/${i}`);});
    } catch (error) {
      const message = document.createElement('p');message.className = 'alert danger';message.textContent = `页面配置错误：${error.message}`;root.append(message);
      throw error;
    }
  }
  function navigate(id) {
    if (!(id in model.pages)) return notify('目标页面不存在');
    closeOverlay(); currentPage = id;
    if (location.hash !== `#/${id}`) location.hash = `/${id}`;
    renderPage();
  }
  function boot(config) {
    model = clone(config);
    document.body.className = `${model.app.density || 'compact'} shell-${model.app.shell || 'sidebar'}`;
    q('#ucd-app').innerHTML = `<a class="skip" href="#ucd-main">跳转到主要内容</a><div class="project-app"><aside class="project-sidebar"><div class="project-brand"><span class="brand-mark">U</span><strong>${escape(model.app.title)}</strong></div><p class="workspace-label">${escape(model.app.workspace || '工作空间')}</p><nav aria-label="主导航">${Object.entries(model.pages).map(([id,page])=>`<button type="button" data-page="${escape(id)}"><span class="nav-icon" aria-hidden="true">${escape(page.title.slice(0,1))}</span>${escape(page.title)}</button>`).join('')}</nav><div class="sidebar-user"><span class="user-avatar">${escape((model.app.user || '用').slice(0,1))}</span><div><strong>${escape(model.app.user || '当前用户')}</strong><small>工作空间成员</small></div></div></aside><div class="project-workspace"><header class="project-topbar"><span>${escape(model.app.title)}<span class="breadcrumb-separator">/</span><strong id="ucd-breadcrumb"></strong></span><span class="local-indicator"><i></i>本地演示</span></header><main id="ucd-main" tabindex="-1"><div class="page-heading"><div><p class="eyebrow">${escape(model.app.workspace || '工作空间')}</p><h1 id="ucd-page-title"></h1><p id="ucd-page-description"></p></div></div><div id="ucd-content"></div><footer class="page-footnote">示例数据仅在当前页面会话中保留</footer></main></div></div>`;
    qa('[data-page]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
    q('[data-overlay-close]').addEventListener('click', closeOverlay);
    q('#ucd-overlay').addEventListener('close', () => {if (!q('#ucd-overlay').open) {dispose(q('#ucd-overlay-body')); if (overlayReturn?.isConnected) overlayReturn.focus();}});
    window.addEventListener('hashchange', () => {const id = location.hash.slice(2); if (id in model.pages && id !== currentPage) navigate(id);});
    navigate(model.pages[location.hash.slice(2)] ? location.hash.slice(2) : model.app.startPage || Object.keys(model.pages)[0]);
  }
  return {register(name, definition) {
    if (definitions.has(name)) throw new Error(`组件重复注册：${name}`);
    if (typeof definition.render !== 'function') throw new Error(`组件缺少 render：${name}`);
    definitions.set(name, definition);
    if (definition.css) {const style = document.createElement('style');style.textContent = definition.css;document.head.append(style);}
  }, boot, navigate, notify};
})();
