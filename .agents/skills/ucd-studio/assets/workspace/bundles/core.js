// @component: field
UCD.register('field', {
  render(props, ctx) {
    const field = props.field, h = ctx.escape, key = field.key;
    const id = `${ctx.id}-${key}`, value = props.value ?? field.default ?? '';
    const type = field.type || 'text', required = field.required ? ' required' : '';
    const disabled = field.disabled || (field.readonly && ['select', 'checkbox', 'switch', 'radio', 'tags'].includes(type));
    const attrs = `id="${h(id)}" name="${h(key)}" data-field-key="${h(key)}"${required}${field.readonly ? ' readonly' : ''}${disabled ? ' disabled' : ''}`;
    const opts = (field.options || []).map(o => typeof o === 'object' ? o : {value: o, label: o});
    let input;
    if (type === 'select') {
      const options = [...(props.filter ? [{value: '', label: field.allLabel || '全部'}] : []), ...opts];
      input = `<span class="select-wrap"><select ${attrs}>${options.map(o => `<option value="${h(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${h(o.label)}</option>`).join('')}</select>${ctx.icon('chevron-down', 'select-chevron')}</span>`;
    } else if (type === 'textarea') {
      input = `<textarea ${attrs} rows="${Number(field.rows) || 4}" placeholder="${h(field.placeholder || `请输入${field.label}`)}">${h(value)}</textarea>`;
    } else if (type === 'checkbox') {
      input = `<input type="checkbox" ${attrs}${value ? ' checked' : ''}>`;
    } else if (type === 'switch') {
      input = `<input type="checkbox" role="switch" ${attrs}${value ? ' checked' : ''}>`;
    } else if (type === 'radio') {
      input = `<div class="radio-group" data-field-group="${h(key)}">${opts.map((o, idx) => `<label class="radio-pill"><input type="radio" name="${h(key)}" value="${h(o.value)}"${String(o.value) === String(value) ? ' checked' : ''}${disabled ? ' disabled' : ''}${idx === 0 && field.required ? ' required' : ''}><span>${h(o.label)}</span></label>`).join('')}</div>`;
      return `<div class="field"><span>${h(field.label)}${field.required ? '<b class="required" aria-hidden="true">*</b>' : ''}</span>${input}${field.help ? `<small>${h(field.help)}</small>` : ''}</div>`;
    } else if (type === 'tags') {
      const selected = new Set(Array.isArray(value) ? value.map(String) : value ? String(value).split(',').map(s => s.trim()) : []);
      input = `<div class="tags-group" data-field-tags="${h(key)}">${opts.map(o => `<label class="tag-chip"><input type="checkbox" name="${h(key)}" value="${h(o.value)}"${selected.has(String(o.value)) ? ' checked' : ''}${disabled ? ' disabled' : ''}><span>${h(o.label)}</span></label>`).join('')}</div>`;
      return `<div class="field"><span>${h(field.label)}${field.required ? '<b class="required" aria-hidden="true">*</b>' : ''}</span>${input}${field.help ? `<small>${h(field.help)}</small>` : ''}</div>`;
    } else if (type === 'search') {
      const ph = field.placeholder || `搜索${field.label}`;
      input = `<span class="input-wrap">${ctx.icon('search', 'input-icon')}<input type="search" ${attrs} value="${h(value)}" placeholder="${h(ph)}"></span>`;
    } else {
      const safeType = ['text', 'email', 'date', 'number', 'tel', 'url'].includes(type) ? type : 'text';
      const ph = field.placeholder || (safeType === 'date' ? '' : `请输入${field.label}`);
      input = `<input type="${h(safeType)}" ${attrs} value="${h(value)}"${ph ? ` placeholder="${h(ph)}"` : ''}${field.min != null ? ` min="${h(field.min)}"` : ''}${field.max != null ? ` max="${h(field.max)}"` : ''}${field.step != null ? ` step="${h(field.step)}"` : ''}>`;
    }
    const cls = type === 'checkbox' ? 'field field-checkbox' : type === 'switch' ? 'field field-switch' : 'field';
    return `<label class="${cls}" for="${h(id)}"><span>${h(field.label)}${field.required ? '<b class="required" aria-hidden="true">*</b>' : ''}</span>${input}${field.help ? `<small>${h(field.help)}</small>` : ''}</label>`;
  }
});
// @end: field

// @component: form
UCD.register('form', {
  render(props, ctx) {
    const record = props.record || ctx.row || {}, h = ctx.escape;
    const cols = Math.max(1, Math.min(3, Number(props.columns) || 2));
    const renderFields = list => `<div class="form-grid cols-${cols}">${(list || []).filter(f => !f.hidden).map(field => {
      const wide = field.wide || field.type === 'textarea' || field.type === 'tags';
      return `<div class="${wide ? 'field-wide' : ''}">${ctx.child('field', {field, value: record[field.key]})}</div>`;
    }).join('')}</div>`;
    const body = Array.isArray(props.sections) && props.sections.length
      ? props.sections.map(sec => `<div class="form-section">${sec.title ? `<div class="form-section-head"><h3>${h(sec.title)}</h3>${sec.description ? `<p>${h(sec.description)}</p>` : ''}</div>` : ''}${renderFields(sec.fields)}</div>`).join('')
      : renderFields(props.fields || []);
    const inner = `<form class="data-form">${props.title && !props.panel ? `<h2>${h(props.title)}</h2>` : ''}${body}<p class="form-feedback" role="status"></p><div class="form-actions"><button type="reset" class="btn">重置</button><button type="submit" class="btn btn-primary">${h(props.submitLabel || '提交')}</button></div></form>`;
    const wrapped = props.panel ? `<section class="panel">${props.title ? `<header class="panel-head"><div><h2>${h(props.title)}</h2>${props.description ? `<p>${h(props.description)}</p>` : ''}</div></header>` : ''}<div class="panel-body">${inner}</div></section>` : inner;
    return `${ctx.slot('before')}${wrapped}${ctx.slot('after')}`;
  },
  mount(root, props, ctx) {
    const form = root.querySelector('form');
    if (!form) return;
    const allFields = Array.isArray(props.sections) && props.sections.length
      ? props.sections.flatMap(sec => sec.fields || [])
      : (props.fields || []);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = {};
      for (const field of allFields) {
        if (field.disabled || field.hidden) continue;
        if (field.type === 'tags') {
          values[field.key] = [...form.querySelectorAll(`[data-field-tags="${CSS.escape(field.key)}"] input:checked`)].map(el => el.value);
          continue;
        }
        if (field.type === 'radio') {
          const checked = form.querySelector(`[data-field-group="${CSS.escape(field.key)}"] input:checked`);
          values[field.key] = checked ? checked.value : '';
          continue;
        }
        const input = form.elements.namedItem(field.key);
        if (!input) continue;
        const option = field.type === 'select' && field.options?.find(item => typeof item === 'object' && String(item.value) === input.value);
        values[field.key] = option ? option.value
          : (field.type === 'checkbox' || field.type === 'switch') ? input.checked
          : field.type === 'number' && input.value !== '' ? Number(input.value)
          : input.value;
      }
      if (ctx.onSubmit) {
        ctx.onSubmit(values);
      } else if (props.data) {
        const key = props.rowKey || 'id';
        const record = props.record || ctx.row;
        const rows = ctx.data(props.data);
        ctx.setData(props.data, record
          ? rows.map(row => row[key] === record[key] ? {...row, ...values} : row)
          : [{...values, [key]: globalThis.crypto?.randomUUID?.() || `record-${Date.now()}`}, ...rows]);
        ctx.notify('已保存');
      } else {
        root.querySelector('.form-feedback').textContent = '配置已更新（本地演示未提交服务器）';
        ctx.notify(props.successMessage || '已保存本地配置');
      }
    });
  }
});
// @end: form

// @component: detail
UCD.register('detail', {
  render(props, ctx) {
    const record = props.record || ctx.row || {}, h = ctx.escape;
    const fields = props.fields || Object.keys(record).map(key => ({key, label: key}));
    const grid = `<dl class="detail-grid">${fields.filter(f => !f.hidden).map(field => `<div class="${field.wide || field.type === 'textarea' ? 'wide' : ''}"><dt>${h(field.label)}</dt><dd>${ctx.value(field, record[field.key])}</dd></div>`).join('')}</dl>`;
    const body = props.panel ? `<section class="panel">${props.title ? `<header class="panel-head"><div><h2>${h(props.title)}</h2>${props.description ? `<p>${h(props.description)}</p>` : ''}</div></header>` : ''}<div class="panel-body">${grid}</div></section>` : `${props.title ? `<h2 style="margin-bottom:14px">${h(props.title)}</h2>` : ''}${grid}`;
    return `${ctx.slot('before')}${body}${ctx.slot('after')}`;
  }
});
// @end: detail

// @component: alert
UCD.register('alert', {
  render(props, ctx) {
    const tone = props.tone || 'neutral';
    const iconName = tone === 'success' ? 'check-circle' : (tone === 'warning' || tone === 'danger') ? 'alert' : 'info';
    return `<div class="alert ${ctx.escape(tone)}" role="note">${ctx.icon(iconName, 'alert-icon')}<div class="alert-copy">${props.title ? `<strong>${ctx.escape(props.title)}</strong>` : ''}<p>${ctx.escape(props.text || '')}</p></div></div>`;
  }
});
// @end: alert

// @component: image
UCD.register('image', {
  render(props, ctx) {
    const src = props.src || ctx.asset(props.asset);
    if (!src.startsWith('data:image/')) throw new Error('图片需要使用 assets/ 下的本地素材，并在构建时内联');
    return `<figure class="image-card"><img src="${ctx.escape(src)}" alt="${ctx.escape(props.alt || '')}">${props.caption ? `<figcaption>${ctx.escape(props.caption)}</figcaption>` : ''}</figure>`;
  }
});
// @end: image
