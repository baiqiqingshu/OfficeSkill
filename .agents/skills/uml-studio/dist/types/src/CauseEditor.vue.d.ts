import type { FishboneCause } from "./types";
import "./editor.css";
type __VLS_Props = {
    modelValue: FishboneCause;
    path?: string;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: FishboneCause) => any;
    remove: () => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    "onUpdate:modelValue"?: ((value: FishboneCause) => any) | undefined;
    onRemove?: (() => any) | undefined;
}>, {
    path: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
