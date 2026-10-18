import type { DiagramSpec, RenderedDiagram, Theme } from './types';
/** Escape text and attribute values, including characters forbidden by XML 1.0. */
export declare function esc(value: unknown): string;
/** y is the first baseline; explicit newlines advance by 1.4 times the font size. */
export declare function text(x: number, y: number, label: string, theme: Theme, options?: {
    size?: number;
    fill?: string;
    anchor?: string;
    weight?: number;
}): string;
/** Wrap already-positioned SVG primitives; the body is not translated. */
export declare function frame(spec: DiagramSpec, theme: Theme, width: number, height: number, body: string): RenderedDiagram;
