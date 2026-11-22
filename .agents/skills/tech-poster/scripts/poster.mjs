#!/usr/bin/env node
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, extname, basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { THEMES, BACKGROUNDS, SECTION_TYPES, renderPosterHtml, extractSpecFromHtml } from './render.mjs';
import { auditHtmlOffline } from './audit.mjs';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `Tech Poster — 内网离线技术分享长图海报生成与导出工具（零外网依赖）

用法：
  node scripts/poster.mjs input.json --out poster.html --png poster.png
  node scripts/poster.mjs input.json --out poster.html --png poster.png --scale 2 --split
  node scripts/poster.mjs --json '{"title":"...","sections":[...]}' --out poster.html --png poster.png
  node scripts/poster.mjs saved.html --set theme=slate-dark --out dark.html --png dark.png
  node scripts/poster.mjs saved.html --png poster.png
  node scripts/poster.mjs saved.html --audit-only
  node scripts/poster.mjs --presets
  node scripts/poster.mjs --example

参数：
  --out <file.html>      输出自包含单文件 HTML
  --png <file.png>       离线导出高清 PNG 长图（Playwright + 本地 Edge/Chrome，严格零外网拦截）
  --scale <1..3>         PNG 缩放倍率（默认 2，如 1080px × 2 = 2160px 宽）
  --split                额外按栏目 [data-poster-panel] 导出分段独立 PNG（<png名>-panels/）
  --theme <name>         覆盖色彩主题：blueprint | slate-dark | paper-tech | emerald-ops
  --bg <name>            覆盖画布背景（默认 everest-blue 珠峰蓝；运行 --presets 查看全部 5 套）
  --width <px>           覆盖逻辑宽度（720..1600，默认 1080）
  --set <k=v>            增量修改 spec 字段（可重复，如 --set title="新标题"）
  --json <str>           直接传入 JSON 字符串（免建临时文件）
  --browser <type>       强制浏览器：msedge | chrome | chromium（默认自动探测）
  --audit-only           仅执行静态离线安全审计，不导出图片
  --presets              打印全部内置主题与栏目类型
  --example              打印完整示例 JSON
`;

function parseArgs(argv) {
  const opts = { sets: [], scale: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (['--split', '--audit-only', '--presets', '--example'].includes(a)) opts[a.slice(2)] = true;
    else if (a === '-') {
      if (opts.input) throw new Error('只能指定一个输入源');
      opts.input = '-';
    } else if (['--out', '--png', '--scale', '--theme', '--bg', '--width', '--set', '--json', '--browser'].includes(a)) {
      if (i + 1 >= argv.length) throw new Error(`${a} 缺少参数值`);
      const val = argv[++i];
      if (a === '--set') opts.sets.push(val);
      else if (a === '--scale') opts.scale = Number(val);
      else if (a === '--width') opts.width = Number(val);
      else opts[a.slice(2)] = val;
    } else if (a.startsWith('-')) {
      throw new Error(`未知参数: ${a}`);
    } else {
      if (opts.input) throw new Error('只能指定一个输入文件');
      opts.input = a;
    }
  }
  return opts;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function applySets(obj, pairs) {
  if (!pairs.length) return obj;
  const out = structuredClone(obj);
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq < 1) throw new Error(`--set 格式须为 key=value：${pair}`);
    const key = pair.slice(0, eq).trim();
    const rawVal = pair.slice(eq + 1);
    let val;
    try { val = JSON.parse(rawVal); } catch { val = rawVal; }

    const parts = key.split('.').filter(Boolean);
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (Array.isArray(cur) && /^\d+$/.test(p)) {
        cur = cur[Number(p)];
      } else {
        if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
        cur = cur[p];
      }
    }
    const last = parts[parts.length - 1];
    if (Array.isArray(cur) && /^\d+$/.test(last)) cur[Number(last)] = val;
    else cur[last] = val;
  }
  return out;
}

function readPngDimensions(buf) {
  if (!buf || buf.length < 24) return null;
  // PNG 魔数 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function loadPlaywright() {
  // 依次从脚本所在目录和当前工作目录向上查找 playwright / playwright-core
  const roots = [process.cwd(), SKILL_ROOT];
  for (const base of roots) {
    const req = createRequire(resolve(base, 'package.json'));
    for (const pkg of ['playwright', 'playwright-core']) {
      try {
        return req(pkg);
      } catch {
        // 继续尝试下一个候选
      }
    }
  }
  throw new Error('未找到 playwright 或 playwright-core，请确认仓库已安装本地依赖（无需联网下载浏览器，可复用本机 Edge/Chrome）');
}

async function launchOfflineBrowser(chromium, preferred) {
  const candidates = preferred
    ? [preferred]
    : ['msedge', 'chrome', 'chromium'];

  const errs = [];
  for (const cand of candidates) {
    try {
      const browser = cand === 'chromium'
        ? await chromium.launch({ headless: true })
        : await chromium.launch({ channel: cand, headless: true });
      return { browser, channel: cand };
    } catch (e) {
      errs.push(`${cand}: ${e.message.split('\n')[0]}`);
    }
  }
  throw new Error(`无法启动本地无头浏览器（已尝试 ${candidates.join(', ')}）：\n  ${errs.join('\n  ')}`);
}

export async function exportHtmlToPng(htmlPath, pngPath, options = {}) {
  const scale = Number.isFinite(options.scale) ? Math.max(1, Math.min(3, options.scale)) : 2;
  const split = Boolean(options.split);
  const { chromium } = loadPlaywright();
  const { browser, channel } = await launchOfflineBrowser(chromium, options.browser);

  const blockedRequests = [];
  try {
    const context = await browser.newContext({
      viewport: { width: Math.max(1280, (options.width || 1080) + 120), height: 900 },
      deviceScaleFactor: scale
    });
    const page = await context.newPage();

    // 运行时零外网拦截器：任何非本地文件/data URI 请求直接阻断并记录违规
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (/^(?:file:|data:|blob:|about:)/i.test(url)) {
        return route.continue();
      }
      blockedRequests.push({
        method: route.request().method(),
        resourceType: route.request().resourceType(),
        url
      });
      return route.abort('blockedbyclient');
    });

    await page.goto(pathToFileURL(resolve(htmlPath)).href, { waitUntil: 'load' });
    await page.evaluate(async () => {
      document.body.classList.add('export-mode');
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const imgs = [...document.querySelectorAll('img')];
      await Promise.all(imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((res) => {
          img.addEventListener('load', res, { once: true });
          img.addEventListener('error', res, { once: true });
        });
      }));
    });

    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector('#poster-canvas') || document.body;
      const rect = canvas.getBoundingClientRect();
      const imgs = [...canvas.querySelectorAll('img')];
      const brokenImages = imgs
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .map((img) => img.alt || img.src.slice(0, 60));

      // 检查是否有子元素横向溢出画布
      const overflowNodes = [];
      for (const el of canvas.querySelectorAll('section, article, table, svg, pre, figure')) {
        const r = el.getBoundingClientRect();
        if (r.right > rect.right + 2 || r.left < rect.left - 2) {
          overflowNodes.push(`${el.tagName.toLowerCase()}.${(el.className && typeof el.className === 'string' ? el.className : '').split(' ')[0] || ''}`);
        }
      }

      return {
        cssWidth: Math.round(rect.width),
        cssHeight: Math.round(rect.height),
        horizontalOverflow: canvas.scrollWidth > canvas.clientWidth + 1,
        overflowNodes: overflowNodes.slice(0, 8),
        brokenImages,
        panelCount: canvas.querySelectorAll('[data-poster-panel]').length
      };
    });

    if (blockedRequests.length > 0) {
      throw new Error(
        `运行时离线安全拦截触发！检测到 ${blockedRequests.length} 个外网请求：\n` +
        blockedRequests.map((r) => `  - [${r.resourceType}] ${r.url}`).join('\n')
      );
    }

    if (metrics.brokenImages.length > 0) {
      throw new Error(`导出中止：存在无法解码的图片：${metrics.brokenImages.join(', ')}`);
    }

    await mkdir(dirname(resolve(pngPath)), { recursive: true });
    const canvasLocator = (await page.locator('#poster-canvas').count()) > 0
      ? page.locator('#poster-canvas')
      : page.locator('body');

    await canvasLocator.screenshot({ path: resolve(pngPath), type: 'png' });
    const pngBuf = await readFile(resolve(pngPath));
    const dims = readPngDimensions(pngBuf);
    if (!dims) {
      throw new Error(`导出的 PNG 校验失败（非有效 PNG 文件）：${pngPath}`);
    }

    const panels = [];
    if (split) {
      const panelDir = join(dirname(resolve(pngPath)), `${basename(pngPath, extname(pngPath))}-panels`);
      await mkdir(panelDir, { recursive: true });
      const locators = page.locator('[data-poster-panel]');
      const count = await locators.count();
      for (let i = 0; i < count; i++) {
        const item = locators.nth(i);
        const key = (await item.getAttribute('data-poster-panel')) || String(i + 1).padStart(2, '0');
        const safeKey = key.replace(/[^a-zA-Z0-9_-]+/g, '-');
        const outFile = join(panelDir, `panel-${safeKey}.png`);
        await item.screenshot({ path: outFile, type: 'png' });
        const pBuf = await readFile(outFile);
        const pDims = readPngDimensions(pBuf);
        panels.push({ file: outFile, width: pDims?.width || 0, height: pDims?.height || 0 });
      }
    }

    return {
      browser: channel,
      scale,
      pngPath: resolve(pngPath),
      pixelWidth: dims.width,
      pixelHeight: dims.height,
      cssWidth: metrics.cssWidth,
      cssHeight: metrics.cssHeight,
      horizontalOverflow: metrics.horizontalOverflow,
      overflowNodes: metrics.overflowNodes,
      runtimeBlockedRequests: blockedRequests.length,
      panels
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  if (opts.presets) {
    console.log('=== 内置技术分享色彩主题（--theme） ===');
    for (const [k, v] of Object.entries(THEMES)) {
      console.log(`  - ${k.padEnd(14)} ${v.name}：${v.desc}`);
    }
    console.log('\n=== 内置画布背景（--bg，默认 everest-blue 珠峰蓝） ===');
    for (const [k, v] of Object.entries(BACKGROUNDS)) {
      console.log(`  - ${k.padEnd(16)} ${v.name}：${v.desc}`);
    }
    console.log('\n=== 支持的栏目类型（sections[].type） ===');
    console.log('  ' + SECTION_TYPES.join(', '));
    return;
  }

  if (opts.example) {
    const exPath = join(SKILL_ROOT, 'examples', 'gateway-framework.json');
    console.log(await readFile(exPath, 'utf8'));
    return;
  }

  if (!opts.input && !opts.json) {
    console.error('错误：请提供输入 JSON/HTML 文件、--json 参数或使用 --help 查看用法');
    process.exit(1);
  }

  let html = '';
  let spec = null;
  let baseDir = process.cwd();
  let sourceHtmlPath = null;

  const isHtmlInput = opts.input && opts.input !== '-' && extname(opts.input).toLowerCase() === '.html';
  const needRebuild = Boolean(opts.json || !isHtmlInput || opts.theme || opts.bg || opts.width || opts.sets.length > 0);

  if (opts.json) {
    spec = JSON.parse(opts.json);
  } else if (opts.input === '-') {
    spec = JSON.parse(await readStdin());
  } else if (isHtmlInput) {
    sourceHtmlPath = resolve(opts.input);
    baseDir = dirname(sourceHtmlPath);
    const rawHtml = await readFile(sourceHtmlPath, 'utf8');
    if (needRebuild) {
      spec = extractSpecFromHtml(rawHtml);
    } else {
      html = rawHtml;
    }
  } else {
    const inPath = resolve(opts.input);
    baseDir = dirname(inPath);
    spec = JSON.parse(await readFile(inPath, 'utf8'));
  }

  if (spec) {
    if (opts.theme) spec.theme = opts.theme;
    if (opts.bg) spec.background = opts.bg;
    if (opts.width) spec.width = opts.width;
    spec = applySets(spec, opts.sets);
    html = await renderPosterHtml(spec, { baseDir });
  }

  // 强制静态离线安全审计
  const audit = auditHtmlOffline(html);
  if (!audit.ok) {
    console.error('❌ 离线安全审计未通过！检测到以下外网风险，已阻断交付：');
    for (const err of audit.errors) {
      console.error(`  [L${err.line}] (${err.rule}) ${err.detail}`);
    }
    process.exit(2);
  }

  if (opts['audit-only']) {
    console.log(JSON.stringify({ status: 'pass', audit }, null, 2));
    return;
  }

  let htmlPathToRender = sourceHtmlPath;
  let tempDir = null;

  if (opts.out) {
    const outPath = resolve(opts.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, html, 'utf8');
    htmlPathToRender = outPath;
  } else if (opts.png && needRebuild) {
    tempDir = await mkdtemp(join(tmpdir(), 'tech-poster-'));
    htmlPathToRender = join(tempDir, 'poster.html');
    await writeFile(htmlPathToRender, html, 'utf8');
  } else if (!opts.png) {
    // 既没指定 --out 也没指定 --png，默认报错提示
    throw new Error('请至少指定 --out <file.html>、--png <file.png> 或 --audit-only');
  }

  let exportInfo = null;
  try {
    if (opts.png) {
      exportInfo = await exportHtmlToPng(htmlPathToRender, opts.png, {
        scale: opts.scale,
        split: opts.split,
        browser: opts.browser,
        width: spec?.width
      });
    }
  } finally {
    if (tempDir && existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  const receipt = {
    status: 'ok',
    html: opts.out ? resolve(opts.out) : undefined,
    theme: spec?.theme,
    background: spec?.background,
    sections: spec?.sections?.length,
    audit: {
      ok: audit.ok,
      externalUrls: audit.externalUrls,
      warnings: audit.warnings.length
    },
    export: exportInfo || undefined
  };
  console.log(JSON.stringify(receipt, null, 2));
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  });
}
