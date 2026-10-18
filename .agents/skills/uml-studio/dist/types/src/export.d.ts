import type { DiagramInput, ExportOptions } from './types';
export interface StudioRuntime {
    js: string;
    css: string;
}
export declare function readStudioRuntime(): StudioRuntime | undefined;
/** A self-contained, editable document. Runtime is bundled locally, never loaded from a CDN. */
export declare function createHtml(input: DiagramInput, runtime?: StudioRuntime): string;
export declare function downloadBlob(blob: Blob, filename: string): void;
export declare function exportSvgImage(svg: string, options?: ExportOptions): Promise<Blob>;
