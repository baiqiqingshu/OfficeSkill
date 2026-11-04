<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'vue';
import { renderDiagram } from './render';
import { resolveTheme } from './themes';
import { validateSpec } from './validate';
import { createHtml, exportSvgImage } from './export';
import type { StudioRuntime } from './export';
import type { DiagramSpec, ExportOptions, RenderedDiagram } from './types';

const props = defineProps<{ spec: DiagramSpec; runtime?: StudioRuntime; elementSelection?: boolean; positionEditing?: boolean }>();
const emit = defineEmits<{
  rendered: [diagram: RenderedDiagram, spec: DiagramSpec];
  error: [error: Error];
  loading: [loading: boolean];
  selectElement: [key: string];
  adjustElement: [change: { key: string; dx: number; dy: number }];
  adjustWaypoints: [change: { key: string; waypoints: { x: number; y: number }[] }];
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
const selectedEdge = ref('');
const selectedPoint = ref(-1);
const selectedWaypoints = computed(() => applied.value?.layout?.adjustments?.edges?.[selectedEdge.value]?.waypoints ?? []);
const supportsWaypoints = computed(() => props.spec.type !== 'sequence' && props.spec.type !== 'fishbone');
type PositionPoint = { x: number; y: number };
let positionDrag: { pointerId: number; origin: PositionPoint; clientX: number; clientY: number; moved: boolean; key: string; element?: SVGGraphicsElement; originalTransform?: string | null; pointIndex?: number; points?: PositionPoint[]; dx: number; dy: number } | undefined;
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
  finishPositionDrag();
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
    await nextTick();
    if (ticket !== request) return;
    refreshPositionHandles();
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
function layoutRoot(): SVGGraphicsElement | undefined {
  return artboard.value?.querySelector<SVGGraphicsElement>('[data-layout-root]') ?? artboard.value?.querySelector<SVGSVGElement>('svg') ?? undefined;
}
function layoutPoint(clientX: number, clientY: number): PositionPoint | undefined {
  const root = layoutRoot();
  const matrix = root?.getScreenCTM();
  if (!matrix) return;
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}
function refreshPositionHandles(): void {
  const root = layoutRoot();
  if (!root) return;
  root.querySelector('[data-position-handles]')?.remove();
  artboard.value?.querySelectorAll('[data-selected-waypoint-edge]').forEach(element => element.removeAttribute('data-selected-waypoint-edge'));
  if (!props.positionEditing) {
    artboard.value?.querySelectorAll('.canvas-edge-hit').forEach(element => element.remove());
    return;
  }
  const namespace = 'http://www.w3.org/2000/svg';
  artboard.value?.querySelectorAll<SVGGraphicsElement>('[data-waypoint-key]').forEach(edge => {
    if (edge.getAttribute('data-waypoint-key') === selectedEdge.value) edge.setAttribute('data-selected-waypoint-edge', '');
    if (edge.querySelector('.canvas-edge-hit')) return;
    edge.querySelectorAll<SVGPathElement>('path').forEach(path => {
      const hit = document.createElementNS(namespace, 'path');
      hit.setAttribute('d', path.getAttribute('d') ?? '');
      hit.setAttribute('class', 'canvas-edge-hit');
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '16');
      hit.setAttribute('vector-effect', 'non-scaling-stroke');
      path.parentElement?.append(hit);
    });
  });
  if (!selectedEdge.value) return;
  const overlay = document.createElementNS(namespace, 'g');
  overlay.setAttribute('data-position-handles', '');
  selectedWaypoints.value.forEach((point, index) => {
    const circle = document.createElementNS(namespace, 'circle');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', '7');
    circle.setAttribute('class', `canvas-waypoint${selectedPoint.value === index ? ' is-selected' : ''}`);
    circle.setAttribute('data-waypoint-index', String(index));
    circle.setAttribute('vector-effect', 'non-scaling-stroke');
    circle.setAttribute('tabindex', '0');
    circle.setAttribute('role', 'button');
    circle.setAttribute('aria-label', `途经点 ${index + 1}，拖动调整，Delete 删除`);
    overlay.append(circle);
  });
  root.append(overlay);
}
function selectWaypointEdge(key: string): void {
  selectedEdge.value = key;
  selectedPoint.value = -1;
  refreshPositionHandles();
}
function beginPositionDrag(event: PointerEvent): boolean {
  if (!props.positionEditing || pending.value || !(event.target instanceof Element)) return false;
  const handle = event.target.closest<SVGCircleElement>('[data-waypoint-index]');
  const element = event.target.closest<SVGGraphicsElement>('[data-adjustment-key]');
  const origin = layoutPoint(event.clientX, event.clientY);
  if ((!handle && !element) || !origin) return false;
  stage.value?.focus({ preventScroll: true });
  stage.value?.setPointerCapture(event.pointerId);
  if (handle) {
    const index = Number(handle.getAttribute('data-waypoint-index'));
    selectedPoint.value = index;
    positionDrag = { pointerId: event.pointerId, origin, clientX: event.clientX, clientY: event.clientY, moved: false, key: selectedEdge.value, pointIndex: index, points: selectedWaypoints.value.map(point => ({ ...point })), dx: 0, dy: 0 };
    refreshPositionHandles();
  } else if (element) {
    positionDrag = { pointerId: event.pointerId, origin, clientX: event.clientX, clientY: event.clientY, moved: false, key: element.getAttribute('data-adjustment-key')!, element, originalTransform: element.getAttribute('transform'), dx: 0, dy: 0 };
  }
  dragging.value = true;
  event.preventDefault();
  return true;
}
function movePositionDrag(event: PointerEvent): boolean {
  if (!positionDrag || event.pointerId !== positionDrag.pointerId) return false;
  const point = layoutPoint(event.clientX, event.clientY);
  if (!point) return true;
  const drag = positionDrag;
  if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) > 4) drag.moved = true;
  drag.dx = Math.round((point.x - drag.origin.x) * 100) / 100;
  drag.dy = Math.round((point.y - drag.origin.y) * 100) / 100;
  if (drag.element) drag.element.setAttribute('transform', `translate(${drag.dx} ${drag.dy}) ${drag.originalTransform ?? ''}`);
  if (drag.pointIndex !== undefined && drag.points) {
    const original = drag.points[drag.pointIndex]!;
    const circle = layoutRoot()?.querySelector(`[data-waypoint-index="${drag.pointIndex}"]`);
    circle?.setAttribute('cx', String(original.x + drag.dx));
    circle?.setAttribute('cy', String(original.y + drag.dy));
  }
  return true;
}
function finishPositionDrag(event?: PointerEvent): boolean {
  if (!positionDrag || (event && event.pointerId !== positionDrag.pointerId)) return false;
  const drag = positionDrag;
  const commit = event?.type === 'pointerup' && drag.moved;
  positionDrag = undefined;
  dragging.value = false;
  if (drag.element) {
    if (drag.originalTransform === null || drag.originalTransform === undefined) drag.element.removeAttribute('transform');
    else drag.element.setAttribute('transform', drag.originalTransform);
  }
  if (stage.value?.hasPointerCapture(drag.pointerId)) stage.value.releasePointerCapture(drag.pointerId);
  if (commit) {
    if (drag.pointIndex !== undefined && drag.points) {
      const points = drag.points;
      points[drag.pointIndex] = { x: points[drag.pointIndex]!.x + drag.dx, y: points[drag.pointIndex]!.y + drag.dy };
      emit('adjustWaypoints', { key: drag.key, waypoints: points });
    } else emit('adjustElement', { key: drag.key, dx: drag.dx, dy: drag.dy });
  }
  refreshPositionHandles();
  return true;
}
function addWaypoint(event: MouseEvent): void {
  if (!props.positionEditing || pending.value || !(event.target instanceof Element) || event.target.closest('[data-waypoint-index]')) return;
  const edge = event.target.closest<SVGGraphicsElement>('[data-waypoint-key]');
  if (!edge) return;
  const key = edge.getAttribute('data-waypoint-key')!;
  const point = layoutPoint(event.clientX, event.clientY);
  if (!point) return;
  const points = (applied.value?.layout?.adjustments?.edges?.[key]?.waypoints ?? []).map(value => ({ ...value }));
  const path = edge.querySelector<SVGPathElement>('path:not(.canvas-edge-hit)');
  let insertAt = points.length;
  if (path) {
    const first = path.getPointAtLength(0), last = path.getPointAtLength(path.getTotalLength());
    const chain = [first, ...points, last];
    let closest = Infinity;
    for (let index = 0; index < chain.length - 1; index++) {
      const start = chain[index]!, end = chain[index + 1]!;
      const vx = end.x - start.x, vy = end.y - start.y;
      const t = Math.max(0, Math.min(1, ((point.x - start.x) * vx + (point.y - start.y) * vy) / (vx * vx + vy * vy || 1)));
      const distance = Math.hypot(point.x - start.x - t * vx, point.y - start.y - t * vy);
      if (distance < closest) { closest = distance; insertAt = index; }
    }
  }
  points.splice(insertAt, 0, { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 });
  selectedEdge.value = key;
  selectedPoint.value = insertAt;
  emit('adjustWaypoints', { key, waypoints: points });
  event.preventDefault();
}
function removeWaypoint(): void {
  if (!selectedEdge.value || selectedPoint.value < 0 || pending.value) return;
  const points = selectedWaypoints.value.filter((_, index) => index !== selectedPoint.value).map(point => ({ ...point }));
  selectedPoint.value = -1;
  emit('adjustWaypoints', { key: selectedEdge.value, waypoints: points });
}
function clearWaypoints(): void {
  if (!selectedEdge.value || !selectedWaypoints.value.length || pending.value) return;
  selectedPoint.value = -1;
  emit('adjustWaypoints', { key: selectedEdge.value, waypoints: [] });
}
function positionKeydown(event: KeyboardEvent): void {
  if (!props.positionEditing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'Escape') {
    finishPositionDrag(); endPan(); selectedEdge.value = ''; selectedPoint.value = -1; refreshPositionHandles(); event.preventDefault();
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedPoint.value >= 0) {
    removeWaypoint(); event.preventDefault();
  }
}
function startPan(event: PointerEvent): void {
  const viewport = stage.value;
  if (!viewport || !diagram.value || pan || positionDrag || !event.isPrimary || event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, summary, [contenteditable="true"]')) return;
  const rect = viewport.getBoundingClientRect();
  // Leave the native scrollbars draggable rather than capturing their pointer.
  if (event.clientX - rect.left >= viewport.clientWidth || event.clientY - rect.top >= viewport.clientHeight) return;
  if (beginPositionDrag(event)) return;
  if (props.positionEditing && event.target instanceof Element) {
    const edge = event.target.closest('[data-waypoint-key]');
    if (edge) {
      selectWaypointEdge(edge.getAttribute('data-waypoint-key')!);
      stage.value?.focus({ preventScroll: true });
      // Keep clicks on the edge: pointer capture retargets dblclick to the viewport.
      event.preventDefault();
      return;
    }
    else { selectedEdge.value = ''; selectedPoint.value = -1; refreshPositionHandles(); }
  }
  viewport.setPointerCapture(event.pointerId);
  pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, target: event.target instanceof Element ? event.target : undefined, moved: false };
  dragging.value = true;
  event.preventDefault();
}
function movePan(event: PointerEvent): void {
  if (movePositionDrag(event)) return;
  if (!pan || pan.pointerId !== event.pointerId || !stage.value) return;
  if (Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > 5) pan.moved = true;
  stage.value.scrollLeft = pan.left - (event.clientX - pan.x);
  stage.value.scrollTop = pan.top - (event.clientY - pan.y);
}
function endPan(event?: PointerEvent): void {
  if (finishPositionDrag(event)) return;
  if (!pan || (event && pan.pointerId !== event.pointerId)) return;
  const pointerId = pan.pointerId;
  const target = pan.target;
  const selected = event?.type === 'pointerup' && !pan.moved && props.elementSelection && !props.positionEditing && !pending.value;
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
watch(() => props.positionEditing, () => {
  finishPositionDrag(); endPan(); selectedEdge.value = ''; selectedPoint.value = -1; refreshPositionHandles();
});
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
    <div v-if="positionEditing" class="canvas-position-tools" role="status">
      <span>{{ supportsWaypoints ? '拖动元素调整位置；双击连线添加途经点。选中点后可拖动或按 Delete 删除，Esc 取消。' : '拖动元素调整位置，Esc 取消；时序消息横向拖动调整文字、纵向拖动调整消息行。' }}</span>
      <div v-if="selectedEdge" class="canvas-waypoint-actions">
        <span>{{ selectedWaypoints.length }} 个途经点</span>
        <button type="button" :disabled="selectedPoint < 0 || pending" @click="removeWaypoint">删除选中点</button>
        <button type="button" :disabled="!selectedWaypoints.length || pending" @click="clearWaypoints">清空此连线途经点</button>
      </div>
    </div>
    <div ref="stage" class="canvas-stage" :class="{ 'is-dragging': dragging, 'can-select-elements': elementSelection && !positionEditing, 'is-position-editing': positionEditing }" tabindex="0" :aria-label="positionEditing ? '位置调整画布，拖动元素调整，双击连线添加途经点，Esc 取消' : '图表画布，滚轮缩放，按住拖动平移，也可用滚动条浏览'" @pointerdown="startPan" @pointermove="movePan" @pointerup="endPan" @pointercancel="endPan" @lostpointercapture="endPan" @dblclick="addWaypoint" @keydown="positionKeydown">
      <div v-if="diagram" ref="artboard" class="canvas-artboard" :class="{ 'is-transparent': transparent }" :style="{ width: `${diagram.width * zoomValue}px`, height: `${diagram.height * zoomValue}px` }">
        <div class="canvas-svg" :style="{ width: `${diagram.width}px`, height: `${diagram.height}px`, transform: `scale(${zoomValue})` }" v-html="diagram.svg"></div>
      </div>
      <div v-else class="canvas-empty"><svg class="loading-ring" viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 1 1-9 9" /></svg><strong>{{ failure ? '暂时无法绘制图表' : '正在整理你的想法…' }}</strong><p>{{ failure || '布局引擎正在安排每一个节点与连接。' }}</p></div>
    </div>
    <div v-if="failure && diagram" class="canvas-error" role="status">未替换当前图表：{{ failure }}</div>
    <div class="canvas-footer"><span>{{ positionEditing ? '拖动元素调整 · 空白处拖动平移 · 调整后请保存 HTML' : '滚轮定位缩放 · 按住拖动画布 · 本地字体' }}</span><span>{{ zoom === 'fit' ? '自适应' : '手动缩放' }}</span></div>
  </section>
</template>

<style>
/* 自包含令牌：与 docs/frontend-redesign-r5.md §2.1 的 :root 同名同值，
   使 .studio-shell 覆盖与本组件独立使用（库构建）时取值一致。 */
.diagram-canvas {
  /* 中性：暖纸底 + 冷墨文字 */
  --bg: #f3f2ee;            /* 应用背景，暖纸灰 */
  --paper: #ffffff;         /* 卡片/面板 */
  --paper-2: #f6f5f1;       /* 凹陷面：画布底、井区、分段控件底 */
  --ink: #20242c;           /* 主文字，近黑 */
  --muted: #5b6370;         /* 次要文字 */
  --faint: #969da9;         /* 三级文字/占位 */
  --line: #e4e2db;          /* 平面元素描边（暖调） */
  --line-strong: #c5cad2;   /* 悬停描边 */

  /* 品牌：松绿（渐变仅 logo 方块 / 顶栏发丝线 / 聚焦光环） */
  --brand-from: #0a5a48;
  --brand-to:   #13a07c;
  --gradient-brand: linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%);
  --gradient-brand-hover: linear-gradient(135deg, #084c3e 0%, #0f8a6b 100%);
  --primary: #1f2430;       /* 主按钮近黑实色 */
  --primary-hover: #38404e;
  --accent: #0d6e55;        /* 链接/选中/聚焦实色，白底对比度 ≥4.5:1 */
  --accent-deep: #0a5843;
  --accent-soft: #e9f4f0;   /* 选中态淡底 */
  --accent-line: #bcdfd2;   /* 淡描边 */
  --ring: rgb(13 110 85 / .25);

  /* 状态 */
  --danger: #bf4234;  --danger-soft: #fdf0ed;  --danger-line: #ecc9c4;
  --warning: #8f5f0e; --warning-soft: #faf2de;
  --success: #2e7d58; --success-soft: #e9f4ee;

  /* 柔和弥散阴影（暖墨色调；浮层只用阴影不描边） */
  --shadow-sm: 0 1px 2px rgb(33 36 44 / .05), 0 1px 4px -1px rgb(33 36 44 / .05);
  --shadow-md: 0 2px 8px -2px rgb(33 36 44 / .08), 0 12px 28px -12px rgb(33 36 44 / .12);
  --shadow-lg: 0 4px 14px -4px rgb(33 36 44 / .10), 0 28px 56px -18px rgb(33 36 44 / .20);

  /* 圆角 */
  --r-xs: 6px; --r-sm: 9px; --r-md: 12px; --r-lg: 16px; --r-pill: 999px;

  /* 动效 */
  --ease: cubic-bezier(.22, .8, .32, 1);
  --t-fast: .14s; --t: .2s;

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
  background: var(--accent-soft);
}
.diagram-canvas button {
  font-family: inherit;
  color: inherit;
  cursor: pointer;
  touch-action: manipulation;
}
.diagram-canvas button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}
.diagram-canvas button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--ring);
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
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--paper);
  flex: none;
  flex-wrap: wrap;
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
  background: var(--accent);
  animation: uml-canvas-pulse 1.6s var(--ease) infinite;
}
.status-dot.failed {
  background: var(--danger);
}
.canvas-dimensions {
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
  font-size: 12px;
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
  border-radius: var(--r-pill);
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
  border-radius: var(--r-pill);
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
}
.zoom-tools button:active:not(:disabled) {
  background: var(--paper-2);
}
.zoom-value {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  min-width: 42px;
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
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
}
.zoom-tools .fit-button.active,
.zoom-tools .fit-button.active:hover:not(:disabled) {
  background: var(--paper);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}
.canvas-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 12px;
  overflow: auto;
  background-color: var(--paper-2);
  background-image: radial-gradient(circle, rgb(33 36 44 / .13) 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: center;
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
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
  background-color: var(--paper);
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--t) var(--ease);
}
.canvas-artboard:hover {
  box-shadow: var(--shadow-md);
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
.canvas-position-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 10px 16px;
  color: var(--accent-deep);
  background: var(--accent-soft);
  font-size: 12px;
  line-height: 1.6;
}
.canvas-waypoint-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.canvas-waypoint-actions button {
  padding: 5px 9px;
  background: var(--paper);
  color: var(--accent-deep);
  border: 1px solid var(--accent-line);
  border-radius: var(--r-xs);
  font-size: 12px;
}
.canvas-waypoint-actions button:hover:not(:disabled) { background: var(--accent-soft); }
.canvas-stage.is-position-editing [data-adjustment-key] { cursor: move; }
.canvas-stage.is-position-editing [data-waypoint-key] { cursor: crosshair; }
.canvas-stage.is-position-editing [data-selected-waypoint-edge] > path:not(.canvas-edge-hit) { stroke: var(--accent); }
.canvas-stage.is-position-editing [data-adjustment-key]:hover { outline: 1px dashed var(--accent); outline-offset: 3px; }
.canvas-edge-hit { pointer-events: stroke; }
.canvas-waypoint { fill: #ffffff; stroke: var(--accent); stroke-width: 2; cursor: move; }
.canvas-waypoint.is-selected, .canvas-waypoint:focus-visible { fill: var(--accent); stroke: #ffffff; outline: none; }
.canvas-stage.is-position-editing .canvas-artboard { overflow: visible; }
.canvas-stage.can-select-elements:not(.is-dragging) [data-editor-key],
.canvas-stage.can-select-elements:not(.is-dragging) .uml-container {
  cursor: pointer;
}
.canvas-stage.can-select-elements:not(.is-dragging) [data-editor-key]:hover,
.canvas-stage.can-select-elements:not(.is-dragging) [data-editor-key]:focus-visible,
.canvas-stage.can-select-elements:not(.is-dragging) .uml-container:hover,
.canvas-stage.can-select-elements:not(.is-dragging) .uml-container:focus-visible {
  outline: 2px dashed var(--accent);
  outline-offset: 2px;
}
.canvas-stage:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  box-shadow: var(--shadow-sm), 0 0 0 4px var(--ring);
}
.canvas-artboard.is-transparent {
  background-color: var(--paper);
  background-image: conic-gradient(
    var(--line) 25%,
    var(--paper) 0 50%,
    var(--line) 0 75%,
    var(--paper) 0
  );
  background-size: 18px 18px;
}
.canvas-empty {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  text-align: center;
  max-width: 340px;
  padding: 30px 36px;
  background: var(--paper);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
}
.canvas-empty strong {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.canvas-empty p {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
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
  min-height: 36px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--muted);
  border-top: 1px solid var(--line);
  background: var(--paper);
  flex: none;
  gap: 10px;
}
.canvas-error {
  background: var(--warning-soft);
  border: 1px solid color-mix(in srgb, var(--warning) 22%, transparent);
  border-radius: var(--r-md);
  margin: 0 12px 12px;
  padding: 10px 14px;
  font-size: 12px;
  color: var(--warning);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
@keyframes uml-canvas-pulse {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 0 0 var(--accent-soft);
  }
  50% {
    opacity: 0.55;
    box-shadow: 0 0 0 5px var(--accent-soft);
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
    padding: 8px 12px;
    gap: 6px;
  }
  .canvas-dimensions {
    display: none;
  }
  .canvas-stage {
    margin: 10px;
    padding: 28px 24px;
  }
  .canvas-error {
    margin: 0 10px 10px;
  }
  .canvas-footer {
    font-size: 11px;
    padding: 8px 12px;
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
    margin: 8px;
    padding: 24px;
  }
  .canvas-error {
    margin: 0 8px 8px;
  }
  .canvas-toolbar {
    min-height: 44px;
    padding: 6px 12px;
  }
  .canvas-footer {
    min-height: 32px;
    padding: 6px 14px;
    font-size: 11px;
  }
}
@media (max-width: 480px) {
  .canvas-dimensions {
    display: none;
  }
  .canvas-toolbar {
    padding: 6px 10px;
  }
  .canvas-stage {
    margin: 8px;
    padding: 20px 16px;
    min-height: 330px;
    border-radius: var(--r-md);
  }
  .canvas-error {
    margin: 0 8px 8px;
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
    padding: 0 8px;
  }
}
@media print {
  .canvas-toolbar,
  .canvas-footer,
  .canvas-position-tools,
  [data-position-handles],
  .canvas-edge-hit {
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
    margin: 0;
    padding: 0;
    border-radius: 0;
    box-shadow: none;
    overflow: visible;
    min-height: 0;
  }
  .canvas-artboard {
    box-shadow: none;
    margin: 0;
    border-radius: 0;
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
