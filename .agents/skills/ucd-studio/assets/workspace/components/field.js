UCD.register('field', {
  render(props, ctx) {
    const field = props.field, h = ctx.escape, key = field.key;
    const id = `${ctx.id}-${key}`, value = props.value ?? field.default ?? '';
    const type = field.type || 'text', required = field.required ? ' required' : '';
    const attrs = `id="${h(id)}" name="${h(key)}" data-field-key="${h(key)}"${required}${field.readonly ? ' readonly' : ''}${field.disabled || (field.readonly && ['select','checkbox'].includes(type)) ? ' disabled' : ''}`;
    let input;
    if (type === 'select') {
      const options = [...(props.filter ? [{value:'',label:'全部'}] : []), ...(field.options || []).map(option => typeof option === 'object' ? option : {value:option,label:option})];
      input = `<select ${attrs}>${options.map(option=>`<option value="${h(option.value)}"${String(option.value) === String(value) ? ' selected' : ''}>${h(option.label)}</option>`).join('')}</select>`;
    } else if (type === 'textarea') input = `<textarea ${attrs} rows="${Number(field.rows) || 4}" placeholder="${h(field.placeholder || '')}">${h(value)}</textarea>`;
    else if (type === 'checkbox') input = `<input type="checkbox" ${attrs}${value ? ' checked' : ''}>`;
    else input = `<input type="${h(['text','email','date','number','search','tel','url'].includes(type) ? type : 'text')}" ${attrs} value="${h(value)}" placeholder="${h(field.placeholder || '')}"${field.min != null ? ` min="${h(field.min)}"` : ''}${field.max != null ? ` max="${h(field.max)}"` : ''}${field.step != null ? ` step="${h(field.step)}"` : ''}>`;
    return `<label class="field ${type === 'checkbox' ? 'field-checkbox' : ''}" for="${h(id)}"><span>${h(field.label)}${field.required ? '<b class="required" aria-hidden="true"> *</b>' : ''}</span>${input}${field.help ? `<small>${h(field.help)}</small>` : ''}</label>`;
  }
});
