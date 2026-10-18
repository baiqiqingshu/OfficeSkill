import type { StudioRuntime } from './export';
import type { DiagramSpec, ExportOptions, RenderedDiagram } from './types';
type __VLS_Props = {
    spec: DiagramSpec;
    runtime?: StudioRuntime;
};
declare function setSpec(input: DiagramSpec): Promise<void>;
declare function getSpec(): DiagramSpec;
declare function getSvg(): string;
declare function exportImage(options?: ExportOptions): Promise<Blob>;
declare function saveHtml(): string;
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {
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
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onRendered?: ((diagram: RenderedDiagram, spec: DiagramSpec) => any) | undefined;
    onError?: ((error: Error) => any) | undefined;
    onLoading?: ((loading: boolean) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
