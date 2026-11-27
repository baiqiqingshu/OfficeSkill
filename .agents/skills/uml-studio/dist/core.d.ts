// Generated from vue-tsc output; internal module scopes preserve exact types.

declare namespace __Uml_1_types_d_ts {
export const diagramTypes: readonly [
    "activity",
    "sequence",
    "swimlane",
    "flowchart",
    "usecase",
    "class",
    "state",
    "component",
    "package",
    "architecture",
    "module",
    "deployment",
    "logical",
    "development",
    "process",
    "physical",
    "scenario",
    "fishbone"
];
export type DiagramType = typeof diagramTypes[number];
export type ThemeName = 'modern' | 'paper' | 'ocean' | 'white' | 'industrial' | 'forest' | 'blueprint' | 'midnight' | 'lavender' | 'rose' | 'amber' | 'slate' | 'mint' | 'vivid' | 'pastel' | 'business' | 'steel' | 'aurora' | 'neon';
export type PaletteMode = 'mono' | 'tint' | 'solid' | 'gradient';
export type PaletteBy = 'auto' | 'group' | 'kind' | 'node';
export interface Theme {
    background: string;
    surface: string;
    text: string;
    muted: string;
    primary: string;
    secondary: string;
    border: string;
    fontFamily: string;
    fontSize: number;
    lineWidth: number;
    radius: number;
    nodeWidth: number;
    nodeHeight: number;
    gap: number;
    fontWeight: number;
    fontStyle: 'normal' | 'italic';
    textDecoration: 'none' | 'underline';
    /** Multi-colour rendering: element colours cycle through the palette. */
    palette?: string[];
    paletteMode?: PaletteMode;
    paletteBy?: PaletteBy;
}
export interface DiagramNode {
    id: string;
    label: string;
    kind?: 'action' | 'decision' | 'start' | 'end' | 'fork' | 'join' | 'actor' | 'usecase' | 'class' | 'interface' | 'component' | 'package' | 'database' | 'server' | 'queue' | 'state' | 'note' | 'image' | 'terminal' | 'subroutine' | 'io' | 'hexagon' | 'circle' | 'trapezoid';
    /** kind 'image'：data:image/ URL；width/height 为期望显示尺寸（缺省 240×160）。 */
    src?: string;
    width?: number;
    height?: number;
    detail?: string;
    stereotype?: string;
    attributes?: string[];
    operations?: string[];
    group?: string;
    lane?: string;
    style?: Partial<Theme>;
}
export interface DiagramEdge {
    id?: string;
    from: string;
    to: string;
    label?: string;
    kind?: 'flow' | 'association' | 'dependency' | 'include' | 'extend' | 'inheritance' | 'realization' | 'aggregation' | 'composition';
    dashed?: boolean;
    fromLabel?: string;
    toLabel?: string;
    arrow?: EdgeArrow;
    startArrow?: EdgeArrow;
    thick?: boolean;
}
export type EdgeArrow = 'none' | 'arrow' | 'open' | 'triangle' | 'circle' | 'cross';
export interface DiagramGroup {
    id: string;
    label: string;
    parent?: string;
    kind?: 'boundary' | 'package' | 'node';
}
export interface DiagramLane {
    id: string;
    label: string;
}
export interface Participant {
    id: string;
    label: string;
    kind?: 'actor' | 'participant' | 'database' | 'boundary' | 'control' | 'entity' | 'collections' | 'queue';
}
export interface ParticipantBox {
    label: string;
    participants: string[];
    color?: string;
}
/** `note` and `divider` occupy a timeline row (and a message index) but are not numbered messages. */
export interface Message {
    from: string;
    to: string;
    label: string;
    kind?: 'sync' | 'async' | 'return' | 'create' | 'destroy' | 'note' | 'divider';
    activate?: boolean;
    deactivate?: boolean;
    arrow?: 'filled' | 'open' | 'none' | 'cross';
    dashed?: boolean;
    bidirectional?: boolean;
    position?: 'left' | 'right' | 'over';
}
export interface Fragment {
    kind: 'alt' | 'opt' | 'loop' | 'par' | 'critical' | 'break' | 'rect';
    label: string;
    from: number;
    to: number;
    elseAt?: number;
    elseLabel?: string;
    elses?: {
        at: number;
        label?: string;
    }[];
    color?: string;
}
export interface FishboneCause {
    label: string;
    children?: FishboneCause[];
}
export const fishboneHeadStyles: readonly [
    "classic",
    "fish",
    "slim",
    "shark",
    "roundfish",
    "carp",
    "sunfish",
    "triangle",
    "rounded",
    "label"
];
export type FishboneHeadStyle = typeof fishboneHeadStyles[number];
export interface FishboneData {
    effect: string;
    headStyle?: FishboneHeadStyle;
    categories: {
        id: string;
        label: string;
        causes: FishboneCause[];
    }[];
}
export interface DiagramPoint {
    x: number;
    y: number;
}
/**
 * Logical layout coordinates (the `[data-layout-root]` space).
 * `{cx, cy}` pins the element's visual centre (recommended); legacy `{dx, dy}` offsets follow
 * the automatic layout and legacy `{x, y}` pins the top-left corner (renderer anchor).
 */
export interface ElementCenter {
    cx: number;
    cy: number;
}
export type ElementAdjustment = ElementCenter | {
    dx: number;
    dy: number;
} | DiagramPoint;
export interface EdgeAdjustment {
    waypoints: DiagramPoint[];
}
export interface DiagramAdjustments {
    elements?: Record<string, ElementAdjustment>;
    edges?: Record<string, EdgeAdjustment>;
}
export interface DiagramLayoutOptions {
    mode?: 'compact' | 'balanced' | 'spacious' | 'grid';
    edgeCrossing?: 'bridge' | 'plain';
    horizontalStagger?: boolean;
    adjustments?: DiagramAdjustments;
    showTitle?: boolean;
    maxWidth?: number;
    maxHeight?: number;
    regionGap?: number;
    elementGap?: number;
    maxPerColumn?: number;
    nodeMaxWidth?: number;
    nodeMaxHeight?: number;
    /** Sequence message numbering; defaults to true. */
    autonumber?: boolean;
}
export interface DiagramSpec {
    version: 1;
    id?: string;
    type: DiagramType;
    title: string;
    description?: string;
    theme?: ThemeName;
    style?: Partial<Theme>;
    direction?: 'TB' | 'LR';
    layout?: DiagramLayoutOptions;
    nodes?: DiagramNode[];
    edges?: DiagramEdge[];
    groups?: DiagramGroup[];
    lanes?: DiagramLane[];
    participants?: Participant[];
    messages?: Message[];
    fragments?: Fragment[];
    boxes?: ParticipantBox[];
    fishbone?: FishboneData;
}
export interface DiagramDocument {
    version: 1;
    title: string;
    diagrams: DiagramSpec[];
}
export type DiagramInput = DiagramSpec | DiagramDocument;
export interface RenderedDiagram {
    svg: string;
    width: number;
    height: number;
}
export interface ExportOptions {
    format?: 'svg' | 'png' | 'jpeg' | 'webp';
    scale?: number;
    quality?: number;
    background?: string;
}
}

declare namespace __Uml_0_render_d_ts {
import RenderedDiagram = __Uml_1_types_d_ts.RenderedDiagram;
export function renderDiagram(input: unknown): Promise<RenderedDiagram>;
}

declare namespace __Uml_2_validate_d_ts {
import DiagramSpec = __Uml_1_types_d_ts.DiagramSpec;
export function validateSpec(value: unknown): DiagramSpec;
}

declare namespace __Uml_3_schema_d_ts {
export const diagramSchema: {
    definitions: {
        cause: {
            type: string;
            properties: Record<string, unknown>;
            required: string[];
            additionalProperties: boolean;
        };
    };
    allOf: ({
        if: {
            properties: {
                type: {
                    const: string;
                    not?: undefined;
                };
            };
        };
        then: {
            required: string[];
            properties: {
                participants: {
                    minItems: number;
                };
                messages: {
                    minItems: number;
                };
                nodes?: undefined;
                lanes?: undefined;
            };
        };
    } | {
        if: {
            properties: {
                type: {
                    const: string;
                    not?: undefined;
                };
            };
        };
        then: {
            required: string[];
            properties?: undefined;
        };
    } | {
        if: {
            properties: {
                type: {
                    not: {
                        enum: string[];
                    };
                    const?: undefined;
                };
            };
        };
        then: {
            required: string[];
            properties: {
                nodes: {
                    minItems: number;
                };
                participants?: undefined;
                messages?: undefined;
                lanes?: undefined;
            };
        };
    } | {
        if: {
            properties: {
                type: {
                    const: string;
                    not?: undefined;
                };
            };
        };
        then: {
            required: string[];
            properties: {
                lanes: {
                    minItems: number;
                };
                participants?: undefined;
                messages?: undefined;
                nodes?: undefined;
            };
        };
    })[];
    type: string;
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
    $schema: string;
    $id: string;
};
export const documentSchema: {
    definitions: {
        cause: {
            type: string;
            properties: Record<string, unknown>;
            required: string[];
            additionalProperties: boolean;
        };
        diagram: {
            allOf: ({
                if: {
                    properties: {
                        type: {
                            const: string;
                            not?: undefined;
                        };
                    };
                };
                then: {
                    required: string[];
                    properties: {
                        participants: {
                            minItems: number;
                        };
                        messages: {
                            minItems: number;
                        };
                        nodes?: undefined;
                        lanes?: undefined;
                    };
                };
            } | {
                if: {
                    properties: {
                        type: {
                            const: string;
                            not?: undefined;
                        };
                    };
                };
                then: {
                    required: string[];
                    properties?: undefined;
                };
            } | {
                if: {
                    properties: {
                        type: {
                            not: {
                                enum: string[];
                            };
                            const?: undefined;
                        };
                    };
                };
                then: {
                    required: string[];
                    properties: {
                        nodes: {
                            minItems: number;
                        };
                        participants?: undefined;
                        messages?: undefined;
                        lanes?: undefined;
                    };
                };
            } | {
                if: {
                    properties: {
                        type: {
                            const: string;
                            not?: undefined;
                        };
                    };
                };
                then: {
                    required: string[];
                    properties: {
                        lanes: {
                            minItems: number;
                        };
                        participants?: undefined;
                        messages?: undefined;
                        nodes?: undefined;
                    };
                };
            })[];
            type: string;
            properties: Record<string, unknown>;
            required: string[];
            additionalProperties: boolean;
        };
    };
    type: string;
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
    $schema: string;
    $id: string;
};
}

declare namespace __Uml_4_themes_d_ts {
import DiagramLayoutOptions = __Uml_1_types_d_ts.DiagramLayoutOptions;
import DiagramSpec = __Uml_1_types_d_ts.DiagramSpec;
import Theme = __Uml_1_types_d_ts.Theme;
import ThemeName = __Uml_1_types_d_ts.ThemeName;
export const themes: Record<ThemeName, Theme>;
export const themeLabels: Record<ThemeName, string>;
export const fontPresets: {
    label: string;
    value: string;
}[];
export const colorPresets: {
    label: string;
    value: string;
}[];
export const paletteModes: {
    label: string;
    value: NonNullable<Theme['paletteMode']>;
}[];
export const paletteTargets: {
    label: string;
    value: NonNullable<Theme['paletteBy']>;
}[];
export const defaultTheme: ThemeName;
export function resolveTheme(spec: DiagramSpec): Theme;
export const layoutModes: {
    label: string;
    value: NonNullable<DiagramLayoutOptions['mode']>;
}[];
/** Explicit layout fields win over legacy style.gap, which wins over mode defaults. */
export function resolveLayout(spec: DiagramSpec): DiagramLayoutOptions;
}

declare namespace __Uml_5_document_d_ts {
import DiagramDocument = __Uml_1_types_d_ts.DiagramDocument;
export function validateDocument(input: unknown): DiagramDocument;
export function normalizeDocument(input: unknown): DiagramDocument;
}

declare namespace __Uml_6_mermaid_d_ts {
import DiagramDocument = __Uml_1_types_d_ts.DiagramDocument;
import DiagramSpec = __Uml_1_types_d_ts.DiagramSpec;
/** Mermaid → UML Studio JSON. Unsupported statements are reported as warnings instead of aborting. */
export interface MermaidResult {
    document: DiagramDocument;
    warnings: string[];
}
/** True when text looks like Mermaid source or Markdown containing a mermaid block. */
export function isMermaidSource(text: string): boolean;
/** Extract every ```mermaid block from Markdown; plain Mermaid returns itself. */
export function extractMermaidBlocks(text: string): string[];
export function mermaidToDocument(source: string, title?: string): MermaidResult;
export function mermaidToSpec(block: string, warnings?: string[], suffix?: string): DiagramSpec;
/** Convert Mermaid / CSS colours to the schema's #RRGGBB form; alpha is blended over white. */
export function cssColor(value: string | undefined): string | undefined;
}

export import renderDiagram = __Uml_0_render_d_ts.renderDiagram;

export import validateSpec = __Uml_2_validate_d_ts.validateSpec;

export import diagramSchema = __Uml_3_schema_d_ts.diagramSchema;

export import documentSchema = __Uml_3_schema_d_ts.documentSchema;

export import themes = __Uml_4_themes_d_ts.themes;

export import themeLabels = __Uml_4_themes_d_ts.themeLabels;

export import fontPresets = __Uml_4_themes_d_ts.fontPresets;

export import colorPresets = __Uml_4_themes_d_ts.colorPresets;

export import layoutModes = __Uml_4_themes_d_ts.layoutModes;

export import paletteModes = __Uml_4_themes_d_ts.paletteModes;

export import paletteTargets = __Uml_4_themes_d_ts.paletteTargets;

export import resolveLayout = __Uml_4_themes_d_ts.resolveLayout;

export import resolveTheme = __Uml_4_themes_d_ts.resolveTheme;

export import normalizeDocument = __Uml_5_document_d_ts.normalizeDocument;

export import validateDocument = __Uml_5_document_d_ts.validateDocument;

export import mermaidToDocument = __Uml_6_mermaid_d_ts.mermaidToDocument;

export import mermaidToSpec = __Uml_6_mermaid_d_ts.mermaidToSpec;

export import isMermaidSource = __Uml_6_mermaid_d_ts.isMermaidSource;

export import extractMermaidBlocks = __Uml_6_mermaid_d_ts.extractMermaidBlocks;

export import MermaidResult = __Uml_6_mermaid_d_ts.MermaidResult;

export import diagramTypes = __Uml_1_types_d_ts.diagramTypes;

export import DiagramType = __Uml_1_types_d_ts.DiagramType;

export import ThemeName = __Uml_1_types_d_ts.ThemeName;

export import PaletteMode = __Uml_1_types_d_ts.PaletteMode;

export import PaletteBy = __Uml_1_types_d_ts.PaletteBy;

export import Theme = __Uml_1_types_d_ts.Theme;

export import DiagramNode = __Uml_1_types_d_ts.DiagramNode;

export import DiagramEdge = __Uml_1_types_d_ts.DiagramEdge;

export import EdgeArrow = __Uml_1_types_d_ts.EdgeArrow;

export import DiagramGroup = __Uml_1_types_d_ts.DiagramGroup;

export import DiagramLane = __Uml_1_types_d_ts.DiagramLane;

export import Participant = __Uml_1_types_d_ts.Participant;

export import ParticipantBox = __Uml_1_types_d_ts.ParticipantBox;

export import Message = __Uml_1_types_d_ts.Message;

export import Fragment = __Uml_1_types_d_ts.Fragment;

export import FishboneCause = __Uml_1_types_d_ts.FishboneCause;

export import fishboneHeadStyles = __Uml_1_types_d_ts.fishboneHeadStyles;

export import FishboneHeadStyle = __Uml_1_types_d_ts.FishboneHeadStyle;

export import FishboneData = __Uml_1_types_d_ts.FishboneData;

export import DiagramPoint = __Uml_1_types_d_ts.DiagramPoint;

export import ElementCenter = __Uml_1_types_d_ts.ElementCenter;

export import ElementAdjustment = __Uml_1_types_d_ts.ElementAdjustment;

export import EdgeAdjustment = __Uml_1_types_d_ts.EdgeAdjustment;

export import DiagramAdjustments = __Uml_1_types_d_ts.DiagramAdjustments;

export import DiagramLayoutOptions = __Uml_1_types_d_ts.DiagramLayoutOptions;

export import DiagramSpec = __Uml_1_types_d_ts.DiagramSpec;

export import DiagramDocument = __Uml_1_types_d_ts.DiagramDocument;

export import DiagramInput = __Uml_1_types_d_ts.DiagramInput;

export import RenderedDiagram = __Uml_1_types_d_ts.RenderedDiagram;

export import ExportOptions = __Uml_1_types_d_ts.ExportOptions;

