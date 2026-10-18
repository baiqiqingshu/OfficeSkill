import type { StudioRuntime } from "./export";
import type { DiagramDocument, DiagramInput, DiagramSpec, ExportOptions } from "./types";
type __VLS_Props = {
    initialSpec: unknown;
    examples: Record<string, DiagramSpec>;
    runtimeReady: Promise<StudioRuntime | undefined>;
    startupError?: string;
};
declare function setSpec(input: DiagramSpec): Promise<void>;
declare function setDocument(input: DiagramInput): Promise<void>;
declare function selectDiagram(indexOrId: number | string): Promise<void>;
declare function getSpec(): DiagramSpec;
declare function getDocument(): DiagramDocument;
declare function getSvg(): string;
declare function exportImage(options?: ExportOptions): Promise<Blob>;
declare function saveHtml(): string;
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {
    ready: Promise<void>;
    getSpec: typeof getSpec;
    setSpec: typeof setSpec;
    getDocument: typeof getDocument;
    setDocument: typeof setDocument;
    selectDiagram: typeof selectDiagram;
    getSvg: typeof getSvg;
    exportImage: typeof exportImage;
    saveHtml: typeof saveHtml;
}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
