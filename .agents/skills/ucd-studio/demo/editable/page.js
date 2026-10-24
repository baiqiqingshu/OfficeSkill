/* UCD Studio 1.0.0 — offline, original vanilla JS. No network or storage. */
(()=>{'use strict';
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const toast=q('#toast');let toastTimer;
  function notify(message){toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,3600);}
  qa('[data-notify]').forEach(button=>button.addEventListener('click',()=>notify(button.dataset.notify)));
  qa('.nav-list a').forEach(a=>a.addEventListener('click',()=>{qa('.nav-list a').forEach(n=>{n.classList.remove('active');n.removeAttribute('aria-current');});a.classList.add('active');a.setAttribute('aria-current','location');}));
  qa('[data-table]').forEach(panel=>{
    const rows=qa('tbody tr',panel), search=q('[data-search]',panel), filter=q('[data-filter]',panel), status=q('[data-table-status]',panel), state=q('[data-state]',panel), message=q('[data-state-message]',panel), empty=q('[data-empty]',panel), table=q('.table-scroll',panel), prev=q('[data-prev]',panel),next=q('[data-next]',panel), pages=q('[data-pages]',panel);
    let page=0,sorted=[...rows],direction=1,lastColumn=-1;const size=Number(panel.dataset.pageSize)||5;
    function draw(){
      const term=search.value.trim().toLocaleLowerCase(), selected=filter.value;
      const visible=sorted.filter(r=>r.textContent.toLocaleLowerCase().includes(term)&&(!selected||r.dataset.status===selected));
      const count=Math.max(1,Math.ceil(visible.length/size));page=Math.max(0,Math.min(page,count-1));
      rows.forEach(r=>r.hidden=true);visible.slice(page*size,(page+1)*size).forEach(r=>r.hidden=false);
      const mode=state.value;table.hidden=mode!=='ready';message.hidden=mode==='ready';message.textContent={loading:'正在加载示例记录…',error:'暂时无法加载。切换到“正常”可重试。',empty:'暂无记录，创建第一项任务。'}[mode]||'';
      empty.hidden=mode!=='ready'||visible.length>0;status.textContent=mode==='ready'?`共 ${visible.length} 项 · 当前 ${visible.length?page*size+1:0}–${Math.min((page+1)*size,visible.length)}`:message.textContent;
      pages.textContent=`${page+1} / ${count}`;prev.disabled=page===0||mode!=='ready';next.disabled=page>=count-1||mode!=='ready';
    }
    search.addEventListener('input',()=>{page=0;draw();});filter.addEventListener('change',()=>{page=0;draw();});state.addEventListener('change',draw);
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
