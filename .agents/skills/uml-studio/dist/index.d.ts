// Generated from vue-tsc output; internal module scopes preserve exact types.

import * as __Core from './core.js';

declare namespace __Uml_0_export_d_ts {
import DiagramInput = __Core.DiagramInput;
import ExportOptions = __Core.ExportOptions;
export interface StudioRuntime {
    js: string;
    css: string;
}
export function readStudioRuntime(): StudioRuntime | undefined;
/** A self-contained, editable document. Runtime is bundled locally, never loaded from a CDN. */
export function createHtml(input: DiagramInput, runtime?: StudioRuntime): string;
export function downloadBlob(blob: Blob, filename: string): void;
export function exportSvgImage(svg: string, options?: ExportOptions): Promise<Blob>;
}

declare namespace __Uml_1_DiagramCanvas_vue_d_ts {
import StudioRuntime = __Uml_0_export_d_ts.StudioRuntime;
import DiagramSpec = __Core.DiagramSpec;
import ExportOptions = __Core.ExportOptions;
import RenderedDiagram = __Core.RenderedDiagram;
export type __VLS_Props = {
    spec: DiagramSpec;
    runtime?: StudioRuntime;
    elementSelection?: boolean;
};
export function setSpec(input: DiagramSpec): Promise<void>;
export function getSpec(): DiagramSpec;
export function getSvg(): string;
export function exportImage(options?: ExportOptions): Promise<Blob>;
export function saveHtml(): string;
export const __VLS_export: import("vue").DefineComponent<__VLS_Props, {
    ready: Promise<void>;
    getSpec: typeof getSpec;
    setSpec: typeof setSpec;
    getSvg: typeof getSvg;
    exportImage: typeof exportImage;
    saveHtml: typeof saveHtml;
}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    rendered: (diagram: RenderedDiagram, spec: DiagramSpec) => any;
    error: (error: Error) => any;
    loading: (loading: boolean) => any;
    selectElement: (key: string) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onRendered?: ((diagram: RenderedDiagram, spec: DiagramSpec) => any) | undefined;
    onError?: ((error: Error) => any) | undefined;
    onLoading?: ((loading: boolean) => any) | undefined;
    onSelectElement?: ((key: string) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export const _default: typeof __VLS_export;
}

export import renderDiagram = __Core.renderDiagram;

export import validateSpec = __Core.validateSpec;

export import diagramSchema = __Core.diagramSchema;

export import documentSchema = __Core.documentSchema;

export import themes = __Core.themes;

export import themeLabels = __Core.themeLabels;

export import fontPresets = __Core.fontPresets;

export import colorPresets = __Core.colorPresets;

export import layoutModes = __Core.layoutModes;

export import resolveLayout = __Core.resolveLayout;

export import resolveTheme = __Core.resolveTheme;

export import normalizeDocument = __Core.normalizeDocument;

export import validateDocument = __Core.validateDocument;

export import exportSvgImage = __Uml_0_export_d_ts.exportSvgImage;

export import downloadBlob = __Uml_0_export_d_ts.downloadBlob;

export import createHtml = __Uml_0_export_d_ts.createHtml;

export import DiagramCanvas = __Uml_1_DiagramCanvas_vue_d_ts._default;

export import diagramTypes = __Core.diagramTypes;

export import DiagramType = __Core.DiagramType;

export import ThemeName = __Core.ThemeName;

export import Theme = __Core.Theme;

export import DiagramNode = __Core.DiagramNode;

export import DiagramEdge = __Core.DiagramEdge;

export import DiagramGroup = __Core.DiagramGroup;

export import DiagramLane = __Core.DiagramLane;

export import Participant = __Core.Participant;

export import Message = __Core.Message;

export import Fragment = __Core.Fragment;

export import FishboneCause = __Core.FishboneCause;

export import fishboneHeadStyles = __Core.fishboneHeadStyles;

export import FishboneHeadStyle = __Core.FishboneHeadStyle;

export import FishboneData = __Core.FishboneData;

export import DiagramLayoutOptions = __Core.DiagramLayoutOptions;

export import DiagramSpec = __Core.DiagramSpec;

export import DiagramDocument = __Core.DiagramDocument;

export import DiagramInput = __Core.DiagramInput;

export import RenderedDiagram = __Core.RenderedDiagram;

export import ExportOptions = __Core.ExportOptions;

