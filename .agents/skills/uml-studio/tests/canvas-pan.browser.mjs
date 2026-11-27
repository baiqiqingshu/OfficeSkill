import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

// Chord-pan (left+right held together) gestures against the built offline HTML.
// The second button of a chord arrives as pointermove with buttons === 3, not pointerdown.
test('chord panning scrolls the viewport, cancels drags and never selects or menus', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('../demo-dist/index.html', import.meta.url).href);
    await page.waitForFunction(() => window.UmlStudio);
    await page.evaluate(() => window.UmlStudio.ready);
    // A wide, tall flowchart so the artboard overflows the viewport at 100%.
    const spec = {
      version: 1, type: 'flowchart', title: '平移验证', direction: 'LR',
      nodes: Array.from({ length: 32 }, (_, i) => ({ id: `n${i}`, label: `节点 ${i}` })),
      // Four disconnected chains: the chains are wide, stacking them is tall.
      edges: Array.from({ length: 32 - 4 }, (_, i) => {
        const within = i % 7, chain = Math.floor(i / 7);
        return { from: `n${chain * 8 + within}`, to: `n${chain * 8 + within + 1}` };
      }),
    };
    await page.evaluate(spec => window.UmlStudio.setSpec(spec), spec);
    const stage = page.locator('.canvas-stage');
    const scroll = () => page.evaluate(() => {
      const el = document.querySelector('.canvas-stage');
      return { left: el.scrollLeft, top: el.scrollTop, scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight };
    });
    const adjustments = () => page.evaluate(() => window.UmlStudio.getSpec().layout?.adjustments ?? null);
    const inspectorText = () => page.evaluate(() => document.querySelector('.studio-inspector')?.textContent ?? '');
    const menuVisible = () => page.evaluate(() => !!document.querySelector('.context-menu'));
    // Guarantee overflow: original size, then zoom in until scrollable.
    await page.getByRole('button', { name: '原始大小', exact: true }).click();
    for (let i = 0; i < 14; i++) {
      const now = await scroll();
      if (now.scrollW > now.clientW + 50 && now.scrollH > now.clientH + 50) break;
      await page.getByRole('button', { name: '放大', exact: true }).click();
    }
    await page.waitForTimeout(200);
    const overflow = await scroll();
    assert.ok(overflow.scrollW > overflow.clientW + 50 && overflow.scrollH > overflow.clientH + 50, `canvas must overflow: ${JSON.stringify(overflow)}`);
    const footer = await page.locator('.canvas-footer').textContent();
    assert.ok(footer.includes('左右键同按'), 'footer hints at the chord pan');

    // Geometry helpers: a hit-tested blank point inside the stage and the center of a node.
    const blank = async () => {
      const box = await stage.boundingBox();
      for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.85], [0.85, 0.5], [0.15, 0.85], [0.85, 0.15], [0.5, 0.15], [0.15, 0.5], [0.85, 0.85]]) {
        const x = box.x + box.width * fx, y = box.y + box.height * fy;
        const elementHit = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (!el || !document.querySelector('.canvas-stage')?.contains(el)) return 'outside';
          return el.closest('[data-editor-key], [data-adjustment-key], [data-waypoint-key], .canvas-edge-hit') ? 'element' : 'blank';
        }, { x, y });
        if (elementHit === 'blank') return { x, y };
      }
      throw new Error('no blank canvas point found');
    };
    const nodeCenter = async key => {
      await page.locator(`.canvas-svg [data-editor-key="${key}"]`).first().scrollIntoViewIfNeeded();
      const box = await page.locator(`.canvas-svg [data-editor-key="${key}"]`).first().boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    assert.ok(await page.locator('.canvas-svg [data-editor-key="nodes/0"]').count() > 0, 'nodes render');

    // --- Positive control: plain blank left-drag pans the viewport. ---
    {
      const before = await scroll();
      const at = await blank();
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x - 90, at.y - 70, { steps: 4 });
      await page.mouse.up();
      const after = await scroll();
      assert.ok(after.left !== before.left || after.top !== before.top, `blank drag should pan: ${JSON.stringify({ before, after })}`);
      assert.equal(await menuVisible(), false);
    }

    // --- Chord from blank: left then right held, drag pans; no menu, no selection afterwards. ---
    {
      const beforeInspector = await inspectorText();
      const before = await scroll();
      const at = await blank();
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x - 12, at.y - 12, { steps: 2 });
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(at.x - 120, at.y - 100, { steps: 5 });
      await page.mouse.up({ button: 'right' });
      await page.mouse.up();
      await page.waitForTimeout(150);
      const after = await scroll();
      assert.ok(after.left !== before.left || after.top !== before.top, `chord should pan: ${JSON.stringify({ before, after })}`);
      assert.equal(await menuVisible(), false, 'no context menu after chord release');
      assert.equal(await inspectorText(), beforeInspector, 'chord must not select anything');
    }

    // --- Chord from an element mid-drag: pan takes over, element position is NOT committed. ---
    {
      assert.equal(await adjustments(), null, 'no adjustments before the drag');
      const at = await nodeCenter('nodes/5');
      const before = await scroll();
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x + 34, at.y + 26, { steps: 4 }); // element drag preview begins
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(at.x + 34 - 110, at.y + 26 - 90, { steps: 5 }); // chord pans instead
      const mid = await scroll();
      await page.mouse.up({ button: 'right' });
      await page.mouse.up();
      await page.waitForTimeout(150);
      assert.ok(mid.left !== before.left || mid.top !== before.top, `chord should pan mid-drag: ${JSON.stringify({ before, mid })}`);
      assert.equal(await adjustments(), null, 'cancelled drag must not commit a position');
      assert.equal(await menuVisible(), false);
      const text = await inspectorText();
      assert.ok(!text.includes('nodes/5'), 'release after the chord must not click-select the element');
    }

    // --- Positive control: a plain element drag does commit, then reset. ---
    {
      const at = await nodeCenter('nodes/5');
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x + 60, at.y + 40, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      assert.ok(await adjustments(), `plain drag should commit: ${JSON.stringify(await adjustments())}`);
      await page.evaluate(spec => window.UmlStudio.setSpec(spec), spec);
      await page.waitForTimeout(400);
      assert.equal(await adjustments(), null);
    }

    // --- Chord cancels an armed right-drag marquee without selecting. ---
    {
      const beforeInspector = await inspectorText();
      const at = await blank();
      await page.mouse.move(at.x, at.y);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(at.x - 160, at.y - 140, { steps: 4 });
      assert.equal(await page.locator('.canvas-marquee').count(), 1, 'right drag arms the marquee');
      await page.mouse.down();
      await page.mouse.move(at.x - 220, at.y - 190, { steps: 3 });
      assert.equal(await page.locator('.canvas-marquee').count(), 0, 'chord discards the marquee');
      await page.mouse.up();
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(150);
      assert.equal(await menuVisible(), false, 'no context menu after the chord');
      assert.equal(await inspectorText(), beforeInspector, 'cancelled marquee must not select');
    }

    // --- Connect mode: chord release must not pick nodes; a real click still connects. ---
    {
      const edgeCount = await page.evaluate(() => window.UmlStudio.getSpec().edges.length);
      await page.getByRole('button', { name: '连线', exact: true }).click();
      await page.locator('.canvas-svg [data-editor-key="nodes/2"]').first().scrollIntoViewIfNeeded();
      const a = await nodeCenter('nodes/2');
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.up(); // pick the source node
      await page.waitForTimeout(150);
      const blankAt = await blank();
      await page.mouse.move(blankAt.x, blankAt.y);
      await page.mouse.down();
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(blankAt.x - 130, blankAt.y - 110, { steps: 4 });
      await page.mouse.up({ button: 'right' });
      await page.mouse.up();
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => window.UmlStudio.getSpec().edges.length), edgeCount, 'chord release must not create a connection');
      assert.equal(await menuVisible(), false);
      await page.locator('.canvas-svg [data-editor-key="nodes/9"]').first().scrollIntoViewIfNeeded();
      const b = await nodeCenter('nodes/9');
      await page.mouse.move(b.x, b.y);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window.UmlStudio.getSpec().edges.length), edgeCount + 1, 'a genuine click completes the connection');
      await page.getByRole('button', { name: '选择', exact: true }).click();
    }

    await page.screenshot({ path: fileURLToPath(new URL('../../../../temp/uml-chord-pan-verified.png', import.meta.url)), fullPage: false });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
