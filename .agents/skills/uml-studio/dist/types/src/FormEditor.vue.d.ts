import type { DiagramSpec } from "./types";
import "./editor.css";
type __VLS_Props = {
    modelValue: DiagramSpec;
};
declare function hasChanges(): boolean;
declare function resetDraft(): void;
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {
    hasChanges: typeof hasChanges;
    resetDraft: typeof resetDraft;
}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: DiagramSpec) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    "onUpdate:modelValue"?: ((value: DiagramSpec) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
