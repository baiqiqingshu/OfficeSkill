import type { DiagramLayoutOptions, DiagramSpec, Theme, ThemeName } from './types';
export declare const themes: Record<ThemeName, Theme>;
export declare const themeLabels: Record<ThemeName, string>;
export declare const fontPresets: {
    label: string;
    value: string;
}[];
export declare const colorPresets: {
    label: string;
    value: string;
}[];
export declare function resolveTheme(spec: DiagramSpec): Theme;
export declare const layoutModes: {
    label: string;
    value: NonNullable<DiagramLayoutOptions['mode']>;
}[];
/** Explicit layout fields win over legacy style.gap, which wins over mode defaults. */
export declare function resolveLayout(spec: DiagramSpec): DiagramLayoutOptions;
