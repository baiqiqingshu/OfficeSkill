import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

// Runs against the built, self-contained HTML, including real pointer capture.
test('offline editor filters, folds, locates elements and preserves drafts and canvas gestures', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('../demo-dist/index.html', import.meta.url).href);
    await page.waitForFunction(() => window.UmlStudio);
    await page.evaluate(() => window.UmlStudio.ready);
    const spec = {
      version: 1, type: 'flowchart', title: '交互验证',
      nodes: Array.from({length: 12}, (_, i) => ({id: `n${i}`, label: `节点 ${i}`, group: i === 0 ? 'g' : undefined, lane: i === 1 ? 'l' : undefined, detail: i === 11 ? '独有详情 NEEDLE' : undefined})),
      edges: [{from: 'n0', to: 'n11', label: '检查连线'}],
      groups: [{id: 'g', label: '业务区域'}],
      lanes: [{id: 'l', label: '审核泳道'}],
    };
    await page.evaluate(spec => window.UmlStudio.setSpec(spec), spec);
    await page.getByRole('button', { name: '编辑图表', exact: true }).click();
    const form = page.locator('.uml-form-editor');
    const search = form.getByRole('searchbox');
    await form.getByRole('button', {name:'全部折叠', exact:true}).click();
    assert.equal(await form.locator('details[open]').count(), 0);
    await form.getByRole('button', {name:'全部展开', exact:true}).click();
    assert.equal(await form.locator('details:not([open])').count(), 0);
    await search.fill('needle');
    assert.equal(await form.locator('.uml-editor-card:visible').count(), 1);
    assert.equal(await form.locator('[data-editor-key="nodes/11"]').isVisible(), true);
    await search.fill('不存在的内容');
    assert.equal(await form.locator('.uml-editor-card:visible').count(), 0);
    assert.equal(await form.getByRole('status').textContent(), '没有匹配的元素。');
    // Click the applied drawing while the target is filtered out and folded.
    await form.getByRole('button', {name:'全部折叠', exact:true}).click();
    await page.locator('.canvas-svg [data-editor-key="nodes/11"] text').first().click();
    const selected = form.locator('.uml-editor-selected');
    assert.equal(await selected.getAttribute('data-editor-key'), 'nodes/11');
    assert.equal(await selected.getAttribute('open'), '');
    assert.equal(await search.inputValue(), '');
    const position = await selected.evaluate(el => {
      const panel=el.closest('.form-panel').getBoundingClientRect();
      const card=el.getBoundingClientRect();
      return {top:card.top-panel.top, viewport:panel.height, scroll:el.closest('.form-panel').scrollTop};
    });
    assert.ok(position.top >= 100 && position.top < position.viewport - 40, JSON.stringify(position));
    assert.ok(position.scroll > 0);
    // A rename stays a draft through filtering; exported data stays applied.
    await selected.getByLabel('名称', {exact:true}).fill('尚未应用的名称');
    await search.fill('尚未应用');
    assert.equal(await form.locator('.uml-editor-card:visible').count(), 1);
    assert.equal(await page.evaluate(() => window.UmlStudio.getSpec().nodes[11].label), '节点 11');
    await search.fill('');
    // Drag starting on another node must not select it.
    const box = await page.locator('.canvas-svg [data-editor-key="nodes/0"] text').first().boundingBox();
    await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+55, box.y+box.height/2+30, {steps:5});
    await page.mouse.up();
    assert.equal(await selected.getAttribute('data-editor-key'), 'nodes/11');
    await form.getByRole('button', {name:'重置表单', exact:true}).click();
    // Graph containers and anonymous edges retain distinct selection targets.
    await page.locator('.canvas-svg .uml-container[data-group-id] text').first().click();
    assert.equal(await selected.getAttribute('data-editor-key'), 'groups/0');
    await page.locator('.canvas-svg .uml-container[data-lane-id] text').first().click();
    assert.equal(await selected.getAttribute('data-editor-key'), 'lanes/0');
    await page.locator('.canvas-svg .uml-edge-label text').first().click();
    assert.equal(await selected.getAttribute('data-editor-key'), 'edges/0');
    // Sequence fragments, messages and participants use the same form navigation.
    await page.evaluate(() => window.UmlStudio.selectDiagram('checkout-sequence'));
    for (const key of ['participants/1','messages/3','fragments/0']) {
      await form.getByRole('button', {name:'全部折叠', exact:true}).click();
      await page.locator(`.canvas-svg [data-editor-key="${key}"] text`).first().click();
      assert.equal(await selected.getAttribute('data-editor-key'), key);
      assert.equal(await selected.getAttribute('open'), '');
    }
    // Recursive causes can be found and located through collapsed ancestors.
    await page.evaluate(() => window.UmlStudio.selectDiagram('incident-causes'));
    const causeKey = 'categories/0/causes/0/children/0';
    const causeLabel = await form.locator(`[data-editor-key="${causeKey}"] input`).first().inputValue();
    await search.fill(causeLabel);
    assert.ok(await form.locator('.uml-cause-editor:visible').count() > 0);
    await search.fill('不存在的内容');
    await page.locator(`.canvas-svg [data-editor-key="${causeKey}"] text`).first().click();
    assert.equal(await selected.getAttribute('data-editor-key'), causeKey);
    assert.equal(await selected.getAttribute('open'), '');
    assert.equal(await selected.locator('xpath=ancestor::details[not(@open)]').count(), 0);
    // Immutable recursive edits and sibling deletion keep applied identities.
    await selected.locator('input').first().fill('重命名的子原因');
    await page.locator(`.canvas-svg [data-editor-key="${causeKey}"] text`).first().click();
    assert.equal(await selected.getAttribute('data-editor-key'), causeKey);
    assert.equal(await selected.locator('input').first().inputValue(), '重命名的子原因');
    await form.getByRole('button', {name:'重置表单', exact:true}).click();
    const parent = form.locator('[data-editor-key="categories/0/causes/0"]');
    await parent.locator('.uml-cause-editor__row').first().getByRole('button', {name:'删除', exact:false}).click();
    assert.equal(await form.locator(`[data-editor-key="${causeKey}"]`).count(), 0);
    await page.locator(`.canvas-svg [data-editor-key="${causeKey}"] text`).first().click();
    assert.equal(await form.locator('.uml-editor-selected').count(), 0);
    await page.locator('.canvas-svg [data-editor-key="categories/0/causes/1"] text').first().click();
    assert.equal(await selected.getAttribute('data-editor-key'), 'categories/0/causes/1');
    await form.getByRole('button', {name:'重置表单', exact:true}).click();
    await page.setViewportSize({width:390, height:844});
    await form.getByRole('button', {name:'全部折叠', exact:true}).click();
    assert.equal(await form.locator('details[open]').count(), 0);
    await search.fill(causeLabel);
    assert.ok(await form.locator('.uml-cause-editor:visible').count() > 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({width:1600, height:1100});
    await search.fill('');
    await page.locator(`.canvas-svg [data-editor-key="${causeKey}"] text`).first().click();
    await page.screenshot({path: fileURLToPath(new URL('../../../../temp/uml-editor-verified.png', import.meta.url)), fullPage:true});
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
