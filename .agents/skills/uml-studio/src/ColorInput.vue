<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { colorPresets } from "./themes";
import "./editor.css";

const props = defineProps<{
  modelValue: string;
  label: string;
  allowTransparent?: boolean;
  disabled?: boolean;
  id?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const generatedId = useId();
const inputId = computed(() => props.id ?? `uml-color-${generatedId}`);
const root = ref<HTMLElement>();
const paletteButton = ref<HTMLButtonElement>();
const expanded = ref(false);
const text = ref(props.modelValue);
const error = ref("");
const palette = computed(() =>
  colorPresets
    .filter((preset) => preset.value !== "transparent")
    .map((preset) => ({ color: preset.value, name: preset.label })),
);
function normalize(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (props.allowTransparent && trimmed === "transparent") return trimmed;
  const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex))
    return `#${[...hex.slice(1)].map((char) => char + char).join("")}`;
  return undefined;
}
const pickerValue = computed(() =>
  normalize(props.modelValue) === "transparent"
    ? "#ffffff"
    : (normalize(props.modelValue) ?? "#ffffff"),
);
const isTransparent = computed(
  () => props.modelValue.toLowerCase() === "transparent",
);
watch(
  () => props.modelValue,
  (value) => {
    text.value = value;
    error.value = "";
  },
);
function choose(value: string): void {
  if (props.disabled) return;
  text.value = value;
  error.value = "";
  expanded.value = false;
  emit("update:modelValue", value);
}
function commit(): void {
  if (props.disabled) return;
  const value = normalize(text.value);
  if (value === undefined) {
    error.value = `请输入 #RGB 或 #RRGGBB 色值${props.allowTransparent ? "，也可填写 transparent" : ""}`;
    return;
  }
  text.value = value;
  error.value = "";
  emit("update:modelValue", value);
}
function closePalette(restoreFocus = false): void {
  expanded.value = false;
  if (restoreFocus) paletteButton.value?.focus();
}
function outside(event: MouseEvent): void {
  if (!root.value?.contains(event.target as Node)) closePalette();
}
// Close after click activation: pointerdown would move following controls before pointerup.
onMounted(() => document.addEventListener("click", outside));
onBeforeUnmount(() => document.removeEventListener("click", outside));
</script>

<template>
  <div
    ref="root"
    class="uml-color-input"
    @keydown.esc.stop="closePalette(true)"
  >
    <label :for="inputId">{{ label }}</label>
    <div class="uml-color-input__row">
      <span
        class="uml-color-input__sample"
        :class="{ 'uml-checker': isTransparent }"
        :style="isTransparent ? {} : { backgroundColor: modelValue }"
      >
        <input
          type="color"
          :value="pickerValue"
          :disabled="disabled"
          :aria-label="`${label}：系统颜色选择器`"
          @input="choose(($event.target as HTMLInputElement).value)"
        />
      </span>
      <input
        :id="inputId"
        v-model="text"
        type="text"
        :disabled="disabled"
        spellcheck="false"
        autocomplete="off"
        placeholder="#2167a8"
        :aria-invalid="Boolean(error)"
        :aria-describedby="error ? `${inputId}-error` : undefined"
        @input="error = ''"
        @blur="commit"
        @keydown.enter.prevent="commit"
      />
      <button
        ref="paletteButton"
        type="button"
        :disabled="disabled"
        :aria-expanded="expanded"
        :aria-controls="`${inputId}-palette`"
        :aria-label="`${label}：展开预设色板`"
        @click="expanded = !expanded"
      >
        色板
      </button>
    </div>
    <p
      v-if="error"
      :id="`${inputId}-error`"
      class="uml-editor-error"
      role="status"
    >
      {{ error }}
    </p>
    <div
      v-if="expanded"
      :id="`${inputId}-palette`"
      class="uml-color-input__palette"
      role="group"
      :aria-label="`${label}主题配色`"
    >
      <div class="uml-editor-heading">
        <strong>主题精选配色</strong
        ><button
          type="button"
          aria-label="关闭色板"
          @click="closePalette(true)"
        >
          关闭
        </button>
      </div>
      <div class="uml-color-input__swatches">
        <button
          v-for="swatch in palette"
          :key="swatch.color"
          type="button"
          :disabled="disabled"
          :style="{ backgroundColor: swatch.color }"
          :title="`${swatch.name} ${swatch.color}`"
          :aria-label="`${label}：${swatch.name} ${swatch.color}`"
          :aria-pressed="normalize(modelValue) === swatch.color"
          @click="choose(swatch.color)"
        >
          <span v-if="normalize(modelValue) === swatch.color" aria-hidden="true"
            >✓</span
          >
        </button>
      </div>
      <button
        v-if="allowTransparent"
        type="button"
        class="uml-color-input__transparent"
        :disabled="disabled"
        :aria-pressed="isTransparent"
        @click="choose('transparent')"
      >
        <span class="uml-checker" aria-hidden="true" />透明 / 无背景
      </button>
      <p class="uml-editor-hint">
        可粘贴 3 位或 6 位十六进制色值，回车或离开输入框后应用。
      </p>
    </div>
  </div>
</template>
