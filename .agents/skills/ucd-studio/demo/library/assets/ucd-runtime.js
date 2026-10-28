/* UCD Studio 1.1.0 — offline, original vanilla JS. No network or storage. */
(()=>{'use strict';
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const toast=q('#toast');let toastTimer;
  function notify(message){toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,3600);}
  qa('[data-notify]').forEach(button=>button.addEventListener('click',()=>notify(button.dataset.notify)));
  qa('.nav-list a').forEach(a=>a.addEventListener('click',()=>{qa('.nav-list a').forEach(n=>{n.classList.remove('active');n.removeAttribute('aria-current');});a.classList.add('active');a.setAttribute('aria-current','location');}));

  /* Custom dropdown: the real <select> stays as the data/validation layer,
     visually hidden; a styled trigger + popup mirror it. */
  const CHECK='<svg class="select-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  let dropdown=null,suppressClick=false,typed='',typedTimer,popSeq=0;
  function closeDropdown(focus){
    if(!dropdown)return;
    const {trigger,pop}=dropdown;dropdown=null;
    pop.remove();trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown',outsideDropdown,true);
    window.removeEventListener('scroll',placeDropdown,true);window.removeEventListener('resize',placeDropdown);
    if(focus)trigger.focus();
  }
  function outsideDropdown(event){
    if(!dropdown)return;
    const target=event.target;
    if(dropdown.trigger.contains(target)||dropdown.pop.contains(target))return;
    closeDropdown(false);
  }
  function placeDropdown(){
    const d=dropdown;if(!d)return;
    const rect=d.trigger.getBoundingClientRect(),pop=d.pop;
    if(!rect.width&&!rect.height){closeDropdown(false);return}
    pop.style.minWidth=rect.width+'px';
    const below=innerHeight-rect.bottom-8,above=rect.top-8,flip=below<Math.min(160,pop.offsetHeight)&&above>below;
    pop.style.maxHeight=Math.max(96,Math.min(256,(flip?above:below)-4))+'px';
    const height=pop.offsetHeight;
    let top=flip?rect.top-height-4:rect.bottom+4;
    top=Math.min(Math.max(8,top),Math.max(8,innerHeight-height-8));
    const left=Math.min(Math.max(8,rect.left),Math.max(8,innerWidth-pop.offsetWidth-8));
    pop.style.left=left+'px';pop.style.top=top+'px';
  }
  function activate(index,scroll){
    const d=dropdown;if(!d||!d.items.length)return;
    d.active=Math.max(0,Math.min(index,d.items.length-1));
    d.items.forEach(item=>item.removeAttribute('data-active'));
    const el=d.items[d.active];el.setAttribute('data-active','');
    d.trigger.setAttribute('aria-activedescendant',el.id);
    if(scroll!==false)el.scrollIntoView({block:'nearest'});
  }
  function stepItem(delta){
    const d=dropdown;if(!d)return;
    let i=d.active;
    for(let n=0;n<d.items.length;n++){
      i=(i+delta+d.items.length)%d.items.length;
      if(d.items[i].getAttribute('aria-disabled')!=='true'){activate(i);break}
    }
  }
  function commitDropdown(index,focus){
    const d=dropdown;if(!d)return;
    const option=d.select.options[index];
    if(option&&!option.disabled){d.select.value=option.value;d.select.dispatchEvent(new Event('change',{bubbles:true}));}
    closeDropdown(focus!==false);
  }
  function typeahead(char){
    const d=dropdown;if(!d)return;
    clearTimeout(typedTimer);typed+=char.toLocaleLowerCase();typedTimer=setTimeout(()=>typed='',600);
    const n=d.items.length;
    for(let step=1;step<=n;step++){
      const i=(d.active+step)%n;
      if(d.items[i].getAttribute('aria-disabled')!=='true'&&d.select.options[i].text.trim().toLocaleLowerCase().startsWith(typed)){activate(i);break}
    }
  }
  function openDropdown(select,trigger){
    if(select.disabled)return;
    if(dropdown&&dropdown.select===select){closeDropdown(true);return}
    closeDropdown(false);
    const options=[...select.options];if(!options.length)return;
    const popId='select-pop-'+(++popSeq);
    const pop=document.createElement('div');
    pop.className='select-pop';pop.id=popId;pop.setAttribute('role','listbox');pop.tabIndex=-1;
    if(trigger.getAttribute('aria-label'))pop.setAttribute('aria-label',trigger.getAttribute('aria-label'));
    const items=options.map((option,index)=>{
      const group=option.parentElement;
      if(group&&group.tagName==='OPTGROUP'&&option===group.firstElementChild){
        const head=document.createElement('div');head.className='select-group';head.textContent=group.label;pop.append(head);
      }
      const item=document.createElement('div');
      item.className='select-opt';item.id=popId+'-opt-'+index;
      item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));
      if(option.disabled)item.setAttribute('aria-disabled','true');
      const label=document.createElement('span');label.className='select-opt-label';label.textContent=option.text;item.append(label);
      item.insertAdjacentHTML('beforeend',CHECK);
      item.addEventListener('pointerenter',()=>activate(index,false));
      item.addEventListener('click',()=>commitDropdown(index));
      pop.append(item);return item;
    });
    (select.closest('dialog')||document.body).append(pop);
    dropdown={select,trigger,pop,items,active:-1};
    trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',popId);
    activate(select.selectedIndex>=0?select.selectedIndex:0,false);
    placeDropdown();
    document.addEventListener('pointerdown',outsideDropdown,true);
    window.addEventListener('scroll',placeDropdown,true);window.addEventListener('resize',placeDropdown);
    if(dropdown.items[dropdown.active])dropdown.items[dropdown.active].scrollIntoView({block:'nearest'});
  }
  function triggerKeydown(event,select){
    if(!dropdown||dropdown.select!==select){
      if(event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='Enter'||event.key===' '){
        event.preventDefault();suppressClick=true;openDropdown(select,event.currentTarget);
      }
      return;
    }
    switch(event.key){
      case 'ArrowDown':event.preventDefault();stepItem(1);break;
      case 'ArrowUp':event.preventDefault();stepItem(-1);break;
      case 'Home':event.preventDefault();activate(0);break;
      case 'End':event.preventDefault();activate(dropdown.items.length-1);break;
      case 'Enter':case ' ':event.preventDefault();suppressClick=true;commitDropdown(dropdown.active);break;
      case 'Escape':event.preventDefault();event.stopPropagation();closeDropdown(true);break;
      case 'Tab':commitDropdown(dropdown.active,false);break;
      default:if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey)typeahead(event.key);
    }
  }
  function enhanceSelect(select){
    if(select.multiple||select.size>1)return;
    const wrap=select.closest('.select-wrap');
    if(!wrap)return;
    const trigger=document.createElement('button');
    trigger.type='button';trigger.className='select-trigger';
    const value=document.createElement('span');value.className='select-value';trigger.append(value);
    select.before(trigger);
    select.dataset.select='';select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
    const explicit=select.getAttribute('aria-label');
    const label=select.labels&&select.labels[0];
    if(explicit)trigger.setAttribute('aria-label',explicit);
    else if(label){
      const clone=label.cloneNode(true);
      qa('.select-wrap,[aria-hidden=true],.field-help',clone).forEach(node=>node.remove());
      const name=clone.textContent.trim();
      if(name)trigger.setAttribute('aria-label',name);
    }
    if(label)label.addEventListener('click',event=>{
      if(trigger.contains(event.target))return;
      event.preventDefault();trigger.focus();
    });
    function sync(){
      const option=select.options[select.selectedIndex];
      value.textContent=option?option.text.trim():'';
      trigger.disabled=select.disabled;
    }
    sync();
    for(const type of ['mousedown','keydown','click'])select.addEventListener(type,event=>event.preventDefault());
    select.addEventListener('focus',()=>{if(document.activeElement===select)trigger.focus();});
    select.addEventListener('change',sync);
    for(const prop of ['value','selectedIndex']){
      const descriptor=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,prop);
      Object.defineProperty(select,prop,{configurable:true,get:descriptor.get,set(v){descriptor.set.call(select,v);sync();}});
    }
    if(select.form)select.form.addEventListener('reset',()=>setTimeout(sync));
    trigger.addEventListener('click',()=>{
      if(suppressClick){suppressClick=false;return}
      if(dropdown&&dropdown.select===select)closeDropdown(true);else openDropdown(select,trigger);
    });
    trigger.addEventListener('keydown',event=>triggerKeydown(event,select));
  }
  qa('.select-wrap select').forEach(enhanceSelect);

  qa('[data-table]').forEach(panel=>{
    const rows=qa('tbody tr',panel), search=q('[data-search]',panel), filter=q('[data-filter]',panel), status=q('[data-table-status]',panel), state=q('[data-state]',panel), message=q('[data-state-message]',panel), statePanel=q('[data-table-state]',panel), skeleton=q('[data-skeleton]',panel), retry=q('[data-retry]',panel), empty=q('[data-empty]',panel), table=q('.table-scroll',panel), prev=q('[data-prev]',panel),next=q('[data-next]',panel), pages=q('[data-pages]',panel);
    let page=0,sorted=[...rows],direction=1,lastColumn=-1;const size=Number(panel.dataset.pageSize)||5;
    function draw(){
      const term=search.value.trim().toLocaleLowerCase(), selected=filter.value;
      const visible=sorted.filter(r=>r.textContent.toLocaleLowerCase().includes(term)&&(!selected||r.dataset.status===selected));
      const count=Math.max(1,Math.ceil(visible.length/size));page=Math.max(0,Math.min(page,count-1));
      rows.forEach(r=>r.hidden=true);visible.slice(page*size,(page+1)*size).forEach(r=>r.hidden=false);
      const mode=state.value;table.hidden=mode!=='ready';statePanel.hidden=mode==='ready';skeleton.hidden=mode!=='loading';panel.setAttribute('aria-busy',String(mode==='loading'));message.textContent={loading:'正在加载示例记录…',error:'暂时无法加载记录。请重试以恢复本地示例。',empty:'暂无记录。可恢复示例记录，继续体验筛选和分页。'}[mode]||'';retry.hidden=!['error','empty'].includes(mode);retry.textContent=mode==='empty'?'恢复示例记录':'重试';
      empty.hidden=mode!=='ready'||visible.length>0;status.textContent=mode==='ready'?`共 ${visible.length} 项 · 当前 ${visible.length?page*size+1:0}–${Math.min((page+1)*size,visible.length)}`:message.textContent;
      pages.textContent=`${page+1} / ${count}`;prev.disabled=page===0||mode!=='ready';next.disabled=page>=count-1||mode!=='ready';
    }
    search.addEventListener('input',()=>{page=0;draw();});filter.addEventListener('change',()=>{page=0;draw();});state.addEventListener('change',draw);
    q('[data-reset-filters]',panel).addEventListener('click',()=>{search.value='';filter.value='';page=0;draw();search.focus();});
    retry.addEventListener('click',()=>{state.value='ready';search.value='';filter.value='';page=0;draw();search.focus();notify('已恢复本地示例记录');});
    prev.addEventListener('click',()=>{page--;draw();});next.addEventListener('click',()=>{page++;draw();});
    qa('[data-sort]',panel).forEach(button=>button.addEventListener('click',()=>{
      const index=Number(button.dataset.sort);direction=lastColumn===index?-direction:1;lastColumn=index;
      sorted.sort((a,b)=>a.cells[index].textContent.localeCompare(b.cells[index].textContent,undefined,{numeric:true})*direction);
      const body=q('tbody',panel);sorted.forEach(row=>body.append(row));qa('th',panel).forEach(th=>th.removeAttribute('aria-sort'));button.closest('th').setAttribute('aria-sort',direction===1?'ascending':'descending');page=0;draw();
    }));draw();
  });
  qa('[data-form]').forEach(form=>{
    form.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;q('[data-feedback]',form).textContent='已完成本地校验，未提交至服务器。';notify('表单校验通过 · 原型数据仅在当前页面展示');});
    form.addEventListener('reset',()=>q('[data-feedback]',form).textContent='');
  });
  qa('[data-tabs]').forEach(group=>{
    const tabs=qa('[role=tab]',group),panels=qa('[role=tabpanel]',group);
    function select(tab,focus){tabs.forEach(t=>{t.setAttribute('aria-selected',String(t===tab));t.tabIndex=t===tab?0:-1;});panels.forEach(p=>p.hidden=p.id!==tab.getAttribute('aria-controls'));if(focus)tab.focus();}
    tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>select(tab,false));tab.addEventListener('keydown',event=>{let index;if(event.key==='ArrowRight')index=(i+1)%tabs.length;if(event.key==='ArrowLeft')index=(i+tabs.length-1)%tabs.length;if(event.key==='Home')index=0;if(event.key==='End')index=tabs.length-1;if(index!==undefined){event.preventDefault();select(tabs[index],true);}});});
  });
  qa('[data-task-move]').forEach(select=>select.addEventListener('change',()=>{
    const board=select.closest('.kanban'),task=select.closest('.task'),target=qa('[data-column]',board).find(c=>c.dataset.column===select.value);target.append(task);qa('[data-column]',board).forEach(column=>q('[data-count]',column).textContent=qa('.task',column).length);notify('任务状态已在当前页面更新');
  }));
  const dialog=q('#create-dialog'),opener=q('[data-open-dialog]');
  opener.addEventListener('click',()=>dialog.showModal());q('[data-close-dialog]',dialog).addEventListener('click',()=>dialog.close());
  q('form',dialog).addEventListener('submit',event=>{event.preventDefault();if(!event.target.reportValidity())return;dialog.close();notify('已创建本地草稿：'+new FormData(event.target).get('title')+'（未连接后端）');event.target.reset();opener.focus();});
})();
