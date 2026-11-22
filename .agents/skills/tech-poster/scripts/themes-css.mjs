/* 扩展内容主题（与内置背景一一配套，也可手动选择）。仅 Node 端构建时内联。 */

const SEMANTIC_LIGHT = {
  success: '#059669', 'success-soft': '#ecfdf5',
  warn: '#d97706', 'warn-soft': '#fffbeb',
  danger: '#dc2626', 'danger-soft': '#fef2f2'
};

const SEMANTIC_DARK = {
  success: '#34d399', 'success-soft': 'rgba(52, 211, 153, 0.13)',
  warn: '#fbbf24', 'warn-soft': 'rgba(251, 191, 36, 0.13)',
  danger: '#fb7185', 'danger-soft': 'rgba(251, 113, 133, 0.13)'
};

const EXTRA_THEMES = {
  'sky-azure': {
    ...SEMANTIC_LIGHT,
    'page-bg': '#dce9fb', 'canvas-bg': '#eef5ff', 'grid-line': 'rgba(22, 104, 240, 0.055)',
    surface: 'rgba(255, 255, 255, 0.96)', 'surface-2': '#f3f8ff', border: '#d3e3fa', 'border-strong': '#a9c8f5',
    text: '#0b1b3a', 'text-sub': '#2c4166', 'text-muted': '#5a7196',
    accent: '#1668f0', 'accent-soft': '#e7f0ff', 'accent-2': '#0598c9', 'accent-2-soft': '#e3f7fd',
    'hero-bg': 'linear-gradient(135deg, #0a36b4 0%, #1a5fe2 55%, #3f8ef5 100%)',
    'hero-text': '#ffffff', 'hero-sub': '#dbeafe', 'hero-pill-bg': 'rgba(255, 255, 255, 0.16)', 'hero-pill-border': 'rgba(255, 255, 255, 0.32)',
    'flow-edge': '#5476a8', 'flow-group-bg': 'rgba(22, 104, 240, 0.05)', 'flow-group-border': '#93c5fd',
    'code-bg': '#0b1a33', 'code-top': '#132849', 'code-text': '#e2e8f0',
    'shadow-card': '0 8px 24px rgba(22, 90, 200, 0.09)'
  },
  'cosmos-night': {
    ...SEMANTIC_DARK,
    'page-bg': '#020617', 'canvas-bg': '#05143d', 'grid-line': 'rgba(96, 165, 250, 0.06)',
    surface: 'rgba(9, 24, 66, 0.84)', 'surface-2': 'rgba(24, 48, 110, 0.55)', border: 'rgba(96, 165, 250, 0.24)', 'border-strong': 'rgba(96, 165, 250, 0.42)',
    text: '#eef4ff', 'text-sub': '#c7d6f2', 'text-muted': '#8ea5cc',
    accent: '#60a5fa', 'accent-soft': 'rgba(96, 165, 250, 0.16)', 'accent-2': '#a78bfa', 'accent-2-soft': 'rgba(167, 139, 250, 0.16)',
    'hero-bg': 'linear-gradient(160deg, #020a22 0%, #0a2a78 100%)',
    'hero-text': '#ffffff', 'hero-sub': '#c7dcff', 'hero-pill-bg': 'rgba(96, 165, 250, 0.16)', 'hero-pill-border': 'rgba(96, 165, 250, 0.36)',
    'flow-edge': '#93c5fd', 'flow-group-bg': 'rgba(96, 165, 250, 0.07)', 'flow-group-border': '#60a5fa',
    'code-bg': '#020817', 'code-top': '#0b1736', 'code-text': '#e2e8f0',
    'shadow-card': '0 10px 30px rgba(0, 0, 0, 0.4)'
  },
  'lavender-glass': {
    ...SEMANTIC_LIGHT,
    'page-bg': '#e6e9fb', 'canvas-bg': '#eaf0fd', 'grid-line': 'rgba(79, 70, 229, 0.05)',
    surface: 'rgba(255, 255, 255, 0.86)', 'surface-2': 'rgba(245, 246, 255, 0.92)', border: '#dfe3fb', 'border-strong': '#bcc3f3',
    text: '#11163d', 'text-sub': '#363d6b', 'text-muted': '#6b7199',
    accent: '#4f46e5', 'accent-soft': '#eef0ff', 'accent-2': '#2563eb', 'accent-2-soft': '#e8f0ff',
    'hero-bg': 'linear-gradient(135deg, #1e1b6b 0%, #4338ca 60%, #6366f1 100%)',
    'hero-text': '#ffffff', 'hero-sub': '#e0e7ff', 'hero-pill-bg': 'rgba(255, 255, 255, 0.16)', 'hero-pill-border': 'rgba(255, 255, 255, 0.32)',
    'flow-edge': '#6a6fa8', 'flow-group-bg': 'rgba(79, 70, 229, 0.05)', 'flow-group-border': '#a5b4fc',
    'code-bg': '#14123a', 'code-top': '#1f1c52', 'code-text': '#e8e7ff',
    'shadow-card': '0 10px 30px rgba(67, 56, 202, 0.08)'
  },
  'ink-print': {
    ...SEMANTIC_LIGHT,
    'page-bg': '#e5e7eb', 'canvas-bg': '#f4f7fb', 'grid-line': 'rgba(15, 23, 42, 0.04)',
    surface: '#ffffff', 'surface-2': '#f8fafc', border: '#e2e8f0', 'border-strong': '#cbd5e1',
    text: '#0f172a', 'text-sub': '#334155', 'text-muted': '#64748b',
    accent: '#1e40af', 'accent-soft': '#eef2ff', 'accent-2': '#0f766e', 'accent-2-soft': '#f0fdfa',
    'hero-bg': 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    'hero-text': '#f8fafc', 'hero-sub': '#cbd5e1', 'hero-pill-bg': 'rgba(255, 255, 255, 0.12)', 'hero-pill-border': 'rgba(255, 255, 255, 0.24)',
    'flow-edge': '#64748b', 'flow-group-bg': 'rgba(15, 23, 42, 0.03)', 'flow-group-border': '#cbd5e1',
    'code-bg': '#0f172a', 'code-top': '#1e293b', 'code-text': '#e2e8f0',
    'shadow-card': '0 1px 3px rgba(15, 23, 42, 0.06)'
  },
  'silicon-dark': {
    ...SEMANTIC_DARK,
    'page-bg': '#010608', 'canvas-bg': '#041218', 'grid-line': 'rgba(34, 211, 238, 0.06)',
    surface: 'rgba(6, 24, 32, 0.86)', 'surface-2': 'rgba(12, 42, 54, 0.7)', border: 'rgba(34, 211, 238, 0.2)', 'border-strong': 'rgba(34, 211, 238, 0.38)',
    text: '#e6fbff', 'text-sub': '#b9dde6', 'text-muted': '#7fa7b3',
    accent: '#22d3ee', 'accent-soft': 'rgba(34, 211, 238, 0.14)', 'accent-2': '#a3e635', 'accent-2-soft': 'rgba(163, 230, 53, 0.13)',
    'hero-bg': 'linear-gradient(160deg, #020a0e 0%, #073443 100%)',
    'hero-text': '#f0fdff', 'hero-sub': '#a5f3fc', 'hero-pill-bg': 'rgba(34, 211, 238, 0.14)', 'hero-pill-border': 'rgba(34, 211, 238, 0.36)',
    'flow-edge': '#67e8f9', 'flow-group-bg': 'rgba(34, 211, 238, 0.06)', 'flow-group-border': '#22d3ee',
    'code-bg': '#010a0e', 'code-top': '#06202a', 'code-text': '#d9f7ff',
    'shadow-card': '0 10px 30px rgba(0, 0, 0, 0.45)'
  },
  'wafer-iris': {
    ...SEMANTIC_LIGHT,
    'page-bg': '#e8e4fa', 'canvas-bg': '#f3f1fd', 'grid-line': 'rgba(124, 58, 237, 0.05)',
    surface: 'rgba(255, 255, 255, 0.94)', 'surface-2': '#f7f5ff', border: '#e2dcfa', 'border-strong': '#c4b8f3',
    text: '#170f3a', 'text-sub': '#3b3168', 'text-muted': '#6f6699',
    accent: '#7c3aed', 'accent-soft': '#f3edff', 'accent-2': '#0891b2', 'accent-2-soft': '#e6f8fc',
    'hero-bg': 'linear-gradient(135deg, #0d0b3a 0%, #2a1a7a 55%, #5b3fd0 100%)',
    'hero-text': '#ffffff', 'hero-sub': '#ddd6fe', 'hero-pill-bg': 'rgba(255, 255, 255, 0.14)', 'hero-pill-border': 'rgba(255, 255, 255, 0.3)',
    'flow-edge': '#7a6fa8', 'flow-group-bg': 'rgba(124, 58, 237, 0.05)', 'flow-group-border': '#c4b5fd',
    'code-bg': '#150f33', 'code-top': '#231a4d', 'code-text': '#ece8ff',
    'shadow-card': '0 8px 24px rgba(91, 63, 208, 0.09)'
  },
  'pcb-gold': {
    ...SEMANTIC_LIGHT,
    success: '#15803d',
    'page-bg': '#dfe8df', 'canvas-bg': '#f2f6f0', 'grid-line': 'rgba(4, 120, 87, 0.05)',
    surface: 'rgba(255, 255, 255, 0.96)', 'surface-2': '#f6f9f3', border: '#d9e5d6', 'border-strong': '#b5cdb0',
    text: '#0b2318', 'text-sub': '#2b4a3b', 'text-muted': '#5e7a6b',
    accent: '#a16207', 'accent-soft': '#fdf6e3', 'accent-2': '#047857', 'accent-2-soft': '#ebf8f1',
    'hero-bg': 'linear-gradient(135deg, #021a12 0%, #053d2b 55%, #0a5c40 100%)',
    'hero-text': '#fffbeb', 'hero-sub': '#d9f2e3', 'hero-pill-bg': 'rgba(250, 204, 21, 0.14)', 'hero-pill-border': 'rgba(250, 204, 21, 0.36)',
    'flow-edge': '#5e7a6b', 'flow-group-bg': 'rgba(161, 98, 7, 0.04)', 'flow-group-border': '#e3c27a',
    'code-bg': '#04150e', 'code-top': '#0a2a1d', 'code-text': '#e7f5ec',
    'shadow-card': '0 6px 20px rgba(5, 61, 43, 0.08)'
  },
  'litho-violet': {
    ...SEMANTIC_DARK,
    'page-bg': '#05030f', 'canvas-bg': '#0b0820', 'grid-line': 'rgba(167, 139, 250, 0.06)',
    surface: 'rgba(22, 14, 56, 0.84)', 'surface-2': 'rgba(44, 28, 100, 0.55)', border: 'rgba(167, 139, 250, 0.24)', 'border-strong': 'rgba(167, 139, 250, 0.42)',
    text: '#f5f3ff', 'text-sub': '#d9d2fb', 'text-muted': '#a29bc9',
    accent: '#c084fc', 'accent-soft': 'rgba(192, 132, 252, 0.16)', 'accent-2': '#22d3ee', 'accent-2-soft': 'rgba(34, 211, 238, 0.14)',
    'hero-bg': 'linear-gradient(160deg, #05030f 0%, #2a1470 100%)',
    'hero-text': '#ffffff', 'hero-sub': '#ddd6fe', 'hero-pill-bg': 'rgba(192, 132, 252, 0.16)', 'hero-pill-border': 'rgba(192, 132, 252, 0.38)',
    'flow-edge': '#c4b5fd', 'flow-group-bg': 'rgba(167, 139, 250, 0.07)', 'flow-group-border': '#a78bfa',
    'code-bg': '#06030f', 'code-top': '#140c33', 'code-text': '#ede9fe',
    'shadow-card': '0 10px 30px rgba(0, 0, 0, 0.45)'
  }
};

export function buildExtraThemeCss() {
  return Object.entries(EXTRA_THEMES).map(([id, vars]) => {
    const body = Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`).join('\n');
    return `[data-theme="${id}"], .tp-export-root[data-theme="${id}"] {\n${body}\n}`;
  }).join('\n\n');
}
