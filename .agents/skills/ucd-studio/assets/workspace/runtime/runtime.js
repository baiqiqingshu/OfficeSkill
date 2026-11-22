/* UCD Studio configuration runtime v1.1.0 — offline vanilla JS, no external dependencies. */
window.UCD = (() => {
  'use strict';
  const definitions = new Map(), states = new Map(), cleanups = new Map(), pageStates = new Map();
  let model, currentPage, toastTimer, overlayReturn, confirmResolver = null, confirmReturn = null;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clone = value => JSON.parse(JSON.stringify(value));
  const labels = {create:'新建',edit:'编辑',detail:'详情',delete:'删除',approve:'通过',update:'更新',navigate:'打开',open:'打开',toast:'提示',filter:'筛选'};
  const normalizeAction = value => typeof value === 'string' ? {type:value,label:labels[value] || value} : {...value,label:value.label || labels[value.type] || '操作'};

  /* Built-in crisp inline SVG icon library (stroke 1.6, currentColor) */
  const ICONS = {
    brand: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
    form: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.66 0-1.25.4-1.51 1z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    tree: '<path d="M4 5h6v4H4zM14 5h6v4h-6zM14 15h6v4h-6zM10 7h4M12 7v10h2"/>',
    tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.2"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    sort: '<path d="M8 9l4-4 4 4M16 15l-4 4-4-4"/>',
    'sort-asc': '<path d="M8 14l4-4 4 4"/>',
    'sort-desc': '<path d="M8 10l4 4 4-4"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    kanban: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="14" rx="1.5"/>',
    layers: '<path d="M12 2L2 7l10 5 10-5zM2 12l10 5 10-5M2 17l10 5 10-5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'
  };
  function icon(name, cls = 'icon') {
    const body = ICONS[name] || ICONS.layers;
    return `<svg class="${escape(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  /* Custom Select Dropdown Enhancer (replaces native OS dropdown popups) */
  let dropdown = null, suppressClick = false, typed = '', typedTimer, popSeq = 0;
  function closeDropdown(focus) {
    if (!dropdown) return;
    const {trigger, pop} = dropdown;
    dropdown = null;
    pop.remove();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', outsideDropdown, true);
    window.removeEventListener('scroll', placeDropdown, true);
    window.removeEventListener('resize', placeDropdown);
    if (focus && trigger.isConnected) trigger.focus();
  }
  function outsideDropdown(event) {
    if (!dropdown) return;
    if (dropdown.trigger.contains(event.target) || dropdown.pop.contains(event.target)) return;
    closeDropdown(false);
  }
  function placeDropdown() {
    const d = dropdown;
    if (!d) return;
    const rect = d.trigger.getBoundingClientRect(), pop = d.pop;
    if (!rect.width && !rect.height) { closeDropdown(false); return; }
    pop.style.minWidth = rect.width + 'px';
    const below = innerHeight - rect.bottom - 8, above = rect.top - 8;
    const flip = below < Math.min(160, pop.offsetHeight) && above > below;
    pop.style.maxHeight = Math.max(96, Math.min(256, (flip ? above : below) - 4)) + 'px';
    const height = pop.offsetHeight;
    let top = flip ? rect.top - height - 4 : rect.bottom + 4;
    top = Math.min(Math.max(8, top), Math.max(8, innerHeight - height - 8));
    const left = Math.min(Math.max(8, rect.left), Math.max(8, innerWidth - pop.offsetWidth - 8));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function activateOption(index, scroll) {
    const d = dropdown;
    if (!d || !d.items.length) return;
    d.active = Math.max(0, Math.min(index, d.items.length - 1));
    d.items.forEach(item => item.removeAttribute('data-active'));
    const el = d.items[d.active];
    el.setAttribute('data-active', '');
    d.trigger.setAttribute('aria-activedescendant', el.id);
    if (scroll !== false) el.scrollIntoView({block: 'nearest'});
  }
  function stepOption(delta) {
    const d = dropdown;
    if (!d) return;
    let i = d.active;
    for (let n = 0; n < d.items.length; n++) {
      i = (i + delta + d.items.length) % d.items.length;
      if (d.items[i].getAttribute('aria-disabled') !== 'true') { activateOption(i); break; }
    }
  }
  function commitDropdown(index, focus) {
    const d = dropdown;
    if (!d) return;
    const option = d.select.options[index];
    if (option && !option.disabled) {
      const changed = d.select.value !== option.value;
      d.select.value = option.value;
      if (changed) d.select.dispatchEvent(new Event('change', {bubbles: true}));
    }
    closeDropdown(focus !== false);
  }
  function typeahead(char) {
    const d = dropdown;
    if (!d) return;
    clearTimeout(typedTimer);
    typed += char.toLocaleLowerCase();
    typedTimer = setTimeout(() => typed = '', 600);
    const n = d.items.length;
    for (let step = 1; step <= n; step++) {
      const i = (d.active + step) % n;
      if (d.items[i].getAttribute('aria-disabled') !== 'true' && d.select.options[i].text.trim().toLocaleLowerCase().startsWith(typed)) {
        activateOption(i); break;
      }
    }
  }
  function openDropdown(select, trigger) {
    if (select.disabled) return;
    if (dropdown && dropdown.select === select) { closeDropdown(true); return; }
    closeDropdown(false);
    const options = [...select.options];
    if (!options.length) return;
    const popId = 'select-pop-' + (++popSeq);
    const pop = document.createElement('div');
    pop.className = 'select-pop';
    pop.id = popId;
    pop.setAttribute('role', 'listbox');
    pop.tabIndex = -1;
    const items = options.map((option, index) => {
      const item = document.createElement('div');
      item.className = 'select-opt';
      item.id = popId + '-opt-' + index;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      if (option.disabled) item.setAttribute('aria-disabled', 'true');
      const label = document.createElement('span');
      label.className = 'select-opt-label';
      label.textContent = option.text;
      item.append(label);
      item.insertAdjacentHTML('beforeend', icon('check', 'select-check'));
      item.addEventListener('pointerenter', () => activateOption(index, false));
      item.addEventListener('click', () => commitDropdown(index));
      pop.append(item);
      return item;
    });
    (select.closest('dialog') || document.body).append(pop);
    dropdown = {select, trigger, pop, items, active: -1};
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', popId);
    activateOption(select.selectedIndex >= 0 ? select.selectedIndex : 0, false);
    placeDropdown();
    document.addEventListener('pointerdown', outsideDropdown, true);
    window.addEventListener('scroll', placeDropdown, true);
    window.addEventListener('resize', placeDropdown);
    if (dropdown.items[dropdown.active]) dropdown.items[dropdown.active].scrollIntoView({block: 'nearest'});
  }
  function enhanceSelect(select) {
    if (select.multiple || select.size > 1 || select.dataset.selectEnhanced !== undefined) return;
    const wrap = select.closest('.select-wrap');
    if (!wrap) return;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'select-trigger';
    const valueEl = document.createElement('span');
    valueEl.className = 'select-value';
    trigger.append(valueEl);
    select.before(trigger);
    select.dataset.selectEnhanced = '';
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const label = select.labels?.[0];
    if (label) {
      const cloneLabel = label.cloneNode(true);
      qa('.select-wrap,[aria-hidden=true],small', cloneLabel).forEach(n => n.remove());
      const name = cloneLabel.textContent.trim();
      if (name) trigger.setAttribute('aria-label', name);
      label.addEventListener('click', event => {
        if (trigger.contains(event.target)) return;
        event.preventDefault();
        trigger.focus();
      });
    }
    const sync = () => {
      const option = select.options[select.selectedIndex];
      valueEl.textContent = option ? option.text.trim() : '';
      trigger.disabled = select.disabled;
    };
    sync();
    for (const type of ['mousedown', 'keydown', 'click']) select.addEventListener(type, e => e.preventDefault());
    select.addEventListener('focus', () => { if (document.activeElement === select) trigger.focus(); });
    select.addEventListener('change', sync);
    if (select.form) select.form.addEventListener('reset', () => setTimeout(sync));
    trigger.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      if (dropdown && dropdown.select === select) closeDropdown(true);
      else openDropdown(select, trigger);
    });
    trigger.addEventListener('keydown', event => {
      if (!dropdown || dropdown.select !== select) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
          event.preventDefault(); suppressClick = true; openDropdown(select, trigger);
        }
        return;
      }
      switch (event.key) {
        case 'ArrowDown': event.preventDefault(); stepOption(1); break;
        case 'ArrowUp': event.preventDefault(); stepOption(-1); break;
        case 'Home': event.preventDefault(); activateOption(0); break;
        case 'End': event.preventDefault(); activateOption(dropdown.items.length - 1); break;
        case 'Enter': case ' ': event.preventDefault(); suppressClick = true; commitDropdown(dropdown.active); break;
        case 'Escape': event.preventDefault(); event.stopPropagation(); closeDropdown(true); break;
        case 'Tab': commitDropdown(dropdown.active, false); break;
        default: if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) typeahead(event.key);
      }
    });
  }
  function enhanceSelects(root) { qa('.select-wrap select', root).forEach(enhanceSelect); }

  /* Custom Confirm Modal (replaces native window.confirm) */
  function confirmDialog(message, options = {}) {
    const dialog = q('#ucd-confirm');
    if (!dialog) return Promise.resolve(window.confirm(message));
    if (confirmResolver) { confirmResolver(false); confirmResolver = null; }
    confirmReturn = document.activeElement;
    q('#ucd-confirm-title').textContent = options.title || '请确认操作';
    q('#ucd-confirm-message').textContent = String(message);
    const okBtn = q('[data-confirm-ok]', dialog);
    okBtn.textContent = options.confirmLabel || '确认';
    okBtn.className = `btn ${options.danger ? 'btn-danger' : 'btn-primary'}`;
    q('[data-confirm-cancel]', dialog).textContent = options.cancelLabel || '取消';
    dialog.showModal();
    okBtn.focus();
    return new Promise(resolve => { confirmResolver = resolve; });
  }
  function finishConfirm(result) {
    const dialog = q('#ucd-confirm');
    const resolve = confirmResolver;
    confirmResolver = null;
    if (dialog?.open) dialog.close();
    if (confirmReturn?.isConnected) confirmReturn.focus();
    confirmReturn = null;
    if (resolve) resolve(result);
  }

  function dispose(root) {
    if (dropdown && (root === document || root.contains(dropdown.select))) closeDropdown(false);
    for (const [element, cleanup] of [...cleanups]) {
      if (element === root || root.contains(element)) {
        if (typeof cleanup === 'function') cleanup();
        cleanups.delete(element);
      }
    }
  }
  function notify(message) {
    const toast = q('#ucd-toast');
    toast.textContent = String(message);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.hidden = true, 3200);
  }

  function stateKeyFor(targetId) { return `${currentPage}:${targetId}`; }
  function setFilter(targetId, patch, reset = false) {
    const key = stateKeyFor(targetId);
    if (!states.has(key)) states.set(key, {});
    const targetState = states.get(key);
    targetState.filters = reset ? {...patch} : {...(targetState.filters || {}), ...patch};
    targetState.page = 0;
    renderPage();
  }
  function getFilter(targetId) { return states.get(stateKeyFor(targetId))?.filters || {}; }

  function mount(node, root, path, extra = {}) {
    if (!node || !definitions.has(node.component)) throw new Error(`未注册组件：${node?.component}`);
    dispose(root);
    const definition = definitions.get(node.component), pending = [];
    const id = `${currentPage}:${node.id || path}${extra.row ? `:row:${String(extra.row[extra.rowKey || 'id'] ?? path)}` : ''}`;
    if (!states.has(id)) states.set(id, {});
    if (!pageStates.has(currentPage)) pageStates.set(currentPage, {});
    const props = node.props || {};
    const child = (value, scope = {}) => {
      const index = pending.push({value, scope}) - 1;
      return `<div class="ucd-child" data-ucd-child="${index}"></div>`;
    };
    const ctx = {
      ...extra, root, app: model.app, node, id, state: states.get(id),
      pageState: pageStates.get(currentPage),
      setPageState: (k, v) => { pageStates.get(currentPage)[k] = v; renderPage(); },
      setFilter, getFilter, icon, confirm: confirmDialog,
      escape, q, qa, notify, normalizeAction,
      data: name => model.data[name] || [],
      asset: name => model.assets[name] || '',
      child: (component, values = {}, scope = {}) => child({component, props: values}, scope),
      slot: (name = 'default', scope = {}) => node.slots?.[name] ? child(node.slots[name], scope) : '',
      refresh: () => mount(node, root, path, extra),
      action: (value, scope = {}) => action(value, {...extra, ...scope, node, props}),
      setData: (name, rows) => {
        if (!(name in model.data)) throw new Error(`数据集不存在：${name}`);
        model.data[name] = rows;
        renderPage();
      },
      open: (value, options = {}) => open(value, options),
      close: closeOverlay,
      navigate,
      value: (field, value) => {
        if (Array.isArray(value)) {
          return value.length ? value.map(v => `<span class="badge primary">${escape(v)}</span>`).join(' ') : '—';
        }
        const option = field.options?.find(item => typeof item === 'object' && String(item.value) === String(value));
        const label = option ? option.label : value;
        if (field.tones?.[value]) return `<span class="badge ${escape(field.tones[value])}">${escape(label)}</span>`;
        if (field.type === 'checkbox' || field.type === 'switch') return value ? '<span class="badge success">已开启</span>' : '<span class="badge neutral">未开启</span>';
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
        const element = document.createElement('div');
        target.append(element);
        mount(value, element, `${path}/${index}/${position}`, {...extra, ...item.scope});
      }
    }
    enhanceSelects(root);
    const cleanup = definition.mount?.(root, props, ctx);
    cleanups.set(root, cleanup);
    return ctx;
  }

  function closeOverlay() {
    closeDropdown(false);
    const dialog = q('#ucd-overlay');
    if (dialog.open) dialog.close();
  }
  function open(node, options = {}) {
    closeOverlay();
    const dialog = q('#ucd-overlay'), body = q('#ucd-overlay-body');
    overlayReturn = document.activeElement;
    dialog.className = options.mode === 'dialog' ? 'modal' : 'drawer';
    q('#ucd-overlay-title').textContent = options.title || node.props?.title || '详情';
    dialog.setAttribute('aria-labelledby', 'ucd-overlay-title');
    mount(node, body, 'overlay', options.context || {});
    dialog.showModal();
    (q('input:not([type=hidden]),.select-trigger,select,textarea', body) || q('[data-overlay-close]')).focus();
  }

  async function action(value, env = {}) {
    const act = normalizeAction(value), props = env.props || {}, dataName = act.data || props.data;
    const rowKey = props.rowKey || 'id', rows = model.data[dataName] || [];
    const selected = env.rows || (env.row ? [env.row] : []);
    if (act.type === 'navigate') return navigate(act.page);
    if (act.type === 'toast') return notify(act.message || act.label);
    if (act.type === 'filter') {
      if (!act.target) return;
      const patch = act.values || (act.field ? {[act.field]: act.value ?? ''} : {});
      return setFilter(act.target, patch, Boolean(act.reset));
    }
    if (act.type === 'open') {
      const node = model.pages[currentPage].views?.[act.target];
      if (!node) throw new Error(`找不到视图：${act.target}`);
      return open(node, {title: act.label, mode: act.mode, context: {row: env.row}});
    }
    if (!dataName || !(dataName in model.data)) return notify('请为此操作配置数据集');
    if (act.type === 'create' || act.type === 'edit') {
      const original = act.type === 'edit' ? env.row : null;
      if (act.type === 'edit' && !original) return;
      const fields = props.formFields || props.fields || [];
      const node = {component: 'form', props: {fields, record: original || {}, submitLabel: '保存'}, slots: {after: env.node?.slots?.form || []}};
      return open(node, {
        title: act.type === 'create' ? act.label : `编辑${props.title || '记录'}`,
        mode: act.mode,
        context: {
          row: original, rowKey,
          onSubmit: values => {
            const record = {...original, ...values};
            if (!original) record[rowKey] = globalThis.crypto?.randomUUID?.() || `record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            model.data[dataName] = original
              ? model.data[dataName].map(row => row[rowKey] === original[rowKey] ? record : row)
              : [record, ...model.data[dataName]];
            closeOverlay();
            renderPage();
            notify('已保存');
          }
        }
      });
    }
    if (act.type === 'detail') {
      return open(
        {component: 'detail', props: {fields: props.fields || [], record: env.row || {}}, slots: {after: env.node?.slots?.detail || []}},
        {title: env.row?.[props.titleField || 'title'] || '记录详情', mode: act.mode, context: {row: env.row, rowKey}}
      );
    }
    if (!selected.length) return notify('请先选择记录');
    const ids = new Set(selected.map(row => row[rowKey]));
    if (act.type === 'delete') {
      const ok = await confirmDialog(act.confirm || `确认删除选中的 ${selected.length} 条记录？此操作仅影响当前演示数据。`, {title: '删除确认', confirmLabel: '确认删除', danger: true});
      if (!ok) return;
      model.data[dataName] = rows.filter(row => !ids.has(row[rowKey]));
    } else if (act.type === 'update' || act.type === 'approve') {
      if (act.confirm) {
        const ok = await confirmDialog(act.confirm, {title: act.label || '操作确认', confirmLabel: '确认'});
        if (!ok) return;
      }
      const values = act.values || {[props.statusField || 'status']: '已通过'};
      model.data[dataName] = rows.map(row => ids.has(row[rowKey]) ? {...row, ...values} : row);
    } else {
      return notify(`尚未实现的操作：${act.type}`);
    }
    renderPage();
    notify(act.message || '已更新记录');
  }

  function renderPage() {
    const page = model.pages[currentPage], root = q('#ucd-content');
    dispose(root);
    root.innerHTML = '';
    const eyebrow = q('#ucd-page-eyebrow');
    if (eyebrow) { eyebrow.textContent = page.eyebrow || ''; eyebrow.hidden = !page.eyebrow; }
    q('#ucd-page-title').textContent = page.title;
    q('#ucd-page-description').textContent = page.description || '';
    q('#ucd-breadcrumb').textContent = page.title;
    qa('[data-page]').forEach(button => {
      const active = button.dataset.page === currentPage;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    try {
      page.content.forEach((node, i) => {
        const element = document.createElement('div');
        root.append(element);
        mount(node, element, `content/${i}`);
      });
    } catch (error) {
      const message = document.createElement('div');
      message.className = 'alert danger';
      message.textContent = `页面配置错误：${error.message}`;
      root.append(message);
      throw error;
    }
  }

  function navigate(id) {
    if (!(id in model.pages)) return notify('目标页面不存在');
    closeOverlay();
    currentPage = id;
    if (location.hash !== `#/${id}`) location.hash = `/${id}`;
    renderPage();
  }

  function buildNavHtml() {
    const entries = Object.entries(model.pages);
    const defaultIcons = ['table', 'dashboard', 'users', 'form', 'settings', 'chart', 'layers'];
    const groups = [];
    const byGroup = new Map();
    entries.forEach(([id, page], idx) => {
      const groupName = page.group || '';
      if (!byGroup.has(groupName)) {
        const list = [];
        byGroup.set(groupName, list);
        groups.push([groupName, list]);
      }
      byGroup.get(groupName).push({
        id,
        title: page.title,
        icon: page.icon || defaultIcons[idx % defaultIcons.length],
        badge: page.badge
      });
    });
    const showGroupLabels = groups.some(([name]) => Boolean(name));
    return groups.map(([groupName, items]) => {
      const label = showGroupLabels && groupName ? `<p class="nav-group-label">${escape(groupName)}</p>` : '';
      const buttons = items.map(item =>
        `<button type="button" data-page="${escape(item.id)}">${icon(item.icon, 'nav-svg')}<span class="nav-title">${escape(item.title)}</span>${item.badge ? `<span class="nav-badge">${escape(item.badge)}</span>` : ''}</button>`
      ).join('');
      return `<div class="nav-group">${label}${buttons}</div>`;
    }).join('');
  }

  function boot(config) {
    model = clone(config);
    document.body.className = `${model.app.density || 'compact'} shell-${model.app.shell || 'sidebar'}`;
    const userLabel = model.app.user || '当前用户';
    const userRole = model.app.userRole || '工作空间成员';
    q('#ucd-app').innerHTML = `
      <a class="skip" href="#ucd-main">跳转到主要内容</a>
      <div class="project-app">
        <aside class="project-sidebar">
          <div class="project-brand"><span class="brand-mark">${icon(model.app.brandIcon || 'brand')}</span><strong>${escape(model.app.title)}</strong></div>
          ${model.app.workspace ? `<p class="workspace-label">${escape(model.app.workspace)}</p>` : ''}
          <nav aria-label="主导航">${buildNavHtml()}</nav>
          <div class="sidebar-user"><span class="user-avatar">${escape(userLabel.slice(0, 1))}</span><div><strong>${escape(userLabel)}</strong><small>${escape(userRole)}</small></div></div>
        </aside>
        <div class="project-workspace">
          <header class="project-topbar">
            <span class="topbar-breadcrumb">${escape(model.app.title)}${icon('chevron-right', 'breadcrumb-sep')}<strong id="ucd-breadcrumb"></strong></span>
            <span class="local-indicator"><i></i>本地演示</span>
          </header>
          <main id="ucd-main" tabindex="-1">
            <div class="page-heading">
              <div>
                <p class="eyebrow" id="ucd-page-eyebrow" hidden></p>
                <h1 id="ucd-page-title"></h1>
                <p id="ucd-page-description"></p>
              </div>
            </div>
            <div id="ucd-content"></div>
            <footer class="page-footnote">示例数据仅在当前页面会话中保留</footer>
          </main>
        </div>
      </div>`;
    qa('[data-page]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
    q('[data-overlay-close]').addEventListener('click', closeOverlay);
    q('#ucd-overlay').addEventListener('close', () => {
      if (!q('#ucd-overlay').open) {
        dispose(q('#ucd-overlay-body'));
        if (overlayReturn?.isConnected) overlayReturn.focus();
      }
    });
    const confirmEl = q('#ucd-confirm');
    if (confirmEl) {
      q('[data-confirm-ok]', confirmEl)?.addEventListener('click', () => finishConfirm(true));
      q('[data-confirm-cancel]', confirmEl)?.addEventListener('click', () => finishConfirm(false));
      confirmEl.addEventListener('cancel', event => { event.preventDefault(); finishConfirm(false); });
    }
    window.addEventListener('hashchange', () => {
      const id = location.hash.slice(2);
      if (id in model.pages && id !== currentPage) navigate(id);
    });
    navigate(model.pages[location.hash.slice(2)] ? location.hash.slice(2) : model.app.startPage || Object.keys(model.pages)[0]);
  }

  return {
    register(name, definition) {
      if (definitions.has(name)) throw new Error(`组件重复注册：${name}`);
      if (typeof definition.render !== 'function') throw new Error(`组件缺少 render：${name}`);
      definitions.set(name, definition);
      if (definition.css) {
        const style = document.createElement('style');
        style.textContent = definition.css;
        document.head.append(style);
      }
    },
    boot, navigate, notify, icon, enhanceSelects, confirm: confirmDialog
  };
})();
