UCD.register('stats', {
  render(props, ctx) {
    return `<div class="stats-grid">${(props.items || []).map(item=>{
      const value = item.data ? ctx.data(item.data).filter(row=>!item.field || row[item.field] === item.equals).length : item.value;
      return `<article class="stat-card ${ctx.escape(item.tone || '')}"><span class="stat-label">${ctx.escape(item.label)}</span><strong>${ctx.escape(value)}</strong><small>${ctx.escape(item.hint || '')}</small></article>`;
    }).join('')}</div>`;
  }
});
