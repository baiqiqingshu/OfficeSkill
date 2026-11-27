<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import ColorInput from "./ColorInput.vue";
import VSelect from "./VSelect.vue";
import {
  fontPresets,
  layoutModes,
  paletteModes,
  paletteTargets,
  resolveLayout,
  resolveTheme,
  themeLabels,
  themes,
} from "./themes";
import type {
  DiagramLayoutOptions,
  DiagramSpec,
  Theme,
  ThemeName,
} from "./types";

const props = defineProps<{
  open: boolean;
  spec: DiagramSpec;
  loading?: boolean;
  onUpdate: (change: (spec: DiagramSpec) => void) => void;
}>();
const emit = defineEmits<{ close: [] }>();

const themeNames = Object.keys(themes) as ThemeName[];
const colorControls = [
  { key: "primary", label: "主色" },
  { key: "secondary", label: "辅助色" },
  { key: "background", label: "画布背景" },
  { key: "surface", label: "节点填色" },
  { key: "text", label: "文字" },
  { key: "border", label: "边框" },
  { key: "muted", label: "次要文字" },
] as const;
const numericControls = [
  { key: "fontSize", label: "字号", min: 8, max: 48, step: 1 },
  { key: "lineWidth", label: "线宽", min: 0.5, max: 8, step: 0.5 },
  { key: "radius", label: "圆角", min: 0, max: 32, step: 1 },
  { key: "nodeWidth", label: "节点基础宽度", min: 80, max: 600, step: 1 },
  { key: "nodeHeight", label: "节点基础高度", min: 32, max: 300, step: 1 },
] as const;
const layoutControls = [
  { key: "maxWidth", label: "绘图最大宽度", min: 0, max: 100000, step: 1, hint: "0 = 不限制；整图等比缩放" },
  { key: "maxHeight", label: "绘图最大高度", min: 0, max: 100000, step: 1, hint: "0 = 不限制；保留全部内容" },
  { key: "nodeMaxWidth", label: "节点最大宽度", min: 0, max: 100000, step: 1, hint: "0 = 不限制；文字自动换行", graphOnly: true },
  { key: "nodeMaxHeight", label: "节点最大高度", min: 0, max: 100000, step: 1, hint: "0 = 不限制；文字自适应", graphOnly: true },
  { key: "regionGap", label: "区域 / 分组间距", min: 0, max: 600, step: 1, hint: "分组或分析维度间距；泳道连续相接" },
  { key: "elementGap", label: "元素间距", min: 8, max: 400, step: 1, hint: "节点、消息或原因之间的间距" },
  { key: "maxPerColumn", label: "每列最多节点", min: 0, max: 30, step: 1, hint: "0 = 不限制；区域内自动换列", graphOnly: true },
] as const;

const currentTheme = computed(() => resolveTheme(props.spec));
const graphDiagram = computed(
  () => props.spec.type !== "sequence" && props.spec.type !== "fishbone",
);
const selectedFont = computed(() =>
  fontPresets.some((font) => font.value === currentTheme.value.fontFamily)
    ? currentTheme.value.fontFamily
    : "",
);
function selectTheme(name: ThemeName): void {
  props.onUpdate((spec) => {
    spec.theme = name;
    delete spec.style;
  });
}
function updateStyle(key: keyof Theme, value: string | number): void {
  props.onUpdate((spec) => {
    spec.style = { ...spec.style, [key]: value };
  });
}
function updateLayout(
  key: keyof DiagramLayoutOptions,
  value: number | boolean | "bridge" | "plain",
): void {
  props.onUpdate((spec) => {
    spec.layout = { ...spec.layout, [key]: value };
  });
}
function selectLayoutMode(
  mode: NonNullable<DiagramLayoutOptions["mode"]>,
): void {
  props.onUpdate((spec) => {
    spec.layout = { ...spec.layout, mode };
    delete spec.layout.elementGap;
    delete spec.layout.regionGap;
    if (spec.style) {
      delete spec.style.gap;
      if (!Object.keys(spec.style).length) delete spec.style;
    }
  });
}
function layoutValue(key: keyof DiagramLayoutOptions): number {
  const value = resolveLayout(props.spec)[key];
  return typeof value === "number" ? value : 0;
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
}
watch(
  () => props.open,
  (open) => {
    if (open) document.addEventListener("keydown", onKeydown);
    else document.removeEventListener("keydown", onKeydown);
  },
);
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-scrim" @pointerdown.self="emit('close')">
      <section
        class="style-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="图形样式与布局"
      >
        <header class="dialog-head">
          <h2>图形样式与布局</h2>
          <div class="dialog-head-actions">
            <button
              class="text-button"
              type="button"
              :disabled="!spec.style"
              @click="onUpdate((spec) => void delete spec.style)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"/></svg>
              重置定制
            </button>
            <button class="icon-button dialog-close" type="button" aria-label="关闭样式面板" @click="emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18 18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </header>
        <div class="dialog-body">
          <div class="section-heading">
            <h3>主题</h3>
            <span class="section-meta">{{ themeNames.length }} 套</span>
          </div>
          <div class="theme-grid" aria-label="主题预设">
            <button
              v-for="name in themeNames"
              :key="name"
              type="button"
              class="theme-option"
              :class="{ selected: (spec.theme ?? 'modern') === name }"
              :aria-pressed="(spec.theme ?? 'modern') === name"
              @click="selectTheme(name)"
            >
              <span
                class="theme-preview"
                :style="{
                  background: themes[name].background,
                  borderColor: themes[name].border,
                }"
                ><template v-if="themes[name].palette"
                  ><i
                    v-for="color in themes[name].palette!.slice(0, 4)"
                    :key="color"
                    class="palette-swatch"
                    :class="themes[name].paletteMode"
                    :style="{ background: color }"
                  ></i></template
                ><template v-else
                  ><i :style="{ background: themes[name].primary }"></i
                  ><i :style="{ background: themes[name].secondary }"></i
                ></template
              ></span
              ><span>{{ themeLabels[name] }}</span>
            </button>
          </div>

          <div class="palette-controls">
            <label class="field-label" for="palette-mode">多色模式<span class="select-wrap"><VSelect
              id="palette-mode"
              class="select-input"
              :value="currentTheme.paletteMode ?? (currentTheme.palette?.length ? 'tint' : 'mono')"
              @change="updateStyle('paletteMode', ($event.target as HTMLSelectElement).value)"
            ><option v-for="mode in paletteModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option></VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
            <label class="field-label" for="palette-by">着色依据<span class="select-wrap"><VSelect
              id="palette-by"
              class="select-input"
              :disabled="(currentTheme.paletteMode ?? (currentTheme.palette?.length ? 'tint' : 'mono')) === 'mono'"
              :value="currentTheme.paletteBy ?? 'auto'"
              @change="updateStyle('paletteBy', ($event.target as HTMLSelectElement).value)"
            ><option v-for="target in paletteTargets" :key="target.value" :value="target.value">{{ target.label }}</option></VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
          </div>

          <details class="advanced-styles" open>
            <summary>
              <svg class="summary-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>自定义配色<span v-if="spec.style" class="custom-badge">已定制</span>
            </summary>
            <div class="advanced-inner">
              <div class="studio-colors">
                <ColorInput
                  v-for="control in colorControls"
                  :key="control.key"
                  :model-value="currentTheme[control.key]"
                  :label="control.label"
                  :allow-transparent="control.key === 'background' || control.key === 'surface'"
                  @update:model-value="updateStyle(control.key, $event)"
                />
              </div>
            </div>
          </details>

          <details class="advanced-styles">
            <summary>
              <svg class="summary-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>字体与细节
            </summary>
            <div class="advanced-inner">
              <label class="field-label" for="font-preset">字体预设（只使用本机字体）</label>
              <span class="select-wrap"><VSelect
                id="font-preset"
                class="select-input"
                :value="selectedFont"
                @change="($event.target as HTMLSelectElement).value && updateStyle('fontFamily', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">自定义字体</option>
                <option v-for="font in fontPresets" :key="font.value" :value="font.value">{{ font.label }}</option>
              </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
              <label class="field-label" for="font-family">自定义字体 / 回退列表</label>
              <input
                id="font-family"
                class="text-input"
                type="text"
                :value="currentTheme.fontFamily"
                @change="updateStyle('fontFamily', ($event.target as HTMLInputElement).value)"
              />
              <div class="font-format-row">
                <label for="font-weight">字重<span class="select-wrap"><VSelect
                  id="font-weight"
                  class="select-input"
                  :value="currentTheme.fontWeight"
                  @change="updateStyle('fontWeight', Number(($event.target as HTMLSelectElement).value))"
                >
                  <option :value="300">300 轻体</option>
                  <option :value="400">400 常规</option>
                  <option :value="500">500 中等</option>
                  <option :value="600">600 半粗</option>
                  <option :value="700">700 粗体</option>
                  <option :value="800">800 特粗</option>
                  <option :value="900">900 重体</option>
                </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
                <button
                  type="button"
                  class="format-button"
                  :aria-pressed="currentTheme.fontStyle === 'italic'"
                  @click="updateStyle('fontStyle', currentTheme.fontStyle === 'italic' ? 'normal' : 'italic')"
                >
                  <i>I</i><span>斜体</span></button>
                <button
                  type="button"
                  class="format-button"
                  :aria-pressed="currentTheme.textDecoration === 'underline'"
                  @click="updateStyle('textDecoration', currentTheme.textDecoration === 'underline' ? 'none' : 'underline')"
                >
                  <u>U</u><span>下划线</span>
                </button>
              </div>
              <div class="number-grid">
                <label
                  v-for="control in numericControls"
                  :key="control.key"
                  class="number-control"
                  ><span>{{ control.label }} <small>px</small></span
                  ><input
                    class="text-input"
                    type="number"
                    :min="control.min"
                    :max="control.max"
                    :step="control.step"
                    :value="currentTheme[control.key]"
                    @change="updateStyle(control.key, Number(($event.target as HTMLInputElement).value))"
                /></label>
              </div>
            </div>
          </details>

          <details class="advanced-styles">
            <summary>
              <svg class="summary-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>布局与尺寸
            </summary>
            <div class="advanced-inner">
              <template v-if="graphDiagram">
                <label v-if="['activity', 'flowchart', 'swimlane'].includes(spec.type)" class="checkbox-control">
                  <input type="checkbox" :checked="spec.layout?.horizontalStagger === true" @change="updateLayout('horizontalStagger', ($event.target as HTMLInputElement).checked)" />
                  <span>横向相连元素沿流程方向错开</span>
                </label>
                <p v-if="['activity', 'flowchart', 'swimlane'].includes(spec.type)" class="field-hint">关闭时优先保持水平连接；横向泳道对应沿横轴错开。</p>
                <label class="field-label" for="edge-crossing">连线交叉表示</label>
                <span class="select-wrap"><VSelect id="edge-crossing" class="select-input"
                  :value="spec.layout?.edgeCrossing ?? 'bridge'"
                  @change="updateLayout('edgeCrossing', ($event.target as HTMLSelectElement).value as 'bridge' | 'plain')">
                  <option value="bridge">拱桥形跳线（默认）</option>
                  <option value="plain">直接交叉（无圆点）</option>
                </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
                <p class="field-hint">拱桥或无圆点交叉均表示不相连。</p>
              </template>
              <label class="field-label" for="layout-mode">布局模式</label>
              <span class="select-wrap"><VSelect
                id="layout-mode"
                class="select-input layout-mode-select"
                :value="spec.layout?.mode ?? 'balanced'"
                @change="selectLayoutMode(($event.target as HTMLSelectElement).value as NonNullable<DiagramLayoutOptions['mode']>)"
              >
                <option v-for="mode in layoutModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
              </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
              <p class="control-hint">切换模式会恢复该模式的元素 / 区域间距，保留尺寸上限等设置。</p>
              <label class="checkbox-control">
                <input type="checkbox" :checked="spec.layout?.showTitle === true" @change="updateLayout('showTitle', ($event.target as HTMLInputElement).checked)" />
                <span>在图中显示标题和说明</span>
              </label>
              <label class="field-label" for="layout-direction">布局方向</label>
              <span class="select-wrap"><VSelect
                id="layout-direction"
                class="select-input"
                :value="spec.direction ?? (spec.type === 'usecase' ? 'LR' : 'TB')"
                :disabled="!graphDiagram"
                @change="onUpdate((target) => void (target.direction = ($event.target as HTMLSelectElement).value as 'TB' | 'LR'))"
              >
                <option value="TB">从上到下</option>
                <option value="LR">从左到右</option>
              </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
              <p v-if="!graphDiagram" class="control-hint">方向、节点尺寸及每列节点数只用于节点图；时序图和鱼骨图采用专用布局。</p>
              <div class="number-grid layout-number-grid">
                <label
                  v-for="control in layoutControls"
                  :key="control.key"
                  class="number-control"
                  ><span>{{ control.label }}</span
                  ><input
                    class="text-input"
                    type="number"
                    :min="control.min"
                    :max="control.max"
                    :step="control.step"
                    :disabled="'graphOnly' in control && control.graphOnly && !graphDiagram"
                    :value="layoutValue(control.key)"
                    @change="updateLayout(control.key, Number(($event.target as HTMLInputElement).value))"
                  /><small>{{ control.hint }}</small></label>
              </div>
            </div>
          </details>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style>
.dialog-scrim {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(32 36 44 / 0.42);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  animation: dialog-scrim-in 0.16s var(--ease, ease-out);
}
@keyframes dialog-scrim-in {
  from { opacity: 0; }
}
.style-dialog {
  display: flex;
  flex-direction: column;
  width: min(1120px, 100%);
  max-height: calc(100vh - 48px);
  background: var(--paper, #fff);
  border-radius: var(--r-lg, 16px);
  box-shadow: var(--shadow-lg, 0 20px 60px rgb(0 0 0 / 0.25));
  overflow: hidden;
  animation: dialog-pop-in 0.18s var(--ease, ease-out);
}
@keyframes dialog-pop-in {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
}
.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line, #e4e2db);
}
.dialog-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.dialog-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dialog-close {
  color: var(--muted, #5b6370);
}
.dialog-close:hover {
  background: var(--paper-2, #f6f5f1);
  color: var(--ink, #20242c);
}
.dialog-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 20px;
}
.dialog-body .section-heading h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted, #5b6370);
}
@media (prefers-reduced-motion: reduce) {
  .dialog-scrim, .style-dialog { animation: none; }
}
</style>
