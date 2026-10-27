<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'vue';
import { renderDiagram } from './render';
import { resolveTheme } from './themes';
import { validateSpec } from './validate';
import { createHtml, exportSvgImage } from './export';
import type { StudioRuntime } from './export';
import type { DiagramSpec, ExportOptions, RenderedDiagram } from './types';

const props = defineProps<{ spec: DiagramSpec; runtime?: StudioRuntime; elementSelection?: boolean }>();
const emit = defineEmits<{
  rendered: [diagram: RenderedDiagram, spec: DiagramSpec];
  error: [error: Error];
  loading: [loading: boolean];
  selectElement: [key: string];
}>();
const diagram = shallowRef<RenderedDiagram>();
const applied = shallowRef<DiagramSpec>();
const pending = ref(false);
const failure = ref('');
const stage = ref<HTMLElement>();
const artboard = ref<HTMLElement>();
const availableWidth = ref(900);
const availableHeight = ref(600);
const zoom = ref<number | 'fit'>('fit');
const zoomValue = computed(() => zoom.value === 'fit' ? Math.min(1, Math.max(0.05, Math.min(availableWidth.value / (diagram.value?.width ?? 900), availableHeight.value / (diagram.value?.height ?? 600)))) : zoom.value);
const transparent = computed(() => applied.value ? resolveTheme(applied.value).background === 'transparent' : false);
const dragging = ref(false);
let pan: { pointerId: number; x: number; y: number; left: number; top: number; target?: Element; moved: boolean } | undefined;
let request = 0;
let zoomRequest = 0;
let observer: ResizeObserver | undefined;
let firstRender = true;
let resolveReady!: () => void;
let rejectReady!: (reason: Error) => void;
const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
void ready.catch(() => {});

async function setSpec(input: DiagramSpec): Promise<void> {
  const ticket = ++request;
  pending.value = true;
  failure.value = '';
  emit('loading', true);
  try {
    const candidate = structuredClone(validateSpec(toRaw(input)));
    const rendered = await renderDiagram(candidate);
    if (ticket !== request) return;
    diagram.value = rendered;
    applied.value = candidate;
    emit('rendered', rendered, structuredClone(candidate));
    if (firstRender) { firstRender = false; resolveReady(); }
  } catch (reason) {
    if (ticket !== request) return;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    failure.value = error.message;
    emit('error', error);
    if (firstRender) { firstRender = false; rejectReady(error); }
    throw error;
  } finally {
    if (ticket === request) { pending.value = false; emit('loading', false); }
  }
}
function getSpec(): DiagramSpec {
  if (!applied.value) throw new Error('图表尚未完成渲染。');
  return structuredClone(applied.value);
}
function getSvg(): string {
  if (!diagram.value) throw new Error('图表尚未完成渲染。');
  return diagram.value.svg;
}
async function exportImage(options?: ExportOptions): Promise<Blob> {
  const svg = diagram.value?.svg;
  await ready;
  return exportSvgImage(svg ?? getSvg(), options);
}
function saveHtml(): string { return createHtml(getSpec(), props.runtime); }
async function setZoom(value: number, anchor?: { x: number; y: number }): Promise<void> {
  const viewport = stage.value;
  const board = artboard.value;
  if (!viewport || !board || !diagram.value) return;
  const viewportRect = viewport.getBoundingClientRect();
  const point = anchor ?? { x: viewportRect.left + viewport.clientWidth / 2, y: viewportRect.top + viewport.clientHeight / 2 };
  const before = board.getBoundingClientRect();
  const oldScale = before.width / diagram.value.width;
  const localX = (point.x - before.left) / oldScale;
  const localY = (point.y - before.top) / oldScale;
  const ticket = ++zoomRequest;
  zoom.value = Math.min(4, Math.max(0.05, value));
  await nextTick();
  if (ticket !== zoomRequest || !artboard.value || !stage.value) return;
  const after = artboard.value.getBoundingClientRect();
  stage.value.scrollLeft += after.left + localX * zoomValue.value - point.x;
  stage.value.scrollTop += after.top + localY * zoomValue.value - point.y;
}
function changeZoom(delta: number): void { void setZoom(Math.round((zoomValue.value + delta) * 100) / 100); }
async function fitCanvas(): Promise<void> {
  zoomRequest++;
  zoom.value = 'fit';
  await nextTick();
  if (stage.value) { stage.value.scrollLeft = 0; stage.value.scrollTop = 0; }
}
function wheelZoom(event: WheelEvent): void {
  if (!diagram.value || !artboard.value) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
  event.preventDefault();
  const pixels = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? availableHeight.value : 1);
  void setZoom(zoomValue.value * Math.exp(-Math.max(-300, Math.min(300, pixels)) * 0.0015), { x: event.clientX, y: event.clientY });
}
function startPan(event: PointerEvent): void {
  const viewport = stage.value;
  if (!viewport || !diagram.value || pan || !event.isPrimary || event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, summary, [contenteditable="true"]')) return;
  const rect = viewport.getBoundingClientRect();
  // Leave the native scrollbars draggable rather than capturing their pointer.
  if (event.clientX - rect.left >= viewport.clientWidth || event.clientY - rect.top >= viewport.clientHeight) return;
  viewport.setPointerCapture(event.pointerId);
  pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, target: event.target instanceof Element ? event.target : undefined, moved: false };
  dragging.value = true;
  event.preventDefault();
}
function movePan(event: PointerEvent): void {
  if (!pan || pan.pointerId !== event.pointerId || !stage.value) return;
  if (Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > 5) pan.moved = true;
  stage.value.scrollLeft = pan.left - (event.clientX - pan.x);
  stage.value.scrollTop = pan.top - (event.clientY - pan.y);
}
function endPan(event?: PointerEvent): void {
  if (!pan || (event && pan.pointerId !== event.pointerId)) return;
  const pointerId = pan.pointerId;
  const target = pan.target;
  const selected = event?.type === 'pointerup' && !pan.moved && props.elementSelection && !pending.value;
  if (selected && target) {
    const element = target.closest('[data-editor-key], .uml-container');
    let key = element?.getAttribute('data-editor-key');
    if (!key && element) {
      const lane = element.getAttribute('data-lane-id');
      const group = element.getAttribute('data-group-id');
      const field = group ? 'groups' : 'lanes';
      const index = applied.value?.[field]?.findIndex(item => item.id === (group ?? lane));
      if (index !== undefined && index >= 0) key = `${field}/${index}`;
    }
    if (key) emit('selectElement', key);
  }
  pan = undefined;
  dragging.value = false;
  if (stage.value?.hasPointerCapture(pointerId)) stage.value.releasePointerCapture(pointerId);
}
function measureStage(): void {
  const viewport = stage.value;
  if (!viewport) return;
  const style = getComputedStyle(viewport);
  availableWidth.value = Math.max(1, viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
  availableHeight.value = Math.max(1, viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
}
watch(() => props.spec, value => { void setSpec(value).catch(() => {}); }, { immediate: true, deep: true });
onMounted(() => {
  if (!stage.value) return;
  measureStage();
  observer = new ResizeObserver(measureStage);
  observer.observe(stage.value);
  stage.value.addEventListener('wheel', wheelZoom, { passive: false });
});
onBeforeUnmount(() => {
  request++; zoomRequest++;
  endPan();
  observer?.disconnect();
  stage.value?.removeEventListener('wheel', wheelZoom);
});
defineExpose({ ready, getSpec, setSpec, getSvg, exportImage, saveHtml });
</script>

<template>
  <section class="diagram-canvas" aria-label="图表预览" :aria-busy="pending">
    <div class="canvas-toolbar">
      <div class="canvas-status"><span class="status-dot" :class="{ busy: pending, failed: failure }"></span>{{ pending ? '正在排版' : failure ? '保留上次成功结果' : '实时预览' }}<span v-if="diagram" class="canvas-dimensions">{{ Math.round(diagram.width) }} × {{ Math.round(diagram.height) }}</span></div>
      <div class="zoom-tools" aria-label="缩放控制">
        <button type="button" aria-label="缩小" :disabled="!diagram || zoomValue <= 0.05" @click="changeZoom(-0.1)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <span class="zoom-value">{{ Math.round(zoomValue * 100) }}%</span>
        <button type="button" aria-label="放大" :disabled="!diagram || zoomValue >= 4" @click="changeZoom(0.1)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <span class="toolbar-divider"></span>
        <button type="button" class="fit-button" :class="{ active: zoom === 1 }" :disabled="!diagram" @click="setZoom(1)">原始大小</button>
        <button type="button" class="fit-button" :class="{ active: zoom === 'fit' }" :disabled="!diagram" @click="fitCanvas">适应画布</button>
      </div>
    </div>
    <div ref="stage" class="canvas-stage" :class="{ 'is-dragging': dragging, 'can-select-elements': elementSelection }" tabindex="0" aria-label="图表画布，滚轮缩放，按住拖动平移，也可用滚动条浏览" @pointerdown="startPan" @pointermove="movePan" @pointerup="endPan" @pointercancel="endPan" @lostpointercapture="endPan">
      <div v-if="diagram" ref="artboard" class="canvas-artboard" :class="{ 'is-transparent': transparent }" :style="{ width: `${diagram.width * zoomValue}px`, height: `${diagram.height * zoomValue}px` }">
        <div class="canvas-svg" :style="{ width: `${diagram.width}px`, height: `${diagram.height}px`, transform: `scale(${zoomValue})` }" v-html="diagram.svg"></div>
      </div>
      <div v-else class="canvas-empty"><svg class="loading-ring" viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 1 1-9 9" /></svg><strong>{{ failure ? '暂时无法绘制图表' : '正在整理你的想法…' }}</strong><p>{{ failure || '布局引擎正在安排每一个节点与连接。' }}</p></div>
    </div>
    <div v-if="failure && diagram" class="canvas-error" role="status">未替换当前图表：{{ failure }}</div>
    <div class="canvas-footer"><span>滚轮定位缩放 · 按住拖动画布 · 本地字体</span><span>{{ zoom === 'fit' ? '自适应' : '手动缩放' }}</span></div>
  </section>
</template>

<style>
/* 自包含令牌：与 docs/uml-studio-redesign.md §2 的 :root 同名同值，
   使 .studio-shell 覆盖与本组件独立使用（库构建）时取值一致。 */
.diagram-canvas {
  --paper: #ffffff;
  --paper-2: #f4f8fb;
  --ink: #1b2b3a;
  --muted: #54697d;
  --faint: #8ba0b3;
  --line: #dbe4ec;
  --line-strong: #b9c9d6;
  --accent: #0f6fa3;
  --accent-deep: #0b5b87;
  --accent-soft: #e9f4fa;
  --accent-line: #b8d9ea;
  --ring: rgb(14 159 180 / .30);
  --danger: #c2404f;
  --danger-soft: #fdf0f2;
  --warning: #96650f;
  --warning-soft: #fbf3df;
  --success: #2e7d5b;
  --shadow-sm: 0 1px 2px rgb(20 45 66 / .05), 0 2px 6px -1px rgb(20 45 66 / .06);
  --shadow-md: 0 2px 6px -2px rgb(20 45 66 / .07), 0 10px 24px -8px rgb(20 45 66 / .10);
  --shadow-lg: 0 4px 12px -4px rgb(20 45 66 / .08), 0 24px 48px -14px rgb(20 45 66 / .18);
  --r-xs: 6px;
  --r-sm: 9px;
  --r-md: 12px;
  --r-lg: 16px;
  --r-pill: 999px;
  --ease: cubic-bezier(.22, .8, .32, 1);
  --t-fast: .14s;
  --t: .2s;
  box-sizing: border-box;
  color: var(--ink);
  font:
    14px "PingFang SC",
    "Hiragino Sans GB",
    "Microsoft YaHei",
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    sans-serif;
}
.diagram-canvas *,
.diagram-canvas *::before,
.diagram-canvas *::after {
  box-sizing: border-box;
}
.diagram-canvas ::selection {
  background: rgb(14 159 180 / .22);
}
.diagram-canvas button {
  font-family: inherit;
  color: inherit;
  cursor: pointer;
  touch-action: manipulation;
}
.diagram-canvas button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.diagram-canvas button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px var(--ring);
}
.diagram-canvas {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 580px;
  height: clamp(580px, calc(100vh - 235px), 900px);
  background: var(--paper);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}
.canvas-toolbar {
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
  background: var(--paper);
  flex: none;
}
.canvas-status {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  display: flex;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
  min-width: 0;
}
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  flex: none;
}
.status-dot.busy {
  background: var(--warning);
  animation: uml-canvas-pulse 1.2s var(--ease) infinite;
}
.status-dot.failed {
  background: var(--danger);
}
.canvas-dimensions {
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  padding-left: 4px;
}
.zoom-tools {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--paper-2);
  border-radius: 8px;
  white-space: nowrap;
  flex: none;
}
.zoom-tools button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  transition:
    background-color var(--t-fast) var(--ease),
    color var(--t-fast) var(--ease),
    box-shadow var(--t-fast) var(--ease);
}
.zoom-tools button svg {
  width: 15px;
  height: 15px;
  flex: none;
}
.zoom-tools button:hover:not(:disabled) {
  background: var(--paper);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}
.zoom-tools button:active:not(:disabled) {
  box-shadow: none;
}
.zoom-value {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  min-width: 40px;
  text-align: center;
  padding: 0 2px;
}
.toolbar-divider {
  display: block;
  width: 1px;
  height: 14px;
  background: var(--line);
  margin: 0 3px;
  flex: none;
}
.zoom-tools .fit-button {
  width: auto;
  padding: 0 9px;
  font-size: 12px;
  font-weight: 500;
}
.zoom-tools .fit-button.active,
.zoom-tools .fit-button.active:hover:not(:disabled) {
  background: var(--accent-soft);
  color: var(--accent);
}
.canvas-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  background-color: var(--paper-2);
  background-image: radial-gradient(circle, #c3d2de 1px, transparent 1px);
  background-size: 20px 20px;
  padding: 36px 32px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
  touch-action: none;
  cursor: grab;
  user-select: none;
  overscroll-behavior: contain;
}
.canvas-artboard {
  flex: none;
  position: relative;
  margin: auto;
  background-color: #ffffff;
  box-shadow:
    0 2px 8px rgb(20 45 66 / .08),
    0 16px 40px -12px rgb(20 45 66 / .16);
}
.canvas-svg {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}
.canvas-svg > svg {
  display: block;
}
.canvas-stage.is-dragging {
  cursor: grabbing;
}
.canvas-stage.can-select-elements:not(.is-dragging) [data-editor-key],
.canvas-stage.can-select-elements:not(.is-dragging) .uml-container {
  cursor: pointer;
}
.canvas-stage:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  box-shadow: inset 0 0 0 4px var(--ring);
}
.canvas-artboard.is-transparent {
  background-color: #ffffff;
  background-image: conic-gradient(
    #e5e8eb 25%,
    #ffffff 0 50%,
    #e5e8eb 0 75%,
    #ffffff 0
  );
  background-size: 18px 18px;
}
.canvas-empty {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--muted);
  text-align: center;
  max-width: 320px;
  padding: 0 16px;
}
.canvas-empty strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.canvas-empty p {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.7;
  margin: 0;
  overflow-wrap: anywhere;
}
.loading-ring {
  width: 26px;
  height: 26px;
  flex: none;
  animation: uml-canvas-spin 1s linear infinite;
}
.loading-ring circle {
  stroke: var(--line);
}
.loading-ring path {
  stroke: var(--accent);
}
.canvas-footer {
  height: 34px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  font-size: 12px;
  color: var(--faint);
  border-top: 1px solid var(--line);
  background: var(--paper);
  flex: none;
  gap: 10px;
}
.canvas-error {
  background: var(--warning-soft);
  border-top: 1px solid rgb(150 101 15 / .18);
  padding: 10px 16px;
  font-size: 12px;
  color: var(--warning);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
@keyframes uml-canvas-pulse {
  50% {
    opacity: 0.35;
  }
}
@keyframes uml-canvas-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (min-width: 1600px) {
  .diagram-canvas {
    min-height: 660px;
  }
  .canvas-stage {
    min-height: 0;
  }
}
@media (max-width: 1250px) {
  .canvas-toolbar {
    padding: 0 12px;
    gap: 6px;
  }
  .canvas-dimensions {
    display: none;
  }
  .canvas-stage {
    padding: 28px 24px;
  }
  .canvas-footer {
    font-size: 11px;
    padding: 0 12px;
  }
}
@media (max-width: 1050px) {
  .diagram-canvas {
    min-height: 510px;
    height: 560px;
  }
  .canvas-stage {
    min-height: 0;
  }
  .canvas-dimensions {
    display: inline;
  }
}
@media (max-width: 760px) {
  .diagram-canvas {
    min-height: 470px;
    height: 500px;
  }
  .canvas-stage {
    min-height: 0;
    padding: 24px;
  }
  .canvas-toolbar {
    height: 44px;
    padding: 0 12px;
  }
  .canvas-footer {
    height: 32px;
    padding: 0 14px;
    font-size: 11px;
  }
}
@media (max-width: 480px) {
  .canvas-dimensions {
    display: none;
  }
  .canvas-toolbar {
    padding: 0 10px;
  }
  .canvas-stage {
    padding: 20px 16px;
    min-height: 330px;
  }
  .diagram-canvas {
    min-height: 415px;
  }
  .canvas-footer {
    font-size: 11px;
  }
  .canvas-footer > span:last-child {
    display: none;
  }
  .zoom-tools .fit-button {
    font-size: 11px;
    padding: 0 6px;
  }
}
@media print {
  .canvas-toolbar,
  .canvas-footer {
    display: none !important;
  }
  .diagram-canvas {
    border: 0;
    box-shadow: none;
    min-height: 0;
    height: auto;
    overflow: visible;
  }
  .canvas-stage {
    background: none;
    padding: 0;
    overflow: visible;
    min-height: 0;
  }
  .canvas-artboard {
    box-shadow: none;
    margin: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .diagram-canvas *,
  .diagram-canvas *::before,
  .diagram-canvas *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
