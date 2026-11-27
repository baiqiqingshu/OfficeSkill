import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

// Runs against the built, self-contained HTML. Covers the modal form editor: custom dropdowns,
// folding, content search, draft semantics and small-viewport behavior. Canvas gestures live in
// canvas-pan.browser.mjs; the editor drawer is modal, so the canvas is not clickable while open.
test('offline editor filters, folds and preserves drafts in the modal form editor', async () => {
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
    await page.getByRole('button', { name: '更多操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '完整编辑（表单 / JSON）' }).click();
    const form = page.locator('.uml-form-editor');
    assert.equal(await form.count(), 1, 'form editor opens');

    // Custom dropdowns: trigger mirrors the model, popup commits through the hidden native select.
    await form.getByRole('button', {name:'全部展开', exact:true}).click();
    const firstCard = form.locator('[data-editor-key="nodes/0"]').first();
    const kindSelect = firstCard.locator('select.v-select-native').first();
    const kindTrigger = firstCard.locator('.v-select-trigger').first();
    const pop = page.locator('.v-select-pop');
    assert.match((await kindTrigger.locator('.v-select-value').textContent()).trim(), /\S/);
    await kindTrigger.click();
    assert.equal(await pop.isVisible(), true);
    const secondValue = await kindSelect.evaluate(el => el.options[2].value);
    await pop.getByRole('option').nth(2).click();
    assert.equal(await kindSelect.inputValue(), secondValue);
    assert.equal(
      (await kindTrigger.locator('.v-select-value').textContent()).trim(),
      await kindSelect.evaluate(el => el.selectedOptions[0].textContent.trim()),
    );
    await kindTrigger.focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await pop.isVisible(), true);
    await page.keyboard.press('End');
    await page.keyboard.press('Escape');
    assert.equal(await pop.isVisible(), false);
    assert.equal(await kindTrigger.evaluate(el => el === document.activeElement), true);
    // The kind edit stays a draft: the exported spec is unchanged until 应用表单.
    assert.equal(await page.evaluate(() => window.UmlStudio.getSpec().nodes[0].kind ?? ''), '');

    // Folding and unfolding every details element at once.
    const search = form.getByRole('searchbox');
    await form.getByRole('button', {name:'全部折叠', exact:true}).click();
    assert.equal(await form.locator('details[open]').count(), 0);
    await form.getByRole('button', {name:'全部展开', exact:true}).click();
    assert.equal(await form.locator('details:not([open])').count(), 0);

    // Content search keeps only hits and their required ancestors.
    await search.fill('needle');
    assert.equal(await form.locator('.uml-editor-card:visible').count(), 1);
    assert.equal(await form.locator('[data-editor-key="nodes/11"]').isVisible(), true);
    await search.fill('不存在的内容');
    assert.equal(await form.locator('.uml-editor-card:visible').count(), 0);
    assert.equal(await form.getByRole('status').textContent(), '没有匹配的元素。');
    await search.fill('');

    // A rename stays a draft through filtering; exported data stays applied.
    const card = form.locator('[data-editor-key="nodes/11"]').first();
    await card.getByLabel('名称', {exact:true}).fill('尚未应用的名称');
    await search.fill('尚未应用');
    assert.equal(await form.locator('.uml-editor-card:visible').count(), 1);
    assert.equal(await page.evaluate(() => window.UmlStudio.getSpec().nodes[11].label), '节点 11');
    await search.fill('');
    // 重置表单 discards the draft; editing again and 应用表单 commits it.
    await form.getByRole('button', {name:'重置表单', exact:true}).click();
    assert.equal(await card.getByLabel('名称', {exact:true}).inputValue(), '节点 11');
    await card.getByLabel('名称', {exact:true}).fill('改名后的节点');
    await form.getByRole('button', {name:'应用表单', exact:true}).click();
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.UmlStudio.getSpec().nodes[11].label), '改名后的节点');

    // Sequence and fishbone forms render their own card kinds.
    await page.evaluate(() => window.UmlStudio.selectDiagram('checkout-sequence'));
    await page.waitForTimeout(400);
    assert.ok(await form.locator('[data-editor-key^="participants/"]').count() > 0, 'sequence participants render');
    assert.ok(await form.locator('[data-editor-key^="messages/"]').count() > 0, 'sequence messages render');
    assert.ok(await form.locator('[data-editor-key^="fragments/"]').count() > 0, 'sequence fragments render');
    await page.evaluate(() => window.UmlStudio.selectDiagram('incident-causes'));
    await page.waitForTimeout(400);
    assert.ok(await form.locator('.uml-cause-editor').count() > 0, 'fishbone causes render');

    // Narrow viewport: folding and search still work without horizontal overflow.
    await page.setViewportSize({width: 390, height: 844});
    await form.getByRole('button', {name:'全部折叠', exact:true}).click();
    assert.equal(await form.locator('details[open]').count(), 0);
    await search.fill('值班交接');
    assert.ok(await form.locator('.uml-cause-editor:visible').count() > 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({width: 1600, height: 1100});
    await page.screenshot({path: fileURLToPath(new URL('../../../../temp/uml-editor-verified.png', import.meta.url)), fullPage: true});
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
