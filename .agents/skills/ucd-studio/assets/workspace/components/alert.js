UCD.register('alert', {
  render(props, ctx) {
    return `<div class="alert ${ctx.escape(props.tone || 'neutral')}" role="note">${props.title ? `<strong>${ctx.escape(props.title)}</strong>` : ''}<p>${ctx.escape(props.text || '')}</p></div>`;
  }
});
