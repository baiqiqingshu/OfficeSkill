UCD.register('panel', {
  render(props, ctx) {
    const columns = Math.max(1,Math.min(4,Number(props.columns) || 1));
    return `<section class="panel">${props.title ? `<header class="panel-head"><div><h2>${ctx.escape(props.title)}</h2>${props.description ? `<p>${ctx.escape(props.description)}</p>` : ''}</div>${ctx.slot('actions')}</header>` : ''}<div class="panel-body slot-columns columns-${columns}">${ctx.slot()}</div></section>`;
  }
});
