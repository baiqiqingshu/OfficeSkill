import type { DiagramLayoutOptions, DiagramSpec, Theme, ThemeName } from './types'

const base: Theme = {
  background: '#f1f7fb', surface: '#ffffff', text: '#193b56', muted: '#58758a', primary: '#2167a8', secondary: '#138e94', border: '#b4ccd9',
  fontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans CJK SC, Arial, sans-serif', fontSize: 15, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none',
  lineWidth: 1.6, radius: 8, nodeWidth: 180, nodeHeight: 68, gap: 64,
}
export const themes: Record<ThemeName, Theme> = {
  ocean: { ...base },
  paper: { ...base, background: '#faf8f3', text: '#253248', muted: '#667286', primary: '#b35231', secondary: '#327781', border: '#cbd2d9' },
  forest: { ...base, background: '#f4f7ef', text: '#283b31', muted: '#67765d', primary: '#3b7153', secondary: '#99713b', border: '#c3d0bc' },
  blueprint: { ...base, background: '#edf3fc', surface: '#f9fbff', text: '#183f74', muted: '#567296', primary: '#245ba3', secondary: '#557ab4', border: '#9bb7d6', radius: 0, lineWidth: 1.3 },
  midnight: { ...base, background: '#17202c', surface: '#222f40', text: '#e5ebf2', muted: '#a5b4c8', primary: '#efa47b', secondary: '#80bec3', border: '#52627a' },
  lavender: { ...base, background: '#f6f2fc', surface: '#fefcff', text: '#42345f', muted: '#7b6c94', primary: '#7954ad', secondary: '#b075a4', border: '#d1c3e5', radius: 12 },
  rose: { ...base, background: '#fff4f5', surface: '#fffdfd', text: '#653c49', muted: '#987180', primary: '#b94868', secondary: '#b57a43', border: '#e8bdc9', radius: 10 },
  amber: { ...base, background: '#fff9eb', surface: '#fffef9', text: '#62451e', muted: '#927b56', primary: '#b87513', secondary: '#737f3c', border: '#e3c994', radius: 6 },
  slate: { ...base, background: '#f3f5f7', surface: '#ffffff', text: '#293544', muted: '#687687', primary: '#50647d', secondary: '#648a97', border: '#c4cdd7', radius: 4 },
  mint: { ...base, background: '#eefbf6', surface: '#fbfffd', text: '#254e46', muted: '#60877b', primary: '#19866c', secondary: '#438fa6', border: '#b3ddcf', radius: 14 },
}
export const themeLabels: Record<ThemeName, string> = {
  ocean: '海洋蓝', paper: '暖纸', forest: '森林绿', blueprint: '工程蓝图', midnight: '午夜',
  lavender: '薰衣草', rose: '玫瑰', amber: '琥珀', slate: '岩灰', mint: '薄荷',
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

export function resolveTheme(spec: DiagramSpec): Theme { return { ...themes[spec.theme ?? 'ocean'], ...spec.style } }

export const layoutModes: { label: string; value: NonNullable<DiagramLayoutOptions['mode']> }[] = [
  { label: '紧凑', value: 'compact' }, { label: '均衡', value: 'balanced' },
  { label: '宽松', value: 'spacious' }, { label: '分栏网格', value: 'grid' },
]

const layoutDefaults: Record<NonNullable<DiagramLayoutOptions['mode']>, {elementGap:number;regionGap:number;maxPerColumn:number}> = {
  compact: { elementGap: 24, regionGap: 40, maxPerColumn: 0 },
  balanced: { elementGap: 48, regionGap: 72, maxPerColumn: 0 },
  spacious: { elementGap: 80, regionGap: 112, maxPerColumn: 0 },
  grid: { elementGap: 24, regionGap: 40, maxPerColumn: 3 },
}

/** Explicit layout fields win over legacy style.gap, which wins over mode defaults. */
export function resolveLayout(spec: DiagramSpec): DiagramLayoutOptions {
  const mode = spec.layout?.mode ?? 'compact';
  const defaults = layoutDefaults[mode];
  return { ...spec.layout, mode, elementGap: spec.layout?.elementGap ?? spec.style?.gap ?? defaults.elementGap,
    regionGap: spec.layout?.regionGap ?? spec.style?.gap ?? defaults.regionGap,
    maxPerColumn: spec.layout?.maxPerColumn ?? defaults.maxPerColumn };
}
