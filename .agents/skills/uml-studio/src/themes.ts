import type { DiagramLayoutOptions, DiagramSpec, Theme, ThemeName } from './types'

const base: Theme = {
  background: '#f1f7fb', surface: '#ffffff', text: '#193b56', muted: '#58758a', primary: '#2167a8', secondary: '#138e94', border: '#b4ccd9',
  fontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans CJK SC, Arial, sans-serif', fontSize: 16, fontWeight: 500, fontStyle: 'normal', textDecoration: 'none',
  lineWidth: 1.6, radius: 8, nodeWidth: 180, nodeHeight: 68, gap: 64,
}
export const themes: Record<ThemeName, Theme> = {
  modern: { ...base, background: '#ffffff', surface: '#eff6ff', text: '#0f172a', muted: '#475569', primary: '#1d4ed8', secondary: '#059669', border: '#cbd5e1', radius: 10, lineWidth: 1.8,
    palette: ['#1d4ed8', '#0891b2', '#059669', '#d97706', '#4f46e5', '#e11d48', '#7c3aed', '#0d9488'], paletteMode: 'tint', paletteBy: 'auto' },
  ocean: { ...base },
  white: { ...base, background: '#ffffff', surface: '#ffffff', text: '#193b56', muted: '#526b7d', border: '#9bb7cc' },
  industrial: { ...base, background: '#ffffff', surface: '#fff4e8', text: '#333333', muted: '#666666', primary: '#555555', secondary: '#d7a777', border: '#808080', radius: 2, lineWidth: 1.3 },
  paper: { ...base, background: '#faf8f3', text: '#253248', muted: '#667286', primary: '#b35231', secondary: '#327781', border: '#cbd2d9' },
  forest: { ...base, background: '#f4f7ef', text: '#283b31', muted: '#67765d', primary: '#3b7153', secondary: '#99713b', border: '#c3d0bc' },
  blueprint: { ...base, background: '#edf3fc', surface: '#f9fbff', text: '#183f74', muted: '#567296', primary: '#245ba3', secondary: '#557ab4', border: '#9bb7d6', radius: 0, lineWidth: 1.3 },
  midnight: { ...base, background: '#17202c', surface: '#222f40', text: '#e5ebf2', muted: '#a5b4c8', primary: '#efa47b', secondary: '#80bec3', border: '#52627a' },
  lavender: { ...base, background: '#f6f2fc', surface: '#fefcff', text: '#42345f', muted: '#7b6c94', primary: '#7954ad', secondary: '#b075a4', border: '#d1c3e5', radius: 12 },
  rose: { ...base, background: '#fff4f5', surface: '#fffdfd', text: '#653c49', muted: '#987180', primary: '#b94868', secondary: '#b57a43', border: '#e8bdc9', radius: 10 },
  amber: { ...base, background: '#fff9eb', surface: '#fffef9', text: '#62451e', muted: '#927b56', primary: '#b87513', secondary: '#737f3c', border: '#e3c994', radius: 6 },
  slate: { ...base, background: '#f3f5f7', surface: '#ffffff', text: '#293544', muted: '#687687', primary: '#50647d', secondary: '#648a97', border: '#c4cdd7', radius: 4 },
  mint: { ...base, background: '#eefbf6', surface: '#fbfffd', text: '#254e46', muted: '#60877b', primary: '#19866c', secondary: '#438fa6', border: '#b3ddcf', radius: 14 },
  vivid: { ...base, background: '#ffffff', surface: '#ffffff', text: '#0f172a', muted: '#475569', primary: '#1d4ed8', secondary: '#059669', border: '#cbd5e1', radius: 10, lineWidth: 1.8,
    palette: ['#2563eb', '#0891b2', '#059669', '#d97706', '#7c3aed', '#e11d48', '#4f46e5', '#0d9488'], paletteMode: 'solid', paletteBy: 'auto' },
  pastel: { ...base, background: '#ffffff', surface: '#ffffff', text: '#0f172a', muted: '#475569', primary: '#2563eb', secondary: '#10b981', border: '#cbd5e1', radius: 12, lineWidth: 1.7,
    palette: ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'], paletteMode: 'tint', paletteBy: 'auto' },
  business: { ...base, background: '#ffffff', surface: '#ffffff', text: '#0f172a', muted: '#475569', primary: '#1e40af', secondary: '#047857', border: '#cbd5e1', radius: 8, lineWidth: 1.7,
    palette: ['#1e40af', '#0e7490', '#047857', '#b45309', '#4338ca', '#be123c'], paletteMode: 'tint', paletteBy: 'auto' },
  steel: { ...base, background: '#f8fafc', surface: '#ffffff', text: '#0f172a', muted: '#475569', primary: '#1e40af', secondary: '#0f766e', border: '#cbd5e1', radius: 8, lineWidth: 1.6,
    palette: ['#1d4ed8', '#0284c7', '#0d9488', '#475569', '#d97706', '#4f46e5'], paletteMode: 'gradient', paletteBy: 'auto' },
  aurora: { ...base, background: '#ffffff', surface: '#ffffff', text: '#0f172a', muted: '#475569', primary: '#4f46e5', secondary: '#0891b2', border: '#cbd5e1', radius: 10, lineWidth: 1.7,
    palette: ['#4f46e5', '#0284c7', '#059669', '#d97706', '#db2777', '#7c3aed'], paletteMode: 'gradient', paletteBy: 'auto' },
  neon: { ...base, background: '#111827', surface: '#1f2937', text: '#e5e7eb', muted: '#9ca3af', primary: '#38bdf8', secondary: '#34d399', border: '#334155', radius: 10, lineWidth: 1.7,
    palette: ['#22d3ee', '#34d399', '#f472b6', '#fbbf24', '#818cf8', '#a3e635'], paletteMode: 'solid', paletteBy: 'auto' },
}
export const themeLabels: Record<ThemeName, string> = {
  modern: '现代多彩', ocean: '海洋蓝', white: '纯白', industrial: '工业汇报', paper: '暖纸', forest: '森林绿', blueprint: '工程蓝图', midnight: '午夜',
  lavender: '薰衣草', rose: '玫瑰', amber: '琥珀', slate: '岩灰', mint: '薄荷',
  vivid: '缤纷彩色', pastel: '马卡龙', business: '商务多彩', steel: '工业渐变', aurora: '极光渐变', neon: '暗夜霓虹',
}
export const fontPresets: { label: string; value: string }[] = [
  { label: '中文无衬线', value: base.fontFamily },
  { label: '系统无衬线', value: 'Segoe UI, Microsoft YaHei, PingFang SC, Arial, sans-serif' },
  { label: '思源黑体', value: 'Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, sans-serif' },
  { label: '中文宋体', value: 'Noto Serif CJK SC, Source Han Serif SC, SimSun, serif' },
  { label: '经典衬线', value: 'Georgia, Times New Roman, SimSun, serif' },
  { label: '等宽代码', value: 'Cascadia Code, Consolas, Noto Sans Mono CJK SC, monospace' },
]
export const colorPresets: { label: string; value: string }[] = [
  ['透明', 'transparent'], ['纯白', '#ffffff'], ['暖纸', '#faf8f3'], ['雾蓝', '#f1f7fb'], ['薄荷白', '#eefbf6'], ['薰衣草白', '#f6f2fc'], ['玫瑰白', '#fff4f5'], ['琥珀白', '#fff9eb'],
  ['墨黑', '#202830'], ['岩灰', '#50647d'], ['银灰', '#c4cdd7'], ['午夜', '#17202c'], ['海洋蓝', '#2167a8'], ['宝石蓝', '#245ba3'], ['天空蓝', '#438fa6'], ['青绿', '#138e94'],
  ['薄荷绿', '#19866c'], ['森林绿', '#3b7153'], ['橄榄绿', '#737f3c'], ['琥珀', '#b87513'], ['金黄', '#e5b641'], ['陶土', '#b35231'], ['珊瑚', '#efa47b'], ['玫瑰', '#b94868'],
  ['莓红', '#943c64'], ['藕紫', '#b075a4'], ['薰衣草', '#7954ad'], ['深紫', '#574287'], ['冰青', '#80bec3'], ['浅绿', '#b3ddcf'], ['浅蓝', '#b4ccd9'], ['浅紫', '#d1c3e5'],
].map(([label, value]) => ({ label, value }))

export const paletteModes: { label: string; value: NonNullable<Theme['paletteMode']> }[] = [
  { label: '单色', value: 'mono' }, { label: '浅色多彩', value: 'tint' }, { label: '实色多彩', value: 'solid' }, { label: '渐变多彩', value: 'gradient' },
]
export const paletteTargets: { label: string; value: NonNullable<Theme['paletteBy']> }[] = [
  { label: '自动', value: 'auto' }, { label: '按分组 / 泳道', value: 'group' }, { label: '按元素类型', value: 'kind' }, { label: '逐个元素', value: 'node' },
]

export const defaultTheme: ThemeName = 'modern'
export function resolveTheme(spec: DiagramSpec): Theme { return { ...themes[spec.theme ?? defaultTheme], ...spec.style } }

export const layoutModes: { label: string; value: NonNullable<DiagramLayoutOptions['mode']> }[] = [
  { label: '紧凑', value: 'compact' }, { label: '均衡', value: 'balanced' },
  { label: '宽松', value: 'spacious' }, { label: '分栏网格', value: 'grid' },
]

const layoutDefaults: Record<NonNullable<DiagramLayoutOptions['mode']>, {elementGap:number;regionGap:number;maxPerColumn:number}> = {
  compact: { elementGap: 32, regionGap: 48, maxPerColumn: 0 },
  balanced: { elementGap: 56, regionGap: 84, maxPerColumn: 0 },
  spacious: { elementGap: 88, regionGap: 120, maxPerColumn: 0 },
  grid: { elementGap: 36, regionGap: 56, maxPerColumn: 3 },
}

/** Explicit layout fields win over legacy style.gap, which wins over mode defaults. */
export function resolveLayout(spec: DiagramSpec): DiagramLayoutOptions {
  const mode = spec.layout?.mode ?? 'balanced';
  const defaults = layoutDefaults[mode];
  return { ...spec.layout, mode, elementGap: spec.layout?.elementGap ?? spec.style?.gap ?? defaults.elementGap,
    regionGap: spec.layout?.regionGap ?? spec.style?.gap ?? defaults.regionGap,
    maxPerColumn: spec.layout?.maxPerColumn ?? defaults.maxPerColumn };
}
