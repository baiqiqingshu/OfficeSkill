<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'vue';
import { renderDiagram } from './render';
import { resolveTheme } from './themes';
import { validateSpec } from './validate';
import { createHtml, exportSvgImage } from './export';
import type { StudioRuntime } from './export';
import type { DiagramSpec, ExportOptions, RenderedDiagram } from './types';

const props = defineProps<{ spec: DiagramSpec; runtime?: StudioRuntime }>();
const emit = defineEmits<{
  rendered: [diagram: RenderedDiagram, spec: DiagramSpec];
  error: [error: Error];
  loading: [loading: boolean];
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
let pan: { pointerId: number; x: number; y: number; left: number; top: number } | undefined;
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
  pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  dragging.value = true;
  event.preventDefault();
}
function movePan(event: PointerEvent): void {
  if (!pan || pan.pointerId !== event.pointerId || !stage.value) return;
  stage.value.scrollLeft = pan.left - (event.clientX - pan.x);
  stage.value.scrollTop = pan.top - (event.clientY - pan.y);
}
function endPan(event?: PointerEvent): void {
  if (!pan || (event && pan.pointerId !== event.pointerId)) return;
  const pointerId = pan.pointerId;
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
        <button type="button" aria-label="缩小" :disabled="!diagram || zoomValue <= 0.05" @click="changeZoom(-0.1)">−</button>
        <span class="zoom-value">{{ Math.round(zoomValue * 100) }}%</span>
        <button type="button" aria-label="放大" :disabled="!diagram || zoomValue >= 4" @click="changeZoom(0.1)">+</button>
        <span class="toolbar-divider"></span>
        <button type="button" class="fit-button" :class="{ active: zoom === 1 }" :disabled="!diagram" @click="setZoom(1)">原始大小</button>
        <button type="button" class="fit-button" :class="{ active: zoom === 'fit' }" :disabled="!diagram" @click="fitCanvas">适应画布</button>
      </div>
    </div>
    <div ref="stage" class="canvas-stage" :class="{ 'is-dragging': dragging }" tabindex="0" aria-label="图表画布，滚轮缩放，按住拖动平移，也可用滚动条浏览" @pointerdown="startPan" @pointermove="movePan" @pointerup="endPan" @pointercancel="endPan" @lostpointercapture="endPan">
      <div v-if="diagram" ref="artboard" class="canvas-artboard" :class="{ 'is-transparent': transparent }" :style="{ width: `${diagram.width * zoomValue}px`, height: `${diagram.height * zoomValue}px` }">
        <div class="canvas-svg" :style="{ width: `${diagram.width}px`, height: `${diagram.height}px`, transform: `scale(${zoomValue})` }" v-html="diagram.svg"></div>
      </div>
      <div v-else class="canvas-empty"><span class="loading-ring"></span><strong>{{ failure ? '暂时无法绘制图表' : '正在整理你的想法…' }}</strong><p>{{ failure || '布局引擎正在安排每一个节点与连接。' }}</p></div>
    </div>
    <div v-if="failure && diagram" class="canvas-error" role="status">未替换当前图表：{{ failure }}</div>
    <div class="canvas-footer"><span>滚轮定位缩放 · 按住拖动画布 · 本地字体</span><span>{{ zoom === 'fit' ? '自适应' : '手动缩放' }}</span></div>
  </section>
</template>

<style src="./canvas.css"></style>
