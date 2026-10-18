import type { DiagramDocument, DiagramSpec, ExportOptions } from "./types";
/** Read the inert data block only. Never evaluate HTML scripts or load its resources. */
export declare function documentFromHtml(html: string): DiagramDocument;
export declare function readDiagramFile(path: string): Promise<DiagramDocument>;
export interface NativeExportOptions extends ExportOptions {
    fontFiles?: string[];
}
export interface NativeImage {
    data: Buffer;
    width: number;
    height: number;
    format: NonNullable<ExportOptions["format"]>;
}
export declare function renderNativeImage(spec: DiagramSpec, options?: NativeExportOptions): Promise<NativeImage>;
