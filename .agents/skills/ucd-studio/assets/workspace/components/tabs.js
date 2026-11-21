UCD.register('tabs', {
  render(props, ctx) {
    const items = props.items || [];
    if (!items.some(item=>item.key === ctx.state.active)) ctx.state.active = items[0]?.key;
    const prefix = ctx.id.replace(/[^a-zA-Z0-9-]/g,'-');
    return `<section class="panel"><div class="tab-list" role="tablist">${items.map((item,i)=>`<button type="button" role="tab" id="${prefix}-tab-${i}" aria-controls="${prefix}-panel-${i}" aria-selected="${item.key === ctx.state.active}" tabindex="${item.key === ctx.state.active ? 0 : -1}" data-tab="${ctx.escape(item.key)}">${ctx.escape(item.label)}</button>`).join('')}</div>${items.map((item,i)=>`<div class="tab-panel" role="tabpanel" id="${prefix}-panel-${i}" aria-labelledby="${prefix}-tab-${i}"${item.key === ctx.state.active ? '' : ' hidden'}>${ctx.slot(item.key)}</div>`).join('')}</section>`;
  },
  mount(root, props, ctx) {
    const tabs = [...root.querySelectorAll('[data-tab]')];
    const select = (key,focus) => {ctx.state.active = key;ctx.refresh();if (focus) [...root.querySelectorAll('[data-tab]')].find(tab=>tab.dataset.tab === key)?.focus();};
    tabs.forEach((tab,i)=>{
      tab.addEventListener('click',()=>select(tab.dataset.tab,false));
      tab.addEventListener('keydown',event=>{
        const index = {ArrowRight:(i+1)%tabs.length,ArrowLeft:(i+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
        if (index != null) {event.preventDefault();select(tabs[index].dataset.tab,true);}
      });
    });
  }
});
