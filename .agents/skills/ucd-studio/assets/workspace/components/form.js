UCD.register('form', {
  render(props, ctx) {
    const record = props.record || ctx.row || {};
    return `${ctx.slot('before')}<form class="data-form">${props.title ? `<h2>${ctx.escape(props.title)}</h2>` : ''}<div class="form-grid">${(props.fields || []).filter(field=>!field.hidden).map(field=>ctx.child('field',{field,value:record[field.key]})).join('')}</div><p class="form-feedback" role="status"></p><div class="form-actions"><button type="reset" class="btn">重置</button><button type="submit" class="btn btn-primary">${ctx.escape(props.submitLabel || '提交')}</button></div></form>${ctx.slot('after')}`;
  },
  mount(root, props, ctx) {
    const form = root.querySelector('form');
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = {};
      for (const field of props.fields || []) {
        const input = form.elements.namedItem(field.key);
        if (!input || field.disabled || field.hidden) continue;
        const option = field.type === 'select' && field.options?.find(item=>typeof item === 'object' && String(item.value) === input.value);
        values[field.key] = option ? option.value : field.type === 'checkbox' ? input.checked : field.type === 'number' && input.value !== '' ? Number(input.value) : input.value;
      }
      if (ctx.onSubmit) ctx.onSubmit(values);
      else if (props.data) {
        const key = props.rowKey || 'id';
        const record = props.record || ctx.row;
        const rows = ctx.data(props.data);
        ctx.setData(props.data, record ? rows.map(row=>row[key] === record[key] ? {...row,...values} : row) : [{...values,[key]:globalThis.crypto?.randomUUID?.() || `record-${Date.now()}`},...rows]);
        ctx.notify('已保存');
      } else {root.querySelector('.form-feedback').textContent = '填写完成';ctx.notify('表单校验通过');}
    });
  }
});
