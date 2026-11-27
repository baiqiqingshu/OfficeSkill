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
export type LayoutBox = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};
/** cx/cy: new absolute centre in layout-root coordinates; dx/dy kept for compatibility. */
export interface ElementMove {
    key: string;
    cx: number;
    cy: number;
    dx: number;
    dy: number;
    /** false when the start centre was estimated from geometry (unadjusted render without data-layout-cx). */
    exact: boolean;
    /** Followers of a container drag with their new centres. */
    members?: {
        key: string;
        cx: number;
        cy: number;
    }[];
}
/** One adjustable element of the current render, in layout-root coordinates. */
export interface LayoutItem {
    key: string;
    box: LayoutBox;
    center: {
        x: number;
        y: number;
    };
    exact: boolean;
    pinned: boolean;
    container: boolean;
    groupId?: string;
    laneId?: string;
    /** Renderer's exact box top-left (data-layout-x/y), the `{x, y}` pin of this element. */
    origin?: {
        x: number;
        y: number;
    };
}
export interface LayoutSnapshot {
    items: LayoutItem[];
    bounds?: LayoutBox;
    viewport?: LayoutBox;
}
export const _default: typeof __VLS_export;
export const __VLS_export: import("vue").DefineComponent<{
    spec: DiagramSpec;
    runtime?: StudioRuntime;
    elementSelection?: boolean;
    positionEditing?: boolean;
    interactionMode?: "select" | "connect";
    selectedKeys?: string[];
    marqueeKeys?: string[];
}, {
    ready: Promise<void>;
    getSpec: () => DiagramSpec;
    setSpec: (input: DiagramSpec) => Promise<void>;
    getSvg: () => string;
    exportImage: (options?: ExportOptions) => Promise<Blob>;
    saveHtml: () => string;
    layoutSnapshot: () => LayoutSnapshot | undefined;
    restoreRendered: () => void;
}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    rendered: (diagram: RenderedDiagram, spec: DiagramSpec) => any;
    error: (error: Error) => any;
    loading: (loading: boolean) => any;
    selectElement: (key: string) => any;
    selectionChange: (keys: string[]) => any;
    requestDelete: (keys: string[]) => any;
    connectNodes: (nodes: {
        from: string;
        to: string;
    }) => any;
    adjustElement: (change: ElementMove) => any;
    adjustWaypoints: (change: {
        key: string;
        waypoints: {
            x: number;
            y: number;
        }[];
    }) => any;
}, string, import("vue").PublicProps, Readonly<{
    spec: DiagramSpec;
    runtime?: StudioRuntime;
    elementSelection?: boolean;
    positionEditing?: boolean;
    interactionMode?: "select" | "connect";
    selectedKeys?: string[];
    marqueeKeys?: string[];
}> & Readonly<{
    onRendered?: ((diagram: RenderedDiagram, spec: DiagramSpec) => any) | undefined;
    onError?: ((error: Error) => any) | undefined;
    onLoading?: ((loading: boolean) => any) | undefined;
    onSelectElement?: ((key: string) => any) | undefined;
    onSelectionChange?: ((keys: string[]) => any) | undefined;
    onRequestDelete?: ((keys: string[]) => any) | undefined;
    onConnectNodes?: ((nodes: {
        from: string;
        to: string;
    }) => any) | undefined;
    onAdjustElement?: ((change: ElementMove) => any) | undefined;
    onAdjustWaypoints?: ((change: {
        key: string;
        waypoints: {
            x: number;
            y: number;
        }[];
    }) => any) | undefined;
}>, {
    interactionMode: "select" | "connect";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
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

export import PaletteMode = __Core.PaletteMode;

export import PaletteBy = __Core.PaletteBy;

export import Theme = __Core.Theme;

export import DiagramNode = __Core.DiagramNode;

export import DiagramEdge = __Core.DiagramEdge;

export import EdgeArrow = __Core.EdgeArrow;

export import DiagramGroup = __Core.DiagramGroup;

export import DiagramLane = __Core.DiagramLane;

export import Participant = __Core.Participant;

export import ParticipantBox = __Core.ParticipantBox;

export import Message = __Core.Message;

export import Fragment = __Core.Fragment;

export import FishboneCause = __Core.FishboneCause;

export import fishboneHeadStyles = __Core.fishboneHeadStyles;

export import FishboneHeadStyle = __Core.FishboneHeadStyle;

export import FishboneData = __Core.FishboneData;

export import DiagramPoint = __Core.DiagramPoint;

export import ElementCenter = __Core.ElementCenter;

export import ElementAdjustment = __Core.ElementAdjustment;

export import EdgeAdjustment = __Core.EdgeAdjustment;

export import DiagramAdjustments = __Core.DiagramAdjustments;

export import DiagramLayoutOptions = __Core.DiagramLayoutOptions;

export import DiagramSpec = __Core.DiagramSpec;

export import DiagramDocument = __Core.DiagramDocument;

export import DiagramInput = __Core.DiagramInput;

export import RenderedDiagram = __Core.RenderedDiagram;

export import ExportOptions = __Core.ExportOptions;

