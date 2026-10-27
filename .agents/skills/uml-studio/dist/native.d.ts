// Generated from vue-tsc output; internal module scopes preserve exact types.

import * as __Core from './core.js';

import type { Buffer } from 'node:buffer';

declare namespace __Uml_0_native_d_ts {
import DiagramDocument = __Core.DiagramDocument;
import DiagramSpec = __Core.DiagramSpec;
import ExportOptions = __Core.ExportOptions;
/** Read the inert data block only. Never evaluate HTML scripts or load its resources. */
export function documentFromHtml(html: string): DiagramDocument;
export function readDiagramFile(path: string): Promise<DiagramDocument>;
export interface NativeExportOptions extends ExportOptions {
    fontFiles?: string[];
}
export interface NativeImage {
    data: Buffer;
    width: number;
    height: number;
    format: NonNullable<ExportOptions["format"]>;
}
export function renderNativeImage(spec: DiagramSpec, options?: NativeExportOptions): Promise<NativeImage>;
}

export import documentFromHtml = __Uml_0_native_d_ts.documentFromHtml;

export import readDiagramFile = __Uml_0_native_d_ts.readDiagramFile;

export import renderNativeImage = __Uml_0_native_d_ts.renderNativeImage;

export import NativeExportOptions = __Uml_0_native_d_ts.NativeExportOptions;

export import NativeImage = __Uml_0_native_d_ts.NativeImage;

