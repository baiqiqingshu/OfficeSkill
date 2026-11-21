UCD.register('detail', {
  render(props, ctx) {
    const record = props.record || ctx.row || {};
    return `${ctx.slot('before')}${props.title ? `<h2>${ctx.escape(props.title)}</h2>` : ''}<dl class="detail-grid">${(props.fields || Object.keys(record).map(key=>({key,label:key}))).filter(field=>!field.hidden).map(field=>`<div class="${field.type === 'textarea' ? 'wide' : ''}"><dt>${ctx.escape(field.label)}</dt><dd>${ctx.value(field,record[field.key])}</dd></div>`).join('')}</dl>${ctx.slot('after')}`;
  }
});
