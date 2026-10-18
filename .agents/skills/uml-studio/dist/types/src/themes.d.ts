import type { DiagramSpec, Theme, ThemeName } from './types';
export declare const themes: Record<ThemeName, Theme>;
export declare function resolveTheme(spec: DiagramSpec): Theme;
