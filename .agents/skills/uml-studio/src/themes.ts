import type { DiagramSpec, Theme, ThemeName } from './types'
const base: Theme = {
  background: '#faf8f3', surface: '#ffffff', text: '#253248', muted: '#667286', primary: '#b35231', secondary: '#327781', border: '#cbd2d9',
  fontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans CJK SC, Arial, sans-serif', fontSize: 15, lineWidth: 1.6, radius: 8, nodeWidth: 180, nodeHeight: 68, gap: 64,
}
export const themes: Record<ThemeName, Theme> = {
  paper: { ...base },
  ocean: { ...base, background: '#f1f7fb', text: '#193b56', primary: '#2167a8', secondary: '#138e94', border: '#b4ccd9' },
  forest: { ...base, background: '#f4f7ef', text: '#283b31', primary: '#3b7153', secondary: '#99713b', border: '#c3d0bc' },
  blueprint: { ...base, background: '#edf3fc', surface: '#f9fbff', text: '#183f74', muted: '#567296', primary: '#245ba3', secondary: '#557ab4', border: '#9bb7d6', radius: 0, lineWidth: 1.3 },
  midnight: { ...base, background: '#17202c', surface: '#222f40', text: '#e5ebf2', muted: '#a5b4c8', primary: '#efa47b', secondary: '#80bec3', border: '#52627a' },
}
export function resolveTheme(spec: DiagramSpec): Theme { return { ...themes[spec.theme ?? 'paper'], ...spec.style } }
