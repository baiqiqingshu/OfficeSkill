import { readFile } from 'node:fs/promises';
import { extname, resolve, isAbsolute, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THEMES,
  BACKGROUNDS,
  SECTION_TYPES,
  esc,
  sanitizeInlineSvg,
  renderCanvasInnerHtml
} from './poster-core.mjs';

export { THEMES, BACKGROUNDS, SECTION_TYPES };

const HERE = dirname(fileURLToPath(import.meta.url));

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

const REMOTE_URL_RE = /^(?:https?:|wss?:|ftp:|\/\/)/i;

function safeJsonForHtml(obj) {
  return JSON.stringify(obj, null, 2).replace(/<\/script/gi, '<\\/script');
}

function assertLocalFilePath(filePath, fieldName) {
  const s = String(filePath ?? '').trim();
  if (!s) throw new Error(`${fieldName} 不能为空`);
  if (REMOTE_URL_RE.test(s)) {
    throw new Error(`安全拦截：${fieldName} 禁止引用远程 URL（${s}），请使用本地图片文件`);
  }
  return s;
}

async function resolveAssetInPlace(target, baseDir, options = {}) {
  const { embedMode = 'inline', fileField = 'file', svgField = 'svg', dataField = 'dataUri' } = options;

  if (target[svgField] && typeof target[svgField] === 'string') {
    sanitizeInlineSvg(target[svgField], '内联 svg');
    return;
  }
  if (target[dataField] && /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,/i.test(target[dataField])) {
    return;
  }
  if (!target[fileField]) return;

  const filePath = assertLocalFilePath(target[fileField], '图片路径');
  const fullPath = isAbsolute(filePath) ? filePath : resolve(baseDir || process.cwd(), filePath);
  const ext = extname(fullPath).toLowerCase();
  const mime = MIME_MAP[ext];
  if (!mime) {
    throw new Error(`不支持的图片格式 ${ext || '(无扩展名)'}（支持 .svg / .png / .jpg / .jpeg / .webp / .gif）：${filePath}`);
  }

  const buf = await readFile(fullPath);
  if (ext === '.svg' && embedMode !== 'datauri') {
    const rawSvg = buf.toString('utf8');
    sanitizeInlineSvg(rawSvg, filePath);
    target[svgField] = rawSvg;
    delete target[fileField];
    return;
  }
  if (ext === '.svg') {
    sanitizeInlineSvg(buf.toString('utf8'), filePath);
  }
  target[dataField] = `data:${mime};base64,${buf.toString('base64')}`;
  delete target[fileField];
}

export function normalizeSpec(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('海报配置必须是 JSON 对象');
  }
  const spec = structuredClone(raw);
  spec.version = spec.version ?? 1;
  if (!spec.title || typeof spec.title !== 'string') {
    throw new Error('海报配置缺少必填字段 title');
  }
  spec.theme = spec.theme && THEMES[spec.theme] ? spec.theme : 'blueprint';
  spec.background = spec.background && BACKGROUNDS[spec.background] ? spec.background : 'everest-blue';
  spec.width = Number.isFinite(Number(spec.width)) ? Math.max(720, Math.min(1600, Number(spec.width))) : 1080;
  if (!Array.isArray(spec.sections) || spec.sections.length === 0) {
    throw new Error('海报配置缺少必填数组 sections（至少包含 1 个栏目）');
  }
  for (let i = 0; i < spec.sections.length; i++) {
    const sec = spec.sections[i];
    if (!sec || typeof sec !== 'object') {
      throw new Error(`sections[${i}] 必须是对象`);
    }
    if (!SECTION_TYPES.includes(sec.type)) {
      throw new Error(`sections[${i}].type 不受支持: "${sec.type}"（可选: ${SECTION_TYPES.join(', ')}）`);
    }
    if (!sec.title || typeof sec.title !== 'string') {
      throw new Error(`sections[${i}] 缺少必填字段 title`);
    }
  }
  return spec;
}

function encodeSvgDataUri(svgStr) {
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr.replace(/\s+/g, ' ').trim())}")`;
}

function buildStyles(width) {
  const circuitBg = encodeSvgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><g fill="none" stroke="#1d4ed8" stroke-opacity="0.11" stroke-width="1.2"><path d="M0 24 H36 L48 36 H84 M60 0 V24 M96 0 V44 L108 56 H120 M0 84 H26 L40 70 H76 L90 84 H120 M48 70 V120"/><circle cx="36" cy="24" r="2.6" fill="#1d4ed8" fill-opacity="0.14"/><circle cx="84" cy="36" r="2.6" fill="#0891b2" fill-opacity="0.16"/><circle cx="76" cy="70" r="2.6" fill="#1d4ed8" fill-opacity="0.14"/><circle cx="26" cy="84" r="2.6" fill="#0891b2" fill-opacity="0.16"/></g></svg>'
  );

  const topoBg = encodeSvgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><g fill="none" stroke="#0284c7" stroke-opacity="0.11" stroke-width="1.15"><path d="M-20 40 C 40 10, 100 70, 160 40 S 220 20, 260 50"/><path d="M-20 96 C 50 62, 110 126, 175 90 S 225 76, 260 104"/><path d="M-20 156 C 46 124, 105 186, 178 150 S 220 132, 260 162"/><path d="M-20 212 C 52 184, 112 238, 184 206 S 228 190, 260 218"/></g></svg>'
  );

  const everestCanvasBg = encodeSvgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220"><g fill="none" stroke="#1e40af" stroke-opacity="0.065" stroke-width="1"><path d="M0 168 L58 124 L112 146 L186 76 L248 138 L312 104 L360 144"/><path d="M0 204 L74 166 L142 184 L214 126 L284 176 L360 152"/></g></svg>'
  );

  return `
:root, .tp-export-root {
  --poster-w: ${width}px;
  --font-sans: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", "Noto Sans CJK SC", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", "Fira Code", "Consolas", "SFMono-Regular", Menlo, monospace;

  /* 默认主题：blueprint（珠峰蓝 / 工程蓝图） */
  --page-bg: #dbe7f5;
  --canvas-bg: #ebf3fc;
  --grid-line: rgba(29, 78, 216, 0.055);
  --surface: rgba(255, 255, 255, 0.96);
  --surface-2: #f5f9ff;
  --border: #d2e0f3;
  --border-strong: #aec6e8;
  --text: #0f172a;
  --text-sub: #334155;
  --text-muted: #5c708a;
  --accent: #1d4ed8;
  --accent-soft: #e8f1ff;
  --accent-2: #0284c7;
  --accent-2-soft: #e6f6fe;
  --success: #059669;
  --success-soft: #ecfdf5;
  --warn: #d97706;
  --warn-soft: #fffbeb;
  --danger: #dc2626;
  --danger-soft: #fef2f2;
  --hero-bg: linear-gradient(135deg, #071a38 0%, #0f3469 48%, #1d5fd1 100%);
  --hero-text: #f8fafc;
  --hero-sub: #d7e7fb;
  --hero-pill-bg: rgba(255, 255, 255, 0.14);
  --hero-pill-border: rgba(255, 255, 255, 0.28);
  --flow-edge: #5a7291;
  --flow-group-bg: rgba(29, 78, 216, 0.045);
  --flow-group-border: #93c5fd;
  --code-bg: #0c172b;
  --code-top: #162540;
  --code-text: #e2e8f0;
  --shadow-card: 0 6px 22px rgba(15, 42, 92, 0.07);
}

[data-theme="slate-dark"], .tp-export-root[data-theme="slate-dark"] {
  --page-bg: #020617;
  --canvas-bg: #0b1324;
  --grid-line: rgba(56, 189, 248, 0.06);
  --surface: rgba(17, 27, 46, 0.94);
  --surface-2: #17243b;
  --border: #203454;
  --border-strong: #2f4b76;
  --text: #f1f5f9;
  --text-sub: #cbd5e1;
  --text-muted: #94a3b8;
  --accent: #38bdf8;
  --accent-soft: rgba(56, 189, 248, 0.15);
  --accent-2: #34d399;
  --accent-2-soft: rgba(52, 211, 153, 0.14);
  --success: #34d399;
  --success-soft: rgba(52, 211, 153, 0.13);
  --warn: #fbbf24;
  --warn-soft: rgba(251, 191, 36, 0.13);
  --danger: #f87171;
  --danger-soft: rgba(248, 113, 113, 0.13);
  --hero-bg: linear-gradient(135deg, #050b18 0%, #0d2142 55%, #12396a 100%);
  --hero-text: #f8fafc;
  --hero-sub: #cbd5e1;
  --hero-pill-bg: rgba(56, 189, 248, 0.16);
  --hero-pill-border: rgba(56, 189, 248, 0.34);
  --flow-edge: #7dd3fc;
  --flow-group-bg: rgba(56, 189, 248, 0.06);
  --flow-group-border: #38bdf8;
  --code-bg: #060b16;
  --code-top: #0f172a;
  --code-text: #e2e8f0;
  --shadow-card: 0 8px 26px rgba(0, 0, 0, 0.38);
}

[data-theme="paper-tech"], .tp-export-root[data-theme="paper-tech"] {
  --page-bg: #e7e5e0;
  --canvas-bg: #f6f4ee;
  --grid-line: rgba(28, 25, 23, 0.045);
  --surface: rgba(255, 254, 251, 0.96);
  --surface-2: #f5f2eb;
  --border: #e4dfd5;
  --border-strong: #cbc3b4;
  --text: #1c1917;
  --text-sub: #44403c;
  --text-muted: #78716c;
  --accent: #c2410c;
  --accent-soft: #fff7ed;
  --accent-2: #1e40af;
  --accent-2-soft: #eff6ff;
  --success: #15803d;
  --success-soft: #f0fdf4;
  --warn: #b45309;
  --warn-soft: #fffbeb;
  --danger: #b91c1c;
  --danger-soft: #fef2f2;
  --hero-bg: linear-gradient(135deg, #1c1917 0%, #292524 62%, #431407 100%);
  --hero-text: #fafaf9;
  --hero-sub: #d6d3d1;
  --hero-pill-bg: rgba(255, 255, 255, 0.1);
  --hero-pill-border: rgba(255, 255, 255, 0.22);
  --flow-edge: #57534e;
  --flow-group-bg: rgba(194, 65, 12, 0.04);
  --flow-group-border: #fdba74;
  --code-bg: #1c1917;
  --code-top: #292524;
  --code-text: #f5f5f4;
  --shadow-card: 0 3px 14px rgba(28, 25, 23, 0.06);
}

[data-theme="emerald-ops"], .tp-export-root[data-theme="emerald-ops"] {
  --page-bg: #dce8e3;
  --canvas-bg: #f0f7f4;
  --grid-line: rgba(5, 150, 105, 0.05);
  --surface: rgba(255, 255, 255, 0.96);
  --surface-2: #f4faf7;
  --border: #d1e4dc;
  --border-strong: #a7cbbd;
  --text: #06281f;
  --text-sub: #22473c;
  --text-muted: #527368;
  --accent: #059669;
  --accent-soft: #ecfdf5;
  --accent-2: #0284c7;
  --accent-2-soft: #f0f9ff;
  --success: #047857;
  --success-soft: #ecfdf5;
  --warn: #d97706;
  --warn-soft: #fffbeb;
  --danger: #dc2626;
  --danger-soft: #fef2f2;
  --hero-bg: linear-gradient(135deg, #042f24 0%, #064e3b 56%, #047857 100%);
  --hero-text: #f0fdf4;
  --hero-sub: #bbf7d0;
  --hero-pill-bg: rgba(255, 255, 255, 0.12);
  --hero-pill-border: rgba(255, 255, 255, 0.24);
  --flow-edge: #4b7365;
  --flow-group-bg: rgba(5, 150, 105, 0.045);
  --flow-group-border: #6ee7b7;
  --code-bg: #071e18;
  --code-top: #0c2d24;
  --code-text: #e2f3ec;
  --shadow-card: 0 4px 18px rgba(4, 47, 36, 0.06);
}

/* ======================== 8 套内置画布背景（默认：珠峰蓝） ======================== */
[data-bg="everest-blue"] .poster-canvas {
  background-color: var(--canvas-bg);
  background-image:
    ${everestCanvasBg},
    linear-gradient(180deg, rgba(29, 78, 216, 0.10) 0%, rgba(14, 165, 233, 0.04) 38%, rgba(29, 78, 216, 0.08) 100%),
    linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px);
  background-size: 360px 220px, 100% 100%, 28px 28px, 28px 28px;
}
[data-bg="everest-blue"] .poster-hero {
  background: linear-gradient(132deg, #071b3d 0%, #0e3a7a 46%, #1d63d8 84%, #0ea5e9 100%);
}

[data-bg="everest-night"] .poster-canvas {
  background-color: #0b162c;
  background-image:
    ${everestCanvasBg},
    radial-gradient(circle at 82% 8%, rgba(56, 189, 248, 0.22), transparent 36%),
    radial-gradient(circle at 14% 52%, rgba(29, 78, 216, 0.18), transparent 44%),
    linear-gradient(180deg, #0b162c 0%, #0f1f3d 55%, #091224 100%);
  background-size: 360px 220px, 100% 100%, 100% 100%, 100% 100%;
}
[data-bg="everest-night"] .poster-hero {
  background: linear-gradient(135deg, #030917 0%, #0a1e42 52%, #133c78 100%);
}

[data-bg="blueprint-grid"] .poster-canvas {
  background-color: var(--canvas-bg);
  background-image:
    linear-gradient(to right, rgba(29, 78, 216, 0.11) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(29, 78, 216, 0.11) 1px, transparent 1px),
    linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px);
  background-size: 84px 84px, 84px 84px, 21px 21px, 21px 21px;
}

[data-bg="dot-matrix"] .poster-canvas {
  background-color: var(--canvas-bg);
  background-image:
    radial-gradient(rgba(29, 78, 216, 0.20) 1.35px, transparent 1.35px),
    linear-gradient(180deg, rgba(14, 165, 233, 0.05) 0%, transparent 100%);
  background-size: 20px 20px, 100% 100%;
}

[data-bg="circuit-board"] .poster-canvas {
  background-color: var(--canvas-bg);
  background-image: ${circuitBg};
  background-size: 120px 120px;
}

[data-bg="topo-contour"] .poster-canvas {
  background-color: var(--canvas-bg);
  background-image: ${topoBg};
  background-size: 240px 240px;
}

[data-bg="aurora-mesh"] .poster-canvas {
  background-color: var(--canvas-bg);
  background-image:
    radial-gradient(circle at 12% 10%, rgba(56, 189, 248, 0.20), transparent 34%),
    radial-gradient(circle at 88% 30%, rgba(37, 99, 235, 0.16), transparent 38%),
    radial-gradient(circle at 20% 72%, rgba(6, 182, 212, 0.16), transparent 36%),
    radial-gradient(circle at 85% 92%, rgba(59, 130, 246, 0.18), transparent 38%);
  background-size: 100% 100%;
}

[data-bg="clean-slate"] .poster-canvas {
  background-color: var(--canvas-bg);
  background-image: none;
}

* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: var(--page-bg);
  color: var(--text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  line-height: 1.6;
}

/* ======================== 顶部工具栏（截图/打印时隐藏） ======================== */
.poster-toolbar {
  position: sticky;
  top: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 18px;
  background: rgba(11, 22, 44, 0.96);
  color: #f8fafc;
  font-size: 13px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  flex-wrap: wrap;
}
.poster-toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tb-badge {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.18);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.35);
  font-weight: 700;
  font-size: 11.5px;
}
.tb-meta {
  color: #cbd5e1;
  font-size: 12.5px;
}
.tb-label {
  color: #94a3b8;
  font-size: 12px;
}
.tb-btn, .tb-select {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12.5px;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.tb-select option { background: #0f172a; color: #f8fafc; }
.tb-btn:hover, .tb-select:hover { background: rgba(255, 255, 255, 0.17); }
.tb-btn:disabled { opacity: 0.55; cursor: wait; }
.tb-btn--accent {
  background: #1d4ed8;
  border-color: #3b82f6;
  font-weight: 600;
}
.tb-btn--accent:hover { background: #2563eb; }
.tb-btn.is-active {
  background: #0284c7;
  border-color: #38bdf8;
  font-weight: 600;
}

/* Toast 提示 */
.tp-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 350;
  max-width: 440px;
  padding: 10px 16px;
  border-radius: 9px;
  background: #0f172a;
  color: #f8fafc;
  border: 1px solid #38bdf8;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  font-size: 13px;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  transition: opacity 0.2s, transform 0.2s;
}
.tp-toast.is-show { opacity: 1; transform: translateY(0); }
.tp-toast.is-err { border-color: #f87171; background: #450a0a; color: #fecaca; }

/* ======================== 侧边栏可视化编辑器 ======================== */
.tp-workspace {
  display: flex;
  align-items: flex-start;
  min-height: calc(100vh - 48px);
}
.tp-sidebar {
  display: none;
  position: sticky;
  top: 48px;
  width: 410px;
  flex: 0 0 410px;
  height: calc(100vh - 48px);
  background: #0f172a;
  color: #e2e8f0;
  border-right: 1px solid #1e293b;
  flex-direction: column;
  z-index: 150;
}
body.sidebar-open .tp-sidebar { display: flex; }

.tp-sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #1e293b;
  gap: 8px;
}
.tp-tabs {
  display: flex;
  gap: 6px;
}
.tp-tab {
  border: 1px solid #334155;
  background: #1e293b;
  color: #cbd5e1;
  border-radius: 6px;
  padding: 5px 11px;
  font-size: 12.5px;
  cursor: pointer;
}
.tp-tab.is-active {
  background: #1d4ed8;
  border-color: #3b82f6;
  color: #ffffff;
  font-weight: 700;
}
.tp-sidebar-hint {
  padding: 7px 14px;
  font-size: 11.5px;
  color: #94a3b8;
  background: #131f36;
  border-bottom: 1px solid #1e293b;
}
.tp-sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.tp-json-pane {
  display: none;
  flex: 1;
  flex-direction: column;
  padding: 12px;
  gap: 10px;
  overflow: hidden;
}
.tp-json-pane textarea {
  flex: 1;
  width: 100%;
  background: #020617;
  color: #cbd5e1;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px;
  font-family: var(--font-mono);
  font-size: 12px;
  resize: none;
}

.ed-group {
  background: #162136;
  border: 1px solid #263652;
  border-radius: 9px;
  margin-bottom: 10px;
  overflow: hidden;
}
.ed-group.is-selected {
  border-color: #38bdf8;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.35);
}
.ed-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 11px;
  cursor: pointer;
  user-select: none;
  background: #1a2740;
}
.ed-group-head:hover { background: #213150; }
.ed-group-title {
  font-size: 13px;
  font-weight: 700;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-type-pill {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.16);
  color: #7dd3fc;
}
.ed-group-body {
  padding: 11px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  border-top: 1px solid #263652;
}
.ed-sec-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ed-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.ed-label {
  font-size: 11.5px;
  color: #94a3b8;
  font-weight: 600;
}
.ed-input, .ed-textarea, .ed-select {
  width: 100%;
  min-width: 0;
  background: #0b1222;
  color: #f1f5f9;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12.5px;
  font-family: var(--font-sans);
}
.ed-textarea { font-family: var(--font-sans); resize: vertical; line-height: 1.5; }
.ed-input:focus, .ed-textarea:focus, .ed-select:focus {
  outline: none;
  border-color: #38bdf8;
}
.ed-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
.ed-inline-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ed-sublist {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ed-subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 700;
  color: #bae6fd;
  margin-top: 4px;
}
.ed-item-box {
  background: #0f182a;
  border: 1px solid #253653;
  border-radius: 7px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ed-item-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: #94a3b8;
}
.ed-nested {
  padding-left: 8px;
  border-left: 2px solid #263652;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ed-btn {
  flex: 0 0 auto;
  border: 1px solid #334155;
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 11.5px;
  cursor: pointer;
}
.ed-btn:hover { background: #334155; }
.ed-btn--primary { background: #1d4ed8; border-color: #3b82f6; color: #ffffff; font-weight: 600; }
.ed-btn--primary:hover { background: #2563eb; }
.ed-btn--add { background: rgba(16, 185, 129, 0.16); border-color: rgba(16, 185, 129, 0.45); color: #6ee7b7; }
.ed-btn--add:hover { background: rgba(16, 185, 129, 0.28); }
.ed-btn--danger { background: rgba(239, 68, 68, 0.14); border-color: rgba(239, 68, 68, 0.4); color: #fca5a5; }
.ed-btn--danger:hover { background: rgba(239, 68, 68, 0.28); }
.ed-file-row { display: flex; align-items: center; gap: 8px; }
.ed-add-section {
  background: #13223b;
  border: 1px dashed #38bdf8;
  border-radius: 9px;
  padding: 11px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}
.ed-add-title { font-size: 12.5px; font-weight: 700; color: #7dd3fc; }

/* 海报主画布容器 */
.poster-shell {
  flex: 1;
  min-width: 0;
  padding: 24px 16px 44px;
  overflow-x: auto;
}
body.export-mode .poster-toolbar,
body.export-mode .tp-sidebar,
body.export-mode .tp-toast {
  display: none !important;
}
body.export-mode {
  background: var(--canvas-bg);
}
body.export-mode .tp-workspace { display: block; min-height: 0; }
body.export-mode .poster-shell { padding: 0; overflow: visible; }

.poster-canvas {
  width: var(--poster-w);
  margin: 0 auto;
  background-color: var(--canvas-bg);
  box-shadow: 0 20px 54px rgba(10, 32, 74, 0.18);
  overflow: hidden;
}
body.export-mode .poster-canvas { box-shadow: none; }
body.sidebar-open .poster-section:hover,
body.sidebar-open .poster-hero:hover {
  outline: 2px dashed rgba(56, 189, 248, 0.65);
  outline-offset: -2px;
  cursor: pointer;
}

/* Hero 顶栏 */
.poster-hero {
  position: relative;
  background: var(--hero-bg);
  color: var(--hero-text);
  padding: 46px 52px 42px;
  overflow: hidden;
}
.hero-deco {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0.24;
}
.hero-deco--everest { opacity: 0.92; }
.hero-inner {
  position: relative;
  z-index: 1;
}
.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
.hero-kicker {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hero-sub);
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 13px;
  border-radius: 999px;
  background: var(--hero-pill-bg);
  border: 1px solid var(--hero-pill-border);
  font-size: 13px;
  font-weight: 600;
  color: var(--hero-text);
}
.hero-title {
  margin: 0 0 14px;
  font-size: 40px;
  line-height: 1.22;
  font-weight: 800;
  letter-spacing: -0.015em;
  text-shadow: 0 2px 14px rgba(2, 12, 34, 0.3);
}
.hero-subtitle {
  margin: 0 0 24px;
  font-size: 18px;
  line-height: 1.62;
  color: var(--hero-sub);
  max-width: 90%;
}
.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  padding: 14px 18px;
  border-radius: 10px;
  background: rgba(4, 15, 36, 0.36);
  border: 1px solid rgba(255, 255, 255, 0.18);
  margin-bottom: 16px;
}
.hero-meta-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
}
.hero-meta-label { color: var(--hero-sub); opacity: 0.85; }
.hero-meta-value { font-weight: 600; color: var(--hero-text); }
.hero-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.hero-tag {
  padding: 4px 12px;
  border-radius: 6px;
  background: var(--hero-pill-bg);
  border: 1px solid var(--hero-pill-border);
  font-size: 13px;
  font-weight: 600;
  color: var(--hero-text);
}

/* 栏目列表容器 */
.poster-body {
  padding: 28px 36px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.poster-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 30px 32px;
  box-shadow: var(--shadow-card);
}
.section-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 18px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--border);
}
.section-num {
  flex: 0 0 auto;
  min-width: 44px;
  height: 44px;
  border-radius: 11px;
  background: var(--accent-soft);
  border: 1px solid var(--border-strong);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.section-head-text { min-width: 0; flex: 1; }
.section-kicker {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--accent-2);
  text-transform: uppercase;
  margin-bottom: 3px;
}
.section-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
  font-weight: 800;
  color: var(--text);
}
.section-subtitle {
  margin: 6px 0 0;
  font-size: 15px;
  color: var(--text-muted);
}

.empty-note {
  padding: 28px;
  text-align: center;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  color: var(--text-muted);
  font-size: 14px;
}

/* 1. overview */
.overview-summary {
  margin: 0 0 20px;
  font-size: 16.5px;
  line-height: 1.7;
  color: var(--text-sub);
}
.metric-grid {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
}
.metric-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-top: 3px solid var(--accent);
  border-radius: 11px;
  padding: 16px 16px 14px;
}
.metric-val {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 800;
  line-height: 1.15;
  color: var(--accent);
  margin-bottom: 6px;
}
.metric-label { font-size: 14.5px; font-weight: 700; color: var(--text); }
.metric-note { margin-top: 4px; font-size: 12.5px; color: var(--text-muted); }
.highlight-list {
  list-style: none;
  margin: 0;
  padding: 14px 18px;
  background: var(--accent-soft);
  border-radius: 10px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.highlight-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 15px;
  color: var(--text);
}
.hl-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  margin-top: 9px;
}

/* 2. cards */
.card-grid { display: grid; gap: 16px; }
.card-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.card-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.cap-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 3px solid var(--accent);
}
.cap-card--secondary { border-top-color: var(--accent-2); }
.cap-card--success { border-top-color: var(--success); }
.cap-card--warn { border-top-color: var(--warn); }
.cap-card-top { display: flex; flex-direction: column; gap: 6px; }
.cap-badge {
  align-self: flex-start;
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 5px;
  background: var(--accent-soft);
  color: var(--accent);
}
.cap-card--secondary .cap-badge { background: var(--accent-2-soft); color: var(--accent-2); }
.cap-card--success .cap-badge { background: var(--success-soft); color: var(--success); }
.cap-card--warn .cap-badge { background: var(--warn-soft); color: var(--warn); }
.cap-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--text); }
.cap-desc { margin: 0; font-size: 14.5px; line-height: 1.62; color: var(--text-sub); flex: 1; }
.tag-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.mini-tag {
  font-size: 12.5px;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

/* 3. layers */
.arch-wrap { display: block; }
.arch-wrap--with-side {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 236px;
  gap: 16px;
  align-items: stretch;
}
.arch-stack { display: flex; flex-direction: column; }
.arch-layer {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  border-radius: 12px;
  padding: 16px 18px;
}
.arch-layer--secondary { border-left-color: var(--accent-2); }
.arch-layer--success { border-left-color: var(--success); }
.arch-layer--warn { border-left-color: var(--warn); }
.arch-layer-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.arch-layer-name { font-size: 16.5px; font-weight: 800; color: var(--text); }
.arch-layer-desc { font-size: 13px; color: var(--text-muted); }
.arch-modules {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.arch-mod {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}
.arch-mod-name { font-size: 14px; font-weight: 700; color: var(--text); }
.arch-mod-detail { margin-top: 3px; font-size: 12.5px; color: var(--text-muted); }
.arch-connector { height: 16px; display: flex; justify-content: center; align-items: center; }
.arch-connector span { width: 2px; height: 100%; background: var(--border-strong); }
.arch-sidebars { display: flex; flex-direction: column; gap: 12px; }
.arch-side-card {
  flex: 1;
  background: var(--accent-soft);
  border: 1px dashed var(--accent);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.arch-side-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--accent);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.arch-side-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.arch-side-list li {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 10px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
}

/* 4. flow */
.flow-canvas {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  overflow: hidden;
  display: flex;
  justify-content: center;
}
.flow-svg { max-width: 100%; height: auto; display: block; }

/* 5. diagram */
.diagram-grid { display: grid; gap: 16px; }
.diagram-grid--1 { grid-template-columns: 1fr; }
.diagram-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.diagram-box {
  margin: 0;
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 16px;
  background: var(--surface-2);
}
.diagram-box--light { background: #ffffff; border-color: #cbd5e1; color: #334155; }
.diagram-box--light .diagram-box-title { color: #0f172a; }
.diagram-box--light .figure-caption { color: #475569; }
.diagram-box--transparent { background: transparent; border-style: dashed; }
.diagram-box-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 10px; }
.diagram-media { display: flex; justify-content: center; align-items: center; overflow: hidden; }
.diagram-media img, .diagram-media .embedded-svg { max-width: 100%; height: auto; display: block; border-radius: 6px; }
.figure-caption { margin: 12px 0 0; font-size: 13.5px; color: var(--text-muted); line-height: 1.55; }
.section-extra-img { margin-top: 18px; }

/* 6. timeline */
.timeline-list { display: flex; flex-direction: column; }
.tl-item { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 16px; }
.tl-rail { display: flex; flex-direction: column; align-items: center; }
.tl-step {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--accent); color: #ffffff;
  font-family: var(--font-mono); font-size: 13px; font-weight: 800;
  display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
}
.tl-line { width: 2px; flex: 1; min-height: 20px; background: var(--border-strong); margin: 6px 0; }
.tl-body { padding-bottom: 20px; }
.tl-item:last-child .tl-body { padding-bottom: 2px; }
.tl-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.tl-title { margin: 0; font-size: 17.5px; font-weight: 700; color: var(--text); }
.tl-tag {
  font-family: var(--font-mono); font-size: 12px; font-weight: 700;
  padding: 2px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent);
}
.tl-desc { margin: 0 0 8px; font-size: 14.5px; color: var(--text-sub); }
.tl-bullets { margin: 0; padding-left: 18px; font-size: 14px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px; }

/* 7. compare */
.table-wrap { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.cmp-table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
.cmp-table th, .cmp-table td { padding: 13px 16px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
.cmp-table thead th { background: var(--surface-2); font-weight: 800; color: var(--text); }
.cmp-table tbody tr:last-child td { border-bottom: none; }
.cmp-table td.is-key { font-weight: 700; color: var(--text); width: 22%; }
.cmp-table th.is-hi { background: var(--accent-soft); color: var(--accent); }
.cmp-table td.is-hi { background: var(--accent-soft); color: var(--text); font-weight: 600; }
.cmp-table tr.is-emphasis td { border-top: 1px solid var(--border-strong); }

/* 8. code */
.code-window { border-radius: 12px; overflow: hidden; border: 1px solid var(--border-strong); background: var(--code-bg); }
.code-topbar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--code-top); border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
.code-dots { display: flex; gap: 6px; }
.code-dots span { width: 10px; height: 10px; border-radius: 50%; background: #475569; }
.code-dots span:nth-child(1) { background: #ef4444; }
.code-dots span:nth-child(2) { background: #f59e0b; }
.code-dots span:nth-child(3) { background: #22c55e; }
.code-filename { font-family: var(--font-mono); font-size: 13px; color: #cbd5e1; flex: 1; }
.code-lang { font-family: var(--font-mono); font-size: 11.5px; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; background: rgba(56, 189, 248, 0.16); color: #7dd3fc; }
.code-pre { margin: 0; padding: 18px 20px; overflow-x: auto; font-family: var(--font-mono); font-size: 13.5px; line-height: 1.65; color: var(--code-text); white-space: pre-wrap; word-break: break-word; }
.tok-com { color: #64748b; font-style: italic; }
.tok-key { color: #7dd3fc; }
.tok-str { color: #86efac; }
.tok-kw { color: #f472b6; font-weight: 600; }
.tok-num { color: #fbbf24; }
.code-anns { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.code-ann-item { display: flex; gap: 10px; align-items: flex-start; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.code-ann-num { flex: 0 0 auto; width: 24px; height: 24px; border-radius: 50%; background: var(--accent); color: #ffffff; font-family: var(--font-mono); font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-top: 2px; }
.code-ann-title { font-size: 14px; font-weight: 700; color: var(--text); }
.code-ann-desc { margin-top: 3px; font-size: 13px; color: var(--text-muted); }

/* 9. callout */
.callout-grid { display: grid; gap: 16px; }
.callout-grid--1 { grid-template-columns: 1fr; }
.callout-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.callout-box { border-radius: 12px; padding: 18px 20px; border: 1px solid var(--border); border-left: 4px solid var(--accent); background: var(--surface-2); }
.callout-box--tip { border-left-color: var(--success); background: var(--success-soft); }
.callout-box--warn { border-left-color: var(--warn); background: var(--warn-soft); }
.callout-box--danger { border-left-color: var(--danger); background: var(--danger-soft); }
.callout-box--info { border-left-color: var(--accent); background: var(--accent-soft); }
.callout-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.callout-pill { font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.callout-title { margin: 0; font-size: 16.5px; font-weight: 800; color: var(--text); }
.callout-list { margin: 0; padding-left: 18px; font-size: 14.5px; color: var(--text-sub); display: flex; flex-direction: column; gap: 6px; }

/* 10. qa */
.qa-list { display: flex; flex-direction: column; gap: 12px; }
.qa-item { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
.qa-q, .qa-a { display: flex; align-items: flex-start; gap: 10px; font-size: 15px; }
.qa-q { font-weight: 700; color: var(--text); }
.qa-a { color: var(--text-sub); }
.qa-badge { flex: 0 0 auto; width: 24px; height: 24px; border-radius: 6px; font-family: var(--font-mono); font-size: 12.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
.qa-badge--q { background: var(--accent); color: #ffffff; }
.qa-badge--a { background: var(--surface); color: var(--accent-2); border: 1px solid var(--border-strong); }

/* Footer */
.poster-footer {
  padding: 20px 40px 26px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
  color: var(--text-muted);
}

@media print {
  .poster-toolbar, .tp-sidebar, .tp-toast { display: none !important; }
  .tp-workspace { display: block; }
  .poster-shell { padding: 0; }
  .poster-canvas { box-shadow: none; }
}
`;
}

let cachedInlineBundle = null;

async function getInlineClientBundle() {
  if (cachedInlineBundle) return cachedInlineBundle;
  const [coreSrc, appSrc] = await Promise.all([
    readFile(join(HERE, 'poster-core.mjs'), 'utf8'),
    readFile(join(HERE, 'client-app.js'), 'utf8')
  ]);
  const browserCore = coreSrc.replace(/^export\s+/gm, '');
  cachedInlineBundle = `(function(){\n${browserCore}\n${appSrc}\n})();`.replace(/<\/script/gi, '<\\/script');
  return cachedInlineBundle;
}

export async function renderPosterHtml(rawSpec, options = {}) {
  const spec = normalizeSpec(rawSpec);
  const baseDir = options.baseDir || process.cwd();

  // 将所有本地图片/SVG 离线解析并固化进 spec，确保生成的单文件 HTML 拷贝到任意目录都能自包含渲染和再次编辑
  for (const sec of spec.sections) {
    if (sec.type === 'diagram') {
      const embedMode = sec.embedMode === 'datauri' ? 'datauri' : 'inline';
      if (Array.isArray(sec.items) && sec.items.length > 0) {
        for (const item of sec.items) {
          await resolveAssetInPlace(item, baseDir, { embedMode: item.embedMode || embedMode });
        }
      } else {
        await resolveAssetInPlace(sec, baseDir, { embedMode });
      }
    } else if (sec.imageFile) {
      await resolveAssetInPlace(sec, baseDir, {
        embedMode: 'inline',
        fileField: 'imageFile',
        svgField: 'imageSvg',
        dataField: 'imageDataUri'
      });
    }
  }

  const canvasInnerHtml = renderCanvasInnerHtml(spec);
  const inlineBundle = await getInlineClientBundle();

  const themeOptions = Object.entries(THEMES)
    .map(([k, v]) => `<option value="${k}"${k === spec.theme ? ' selected' : ''}>${esc(v.name)}</option>`)
    .join('');

  const bgOptions = Object.entries(BACKGROUNDS)
    .map(([k, v]) => `<option value="${k}"${k === spec.background ? ' selected' : ''}>${esc(v.name)}</option>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${esc(spec.theme)}" data-bg="${esc(spec.background)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(spec.title)}</title>
  <style id="tp-main-style">${buildStyles(spec.width)}</style>
</head>
<body>
  <div class="poster-toolbar" role="toolbar" aria-label="离线海报工作台工具栏">
    <div class="poster-toolbar-group">
      <span class="tb-badge">OFFLINE · 零外联</span>
      <button type="button" id="tp-toggle-editor" class="tb-btn tb-btn--accent">编辑元素</button>
      <span id="tp-meta-count" class="tb-meta">宽度 ${spec.width}px · ${spec.sections.length} 个栏目</span>
    </div>
    <div class="poster-toolbar-group">
      <label class="tb-label" for="tp-bg-select">背景</label>
      <select id="tp-bg-select" class="tb-select">${bgOptions}</select>
      <label class="tb-label" for="tp-theme-select">主题</label>
      <select id="tp-theme-select" class="tb-select">${themeOptions}</select>
      <button type="button" id="tp-copy-png" class="tb-btn tb-btn--accent">复制为 PNG</button>
      <button type="button" id="tp-download-png" class="tb-btn">下载 PNG</button>
      <button type="button" id="tp-save-html" class="tb-btn">保存 HTML</button>
      <button type="button" id="tp-print" class="tb-btn">打印 / PDF</button>
    </div>
  </div>

  <div class="tp-workspace">
    <aside id="tp-sidebar" class="tp-sidebar" aria-label="侧边栏元素编辑器">
      <div class="tp-sidebar-top">
        <div class="tp-tabs">
          <button type="button" id="tp-tab-form" class="tp-tab is-active">元素编辑</button>
          <button type="button" id="tp-tab-json" class="tp-tab">JSON 源码</button>
        </div>
        <button type="button" id="tp-close-sidebar" class="ed-btn">关闭 ✕</button>
      </div>
      <div class="tp-sidebar-hint">提示：修改文字、增删栏目/子元素即时生效；点击画布栏目可快速定位编辑。</div>
      <div id="tp-sidebar-body" class="tp-sidebar-body"></div>
      <div id="tp-json-pane" class="tp-json-pane">
        <textarea id="tp-json-text"></textarea>
        <div class="ed-inline-row">
          <button type="button" id="tp-apply-json" class="ed-btn ed-btn--primary">应用 JSON 到画布</button>
          <button type="button" id="tp-copy-json" class="ed-btn">复制 JSON</button>
        </div>
      </div>
    </aside>

    <div class="poster-shell">
      <main class="poster-canvas" id="poster-canvas">
${canvasInnerHtml}
      </main>
    </div>
  </div>

  <div id="tp-toast" class="tp-toast" role="status" aria-live="polite"></div>

  <script id="poster-data" type="application/json">${safeJsonForHtml(spec)}</script>
  <script>${inlineBundle}</script>
</body>
</html>
`;
}

export function extractSpecFromHtml(html) {
  const m = html.match(/<script\b[^>]*id\s*=\s*["']poster-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) {
    throw new Error('输入 HTML 中未找到 #poster-data 数据块');
  }
  const raw = m[1].replace(/<\\\/script/gi, '</script').trim();
  return JSON.parse(raw);
}
