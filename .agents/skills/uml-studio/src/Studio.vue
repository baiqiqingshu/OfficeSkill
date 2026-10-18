<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, toRaw } from 'vue';
import DiagramCanvas from './DiagramCanvas.vue';
import { createHtml, downloadBlob } from './export';
import type { StudioRuntime } from './export';
import { resolveTheme, themes } from './themes';
import { validateSpec } from './validate';
import type { DiagramSpec, DiagramType, ExportOptions, Theme, ThemeName } from './types';

interface CanvasHandle {
  ready: Promise<void>;
  getSpec(): DiagramSpec;
  setSpec(spec: DiagramSpec): Promise<void>;
  getSvg(): string;
  exportImage(options?: ExportOptions): Promise<Blob>;
}
const props = defineProps<{
  initialSpec: unknown;
  examples: Record<string, DiagramSpec>;
  runtimeReady: Promise<StudioRuntime | undefined>;
  startupError?: string;
}>();
const labels: Record<DiagramType, string> = {
  activity: '活动图', sequence: '时序图', swimlane: '泳道图', flowchart: '流程图', usecase: '用例图', class: '类图', state: '状态图', component: '组件图', package: '包图', architecture: '架构图', module: '模块图', deployment: '部署图', logical: '逻辑视图', development: '开发视图', process: '进程视图', physical: '物理视图', scenario: '场景视图', fishbone: '鱼骨图',
};
const families: { label: string; types: DiagramType[] }[] = [
  { label: '分析与流程', types: ['fishbone', 'flowchart', 'activity', 'swimlane'] },
  { label: 'UML 建模', types: ['sequence', 'usecase', 'class', 'state', 'component', 'package'] },
  { label: '架构与 4+1 视图', types: ['architecture', 'module', 'deployment', 'logical', 'development', 'process', 'physical', 'scenario'] },
];
const themeLabels: Record<ThemeName, string> = { paper: '暖纸', ocean: '海蓝', forest: '苔绿', blueprint: '蓝图', midnight: '夜色' };
const colorControls = [
  { key: 'primary', label: '主色' }, { key: 'secondary', label: '辅助色' }, { key: 'background', label: '画布' },
  { key: 'surface', label: '节点' }, { key: 'text', label: '文字' }, { key: 'border', label: '边框' }, { key: 'muted', label: '次要文字' },
] as const;
const numericControls = [
  { key: 'fontSize', label: '字号', min: 8, max: 48, step: 1, unit: 'px' },
  { key: 'lineWidth', label: '线宽', min: 0.5, max: 8, step: 0.5, unit: 'px' },
  { key: 'radius', label: '圆角', min: 0, max: 32, step: 1, unit: 'px' },
  { key: 'nodeWidth', label: '节点宽度', min: 80, max: 600, step: 10, unit: 'px' },
  { key: 'nodeHeight', label: '节点高度', min: 32, max: 300, step: 2, unit: 'px' },
  { key: 'gap', label: '布局间距', min: 24, max: 240, step: 4, unit: 'px' },
] as const;
let initial: DiagramSpec;
let initialError = props.startupError ?? '';
try { initial = structuredClone(validateSpec(toRaw(props.initialSpec))); }
catch (reason) {
  initialError = reason instanceof Error ? reason.message : String(reason);
  const fallback = props.examples.fishbone ?? Object.values(props.examples)[0];
  if (!fallback) throw new Error('工作台没有可用的默认示例。');
  initial = structuredClone(validateSpec(fallback));
}
const initialSpec = initial;
const applied = shallowRef<DiagramSpec>(initial);
const draft = ref(JSON.stringify(initial, null, 2));
const canvas = ref<CanvasHandle>();
const editor = ref<HTMLTextAreaElement>();
const importInput = ref<HTMLInputElement>();
const runtime = shallowRef<StudioRuntime>();
const runtimeError = ref('');
const error = ref(initialError);
const notice = ref('');
const editorOpen = ref(false);
const sidebarOpen = ref(false);
const loading = ref(true);
const exporting = ref(false);
const format = ref<NonNullable<ExportOptions['format']>>('png');
const scale = ref(2);
const quality = ref(0.94);
const currentTheme = computed(() => resolveTheme(applied.value));
const dirty = computed(() => draft.value !== JSON.stringify(applied.value, null, 2));
const itemCount = computed(() => applied.value.type === 'fishbone' ? `${applied.value.fishbone?.categories.length ?? 0} 个分析维度` : applied.value.type === 'sequence' ? `${applied.value.participants?.length ?? 0} 位参与者 · ${applied.value.messages?.length ?? 0} 条消息` : `${applied.value.nodes?.length ?? 0} 个节点 · ${applied.value.edges?.length ?? 0} 条连线`);
let revision = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let resolveReady!: () => void;
let rejectReady!: (reason: unknown) => void;
const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
void ready.catch(() => {});

function showNotice(message: string): void {
  notice.value = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.value = ''; }, 3500);
}
function reportError(reason: unknown): void {
  error.value = reason instanceof Error ? reason.message : String(reason);
}
async function setSpec(input: DiagramSpec): Promise<void> {
  const ticket = ++revision;
  const draftBefore = draft.value;
  error.value = '';
  try {
    if (!canvas.value) throw new Error('工作台尚未挂载。');
    await canvas.value.setSpec(input);
    if (ticket !== revision) return;
    applied.value = canvas.value.getSpec();
    if (draft.value === draftBefore) draft.value = JSON.stringify(applied.value, null, 2);
  } catch (reason) {
    if (ticket === revision) reportError(reason);
    throw reason;
  }
}
async function applyDraft(): Promise<void> {
  try {
    await setSpec(validateSpec(JSON.parse(draft.value)));
    if (!error.value) showNotice('JSON 已应用，图表已更新');
  } catch (reason) { reportError(reason); }
}
async function chooseExample(type: DiagramType): Promise<void> {
  const example = props.examples[type];
  if (!example) { reportError(new Error(`未找到「${labels[type]}」示例。`)); return; }
  try {
    await setSpec(structuredClone(example));
    sidebarOpen.value = false;
    showNotice(`已载入${labels[type]}示例`);
  } catch (reason) { reportError(reason); }
}
async function updateSpec(change: (spec: DiagramSpec) => void): Promise<void> {
  try {
    const candidate = dirty.value ? structuredClone(validateSpec(JSON.parse(draft.value))) : structuredClone(applied.value);
    change(candidate);
    await setSpec(candidate);
  } catch (reason) { reportError(reason); }
}
async function selectTheme(name: ThemeName): Promise<void> {
  await updateSpec(spec => { spec.theme = name; delete spec.style; });
}
async function updateStyle(key: keyof Theme, value: string | number): Promise<void> {
  await updateSpec(spec => { spec.style = { ...spec.style, [key]: value }; });
}
function getSpec(): DiagramSpec {
  if (!canvas.value) throw new Error('工作台尚未挂载。');
  return canvas.value.getSpec();
}
function getSvg(): string {
  if (!canvas.value) throw new Error('工作台尚未挂载。');
  return canvas.value.getSvg();
}
async function exportImage(options?: ExportOptions): Promise<Blob> {
  await ready;
  if (!canvas.value) throw new Error('工作台尚未挂载。');
  return canvas.value.exportImage(options);
}
function saveHtml(): string { return createHtml(getSpec(), runtime.value); }
function filename(extension: string): string {
  const title = applied.value.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 100);
  return `${title || 'uml-diagram'}.${extension}`;
}
async function downloadImage(): Promise<void> {
  exporting.value = true;
  error.value = '';
  try {
    const selected = format.value;
    const blob = await exportImage({ format: selected, scale: scale.value, quality: quality.value });
    downloadBlob(blob, filename(selected === 'jpeg' ? 'jpg' : selected));
    showNotice(`${selected.toUpperCase()} 已导出 · ${scale.value}×`);
  } catch (reason) { reportError(reason); }
  finally { exporting.value = false; }
}
function downloadHtml(): void {
  try {
    downloadBlob(new Blob([saveHtml()], { type: 'text/html;charset=utf-8' }), filename('html'));
    showNotice('独立 HTML 已保存，离线打开即可继续编辑');
  } catch (reason) { reportError(reason); }
}
async function copyJson(): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(draft.value);
    else throw new Error('剪贴板 API 不可用');
    showNotice('JSON 已复制');
  } catch {
    const target = editor.value;
    if (!target) { reportError(new Error('无法访问剪贴板，请打开 JSON 编辑器手动复制。')); return; }
    const start = target.selectionStart;
    const end = target.selectionEnd;
    target.focus();
    target.select();
    const copied = document.execCommand('copy');
    target.setSelectionRange(start, end);
    if (copied) showNotice('JSON 已复制');
    else reportError(new Error('浏览器禁止剪贴板访问。已选中 JSON，请按 Ctrl/Cmd + C 复制。'));
  }
}
function downloadJson(): void {
  downloadBlob(new Blob([draft.value], { type: 'application/json;charset=utf-8' }), filename('json'));
  showNotice(dirty.value ? '已下载当前 JSON 草稿（含未应用的修改）' : 'JSON 已下载');
}
function formatJson(): void {
  try { draft.value = JSON.stringify(JSON.parse(draft.value), null, 2); error.value = ''; }
  catch (reason) { reportError(reason); }
}
async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const source = await file.text();
    const json = source.trimStart().startsWith('<')
      ? new DOMParser().parseFromString(source, 'text/html').getElementById('diagram-data')?.textContent
      : source;
    if (!json) throw new Error('HTML 中没有可编辑的 #diagram-data 数据，请导入 UML Studio 保存的文件。');
    const candidate = validateSpec(JSON.parse(json));
    await setSpec(candidate);
    showNotice(`已导入 ${file.name}`);
  } catch (reason) { reportError(reason); }
}
function editorKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void applyDraft(); }
  if (event.key === 'Tab') {
    event.preventDefault();
    const target = event.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    draft.value = `${draft.value.slice(0, start)}  ${draft.value.slice(target.selectionEnd)}`;
    requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + 2; });
  }
}
onMounted(async () => {
  try {
    if (!canvas.value) throw new Error('图表组件挂载失败。');
    await canvas.value.ready;
    applied.value = canvas.value.getSpec();
    try { runtime.value = await props.runtimeReady; }
    catch (reason) { runtimeError.value = reason instanceof Error ? reason.message : String(reason); }
    if (!runtime.value && !runtimeError.value) runtimeError.value = '独立 HTML 运行时未加载，请先运行构建。';
    resolveReady();
  } catch (reason) { reportError(reason); rejectReady(reason); }
});
defineExpose({ ready, getSpec, setSpec, getSvg, exportImage, saveHtml });
</script>

<template>
  <div class="studio-shell">
    <header class="studio-header">
      <a href="#" class="studio-brand" aria-label="UML Studio 工作台" @click.prevent><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>UML<span class="brand-light"> STUDIO</span><small>把复杂，画清楚。</small></span></a>
      <div class="header-center"><span class="live-indicator"></span>本地工作台 <span class="header-slash">/</span> 灵感不必联网</div>
      <div class="header-actions">
        <button class="button button-quiet mobile-menu-button" type="button" :aria-expanded="sidebarOpen" @click="sidebarOpen = !sidebarOpen">图表与样式</button>
        <button class="button button-quiet" type="button" @click="importInput?.click()"><span aria-hidden="true">↥</span> 导入<span class="hide-small"> JSON / HTML</span></button>
        <button class="button button-dark" type="button" :disabled="!runtime || loading" :title="runtimeError || '保存为可离线编辑的单个 HTML 文件'" @click="downloadHtml"><span aria-hidden="true">↓</span> 保存 HTML</button>
      </div>
      <input ref="importInput" class="visually-hidden" type="file" accept=".json,.html,.htm,application/json,text/html" aria-label="导入 JSON 或 HTML 文件" @change="importFile">
    </header>

    <div class="studio-body">
      <button v-if="sidebarOpen" class="sidebar-scrim" type="button" aria-label="关闭图表与样式" @click="sidebarOpen = false"></button>
      <aside class="studio-sidebar" :class="{ 'is-open': sidebarOpen }" aria-label="图表与样式设置">
        <div class="sidebar-section">
          <div class="section-heading"><span class="section-index">01</span><h2>选择图表</h2><span class="section-meta">18 种表达</span></div>
          <label class="field-label" for="diagram-type">从一个好例子开始</label>
          <select id="diagram-type" class="select-input type-select" :value="applied.type" @change="chooseExample(($event.target as HTMLSelectElement).value as DiagramType)">
            <optgroup v-for="family in families" :key="family.label" :label="family.label"><option v-for="type in family.types" :key="type" :value="type">{{ labels[type] }}</option></optgroup>
          </select>
          <div class="quick-presets"><button v-for="type in (['fishbone', 'flowchart', 'sequence', 'class'] as const)" :key="type" type="button" :class="{ selected: applied.type === type }" @click="chooseExample(type)"><span aria-hidden="true">{{ type === 'fishbone' ? '⋟' : type === 'flowchart' ? '◇' : type === 'sequence' ? '⇄' : '▤' }}</span>{{ labels[type] }}</button></div>
          <div class="example-note"><span class="note-spark" aria-hidden="true">✧</span><p>不是空白画布，<br>而是一个可以继续的想法。</p></div>
        </div>

        <div class="sidebar-section">
          <div class="section-heading"><span class="section-index">02</span><h2>视觉风格</h2><button class="text-button" type="button" :disabled="!applied.style" @click="updateSpec(spec => { delete spec.style; })">重置</button></div>
          <div class="theme-grid" aria-label="主题预设"><button v-for="(theme, name) in themes" :key="name" type="button" class="theme-option" :class="{ selected: (applied.theme ?? 'paper') === name }" :aria-pressed="(applied.theme ?? 'paper') === name" @click="selectTheme(name)"><span class="theme-preview" :style="{ background: theme.background, borderColor: theme.border }"><i :style="{ background: theme.primary }"></i><i :style="{ background: theme.secondary }"></i></span><span>{{ themeLabels[name] }}</span></button></div>
          <div class="style-subheading">自定义配色<span v-if="applied.style" class="custom-badge">已定制</span></div>
          <div class="color-grid"><label v-for="control in colorControls" :key="control.key" class="color-control"><input type="color" :value="currentTheme[control.key].replace(/^#([\da-f])([\da-f])([\da-f])$/i, '#$1$1$2$2$3$3')" :aria-label="control.label" @change="updateStyle(control.key, ($event.target as HTMLInputElement).value)"><span>{{ control.label }}</span><code>{{ currentTheme[control.key] }}</code></label></div>
          <details class="advanced-styles"><summary>排版与细节<span aria-hidden="true">＋</span></summary><div class="advanced-inner">
            <label v-for="control in numericControls" :key="control.key" class="range-control"><span>{{ control.label }}<output>{{ currentTheme[control.key] }} {{ control.unit }}</output></span><input type="range" :min="control.min" :max="control.max" :step="control.step" :value="currentTheme[control.key]" @change="updateStyle(control.key, Number(($event.target as HTMLInputElement).value))"></label>
            <label class="field-label" for="font-family">字体（使用系统已安装字体）</label><input id="font-family" class="text-input" type="text" :value="currentTheme.fontFamily" @change="updateStyle('fontFamily', ($event.target as HTMLInputElement).value)">
            <label class="field-label" for="layout-direction">布局方向</label><select id="layout-direction" class="select-input" :value="applied.direction ?? 'TB'" :disabled="applied.type === 'sequence' || applied.type === 'fishbone'" @change="updateSpec(spec => { spec.direction = ($event.target as HTMLSelectElement).value as 'TB' | 'LR'; })"><option value="TB">从上到下 ↓</option><option value="LR">从左到右 →</option></select>
          </div></details>
        </div>

        <div class="sidebar-section export-section">
          <div class="section-heading"><span class="section-index">03</span><h2>带走你的图表</h2></div>
          <div class="export-fields"><label for="export-format">文件格式<select id="export-format" v-model="format" class="select-input"><option value="svg">SVG · 矢量</option><option value="png">PNG · 无损</option><option value="jpeg">JPEG · 通用</option><option value="webp">WebP · 轻量</option></select></label><label for="export-scale">导出倍率<select id="export-scale" v-model.number="scale" class="select-input"><option :value="1">1× 原始</option><option :value="2">2× 清晰</option><option :value="3">3× 高清</option><option :value="4">4× 超清</option></select></label></div>
          <label v-if="format === 'jpeg' || format === 'webp'" class="range-control quality-control"><span>图片质量<output>{{ Math.round(quality * 100) }}%</output></span><input v-model.number="quality" type="range" min="0.1" max="1" step="0.01"></label>
          <button class="button button-accent export-button" type="button" :disabled="loading || exporting" @click="downloadImage"><span aria-hidden="true">↓</span>{{ exporting ? '正在导出…' : `导出 ${format.toUpperCase()} 图片` }}</button>
          <p class="export-tip">高清图片用于分享，独立 HTML 留给下一次灵感。</p>
        </div>
        <div class="sidebar-footnote"><span class="live-indicator"></span>数据只留在你的浏览器中</div>
      </aside>

      <main class="studio-main">
        <div class="workspace-heading"><div><div class="eyebrow">YOUR IDEAS, BEAUTIFULLY CONNECTED</div><h1>{{ applied.title }}</h1><p>{{ applied.description || '让节点找到位置，让想法建立连接。' }}</p></div><button class="button button-outline editor-toggle" type="button" :aria-pressed="editorOpen" @click="editorOpen = !editorOpen"><span aria-hidden="true">{ }</span>{{ editorOpen ? '收起数据' : '编辑 JSON' }}</button></div>
        <div class="workspace-meta"><span class="type-badge">{{ labels[applied.type] }}</span><span>{{ itemCount }}</span><span class="meta-dot">·</span><span>{{ themeLabels[applied.theme ?? 'paper'] }}主题{{ applied.style ? ' / 自定义' : '' }}</span><span v-if="dirty" class="draft-indicator">有未应用修改</span></div>
        <div v-if="error" class="error-banner" role="alert"><span class="error-icon" aria-hidden="true">!</span><div><strong>未应用这次修改，画布保留上次成功结果</strong><p>{{ error }}</p></div><button class="icon-button" type="button" aria-label="关闭错误提示" @click="error = ''">×</button></div>
        <div class="workspace-panels" :class="{ 'with-editor': editorOpen }">
          <DiagramCanvas ref="canvas" :spec="initialSpec" :runtime="runtime" @loading="loading = $event" @error="reportError" />
          <section v-show="editorOpen" class="json-panel" aria-label="JSON 数据编辑器"><div class="json-header"><div><span class="json-icon" aria-hidden="true">{ }</span><h2>图表数据</h2><span class="json-extension">.json</span></div><button class="text-button" type="button" @click="formatJson">格式化</button></div><div class="editor-filebar"><span class="file-dot"></span>diagram.json<span :class="dirty ? 'file-dirty' : 'file-saved'">{{ dirty ? '未应用' : '已同步' }}</span></div><label class="visually-hidden" for="json-editor">编辑图表 JSON，按 Ctrl 或 Command 加 Enter 应用</label><textarea id="json-editor" ref="editor" v-model="draft" class="json-editor" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" @keydown="editorKeydown"></textarea><div class="json-actions"><button class="button button-accent" type="button" :disabled="loading" @click="applyDraft">{{ loading ? '正在绘制…' : '应用到画布' }}<kbd>⌘ / Ctrl ↵</kbd></button><div><button class="text-button" type="button" @click="copyJson">复制 JSON</button><span>·</span><button class="text-button" type="button" @click="downloadJson">下载 JSON</button></div></div><p class="editor-hint">修改数据后手动应用。无效 JSON 不会覆盖当前图表。</p></section>
        </div>
        <footer class="workspace-footer"><span><span aria-hidden="true">✧</span> 结构先行，表达自有力量。</span><span v-if="runtimeError" class="runtime-warning" :title="runtimeError">独立 HTML 运行时尚未就绪</span><span v-else>18 种图表 · 5 套主题 · 无限想法</span></footer>
      </main>
    </div>
    <Transition name="toast"><div v-if="notice" class="studio-toast" role="status"><span aria-hidden="true">✓</span>{{ notice }}</div></Transition>
  </div>
</template>
