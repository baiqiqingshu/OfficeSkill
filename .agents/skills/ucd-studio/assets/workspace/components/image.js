UCD.register('image', {
  render(props, ctx) {
    const src = props.src || ctx.asset(props.asset);
    if (!src.startsWith('data:image/')) throw new Error('图片需要使用 assets/ 下的本地素材，并在构建时内联');
    return `<figure class="image-card"><img src="${ctx.escape(src)}" alt="${ctx.escape(props.alt || '')}">${props.caption ? `<figcaption>${ctx.escape(props.caption)}</figcaption>` : ''}</figure>`;
  }
});
