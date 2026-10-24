// Development-only verification. Uses the host project's existing Playwright.
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tempRoot=path.resolve(root,'..','temp');fs.mkdirSync(tempRoot,{recursive:true});
const output=fs.mkdtempSync(path.join(tempRoot,'ucd-browser-'));
const browser=await chromium.launch({headless:true});
const violations=[],errors=[];let pages=0;
try{
 for(const mode of ['single','library','editable']){
  for(const layout of ['dashboard','admin','workbench','form','detail','kanban']){
   const out=path.join(output,`${layout}-${mode}`);
   if(!fs.existsSync(path.join(out,'manifest.json')))execFileSync('python',[path.join(root,'scripts/ucd.py'),'init','--layout',layout,'--mode',mode,'--out',out]);
   else execFileSync('python',[path.join(root,'scripts/ucd.py'),'build','--dir',out]);
   const page=await browser.newPage({viewport:{width:1440,height:1080},reducedMotion:'reduce'});
   page.on('request',req=>{if(!/^(file|data):/.test(req.url()))violations.push(req.url());});
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(pathToFileURL(path.join(out,'index.html')).href);pages++;
   await page.locator('[data-open-dialog]').click();await page.locator('dialog').waitFor({state:'visible'});
   await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').isVisible(),false);
   assert.equal(await page.locator('[data-open-dialog]').evaluate(el=>el===document.activeElement),true);
   await page.locator('[data-open-dialog]').click();await page.locator('dialog input[name=title]').fill('离线测试草稿');await page.locator('dialog input[name=owner]').fill('示例成员');await page.locator('dialog button[type=submit]').click();assert.match(await page.locator('#toast').textContent(),/离线测试草稿/);
   if(['dashboard','admin'].includes(layout)){
    const table=page.locator('[data-table]');assert.equal(await table.locator('tbody tr:visible').count(),5);
    await table.locator('[data-next]').click();assert.match(await table.locator('[data-pages]').textContent(),/2 \/ 2/);
    await table.locator('[data-search]').fill('不存在的词');assert.equal(await table.locator('tbody tr:visible').count(),0);assert.equal(await table.locator('[data-empty]').isVisible(),true);
    await table.locator('[data-search]').fill('');await table.locator('[data-filter]').selectOption('待审批');assert.equal(await table.locator('tbody tr:visible').count(),4);
    await table.locator('[data-sort="0"]').click();assert.equal(await table.locator('th').first().getAttribute('aria-sort'),'ascending');
    await table.locator('summary').click();await table.locator('[data-state]').selectOption('error');assert.match(await table.locator('[data-state-message]').textContent(),/无法加载/);await table.locator('[data-state]').selectOption('ready');
   }
   if(layout==='form'){
    const form=page.locator('[data-form]');await form.locator('input[required]').nth(0).fill('测试申请');await form.locator('input[type=email]').fill('test@example.internal');await form.locator('input[type=date]').fill('2026-10-30');await form.locator('textarea').fill('脱敏示例申请说明');await form.locator('button[type=submit]').click();assert.match(await form.locator('[data-feedback]').textContent(),/未提交/);
   }
   if(layout==='detail'){
    const tabs=page.locator('[role=tab]');await tabs.nth(0).focus();await page.keyboard.press('ArrowRight');assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');assert.equal(await page.locator('[role=tabpanel]:visible').count(),1);
   }
   if(layout==='kanban'){
    const board=page.locator('.kanban'),before=await board.locator('[data-column="1"] .task').count();await board.locator('[data-column="0"] [data-task-move]').first().selectOption('1');assert.equal(await board.locator('[data-column="1"] .task').count(),before+1);
   }
   if(mode==='single'&&layout==='dashboard'){
    await page.reload();await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(output,'dashboard-desktop.png'),fullPage:true});
   }
   await page.setViewportSize({width:375,height:812});
   const width=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(width.content<=width.viewport+1,`${layout}/${mode}: horizontal overflow ${JSON.stringify(width)}`);
   if(mode==='single'&&layout==='dashboard'){
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(output,'dashboard-mobile.png'),fullPage:true});
   }
   await page.close();
  }
 }
 const matrixPages=pages;
 // Validate the shipped gallery and all nine artifacts, including local PNG assets.
 const examples=['','dashboard','admin','workbench','form','detail','kanban','components','library','editable'];
 for(const example of examples){
  const page=await browser.newPage({viewport:{width:1440,height:1080},reducedMotion:'reduce'});
  page.on('request',req=>{if(!/^(file|data):/.test(req.url()))violations.push(req.url());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.join(root,'demo',example,'index.html')).href);pages++;
  assert.equal(await page.locator('h1').count(),1);
  if(example==='components')assert.equal(await page.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  if(!example)await page.screenshot({path:path.join(output,'gallery.png'),fullPage:true});
  if(example==='kanban')await page.screenshot({path:path.join(output,'kanban-dark.png'),fullPage:true});
  if(example==='dashboard')await page.screenshot({path:path.join(output,'shipped-dashboard.png'),fullPage:true});
  await page.setViewportSize({width:375,height:812});
  const width=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(width.content<=width.viewport+1,`shipped ${example}: horizontal overflow`);
  await page.close();
 }
 assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,matrixPages,shippedPages:examples.length,pages,viewports:pages*2,externalRequests:violations.length,pageErrors:errors.length,screenshots:output},null,2));
}finally{await browser.close();}
