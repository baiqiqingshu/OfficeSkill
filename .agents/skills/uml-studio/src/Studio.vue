<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  toRaw,
} from "vue";
import DiagramCanvas from "./DiagramCanvas.vue";
import FormEditor from "./FormEditor.vue";
import ColorInput from "./ColorInput.vue";
import { createHtml, downloadBlob } from "./export";
import type { StudioRuntime } from "./export";
import {
  fontPresets,
  layoutModes,
  resolveLayout,
  resolveTheme,
  themeLabels,
  themes,
} from "./themes";
import { normalizeDocument, validateDocument } from "./document";
import { validateSpec } from "./validate";
import type {
  DiagramDocument,
  DiagramInput,
  DiagramLayoutOptions,
  DiagramSpec,
  DiagramType,
  ExportOptions,
  Theme,
  ThemeName,
} from "./types";

interface CanvasHandle {
  ready: Promise<void>;
  getSpec(): DiagramSpec;
  setSpec(spec: DiagramSpec): Promise<void>;
  getSvg(): string;
  exportImage(options?: ExportOptions): Promise<Blob>;
}
interface FormHandle {
  hasChanges(): boolean;
  resetDraft(): void;
  focusElement(key: string): Promise<void>;
}
const props = defineProps<{
  initialSpec: unknown;
  examples: Record<string, DiagramSpec>;
  runtimeReady: Promise<StudioRuntime | undefined>;
  startupError?: string;
}>();
const labels: Record<DiagramType, string> = {
  activity: "活动图",
  sequence: "时序图",
  swimlane: "泳道图",
  flowchart: "流程图",
  usecase: "用例图",
  class: "类图",
  state: "状态图",
  component: "组件图",
  package: "包图",
  architecture: "架构图",
  module: "模块图",
  deployment: "部署图",
  logical: "逻辑视图",
  development: "开发视图",
  process: "进程视图",
  physical: "物理视图",
  scenario: "场景视图",
  fishbone: "鱼骨图",
};
const families: { label: string; types: DiagramType[] }[] = [
  {
    label: "分析与流程",
    types: ["fishbone", "flowchart", "activity", "swimlane"],
  },
  {
    label: "UML 建模",
    types: ["sequence", "usecase", "class", "state", "component", "package"],
  },
  {
    label: "架构与 4+1 视图",
    types: [
      "architecture",
      "module",
      "deployment",
      "logical",
      "development",
      "process",
      "physical",
      "scenario",
    ],
  },
];
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
  {
    key: "maxWidth",
    label: "绘图最大宽度",
    min: 0,
    max: 100000,
    step: 1,
    hint: "0 = 不限制；整图等比缩放",
  },
  {
    key: "maxHeight",
    label: "绘图最大高度",
    min: 0,
    max: 100000,
    step: 1,
    hint: "0 = 不限制；保留全部内容",
  },
  {
    key: "nodeMaxWidth",
    label: "节点最大宽度",
    min: 0,
    max: 100000,
    step: 1,
    hint: "0 = 不限制；文字自动换行",
    graphOnly: true,
  },
  {
    key: "nodeMaxHeight",
    label: "节点最大高度",
    min: 0,
    max: 100000,
    step: 1,
    hint: "0 = 不限制；文字自适应",
    graphOnly: true,
  },
  {
    key: "regionGap",
    label: "区域 / 分组间距",
    min: 0,
    max: 600,
    step: 1,
    hint: "分组或分析维度间距；泳道连续相接",
  },
  {
    key: "elementGap",
    label: "元素间距",
    min: 8,
    max: 400,
    step: 1,
    hint: "节点、消息或原因之间的间距",
  },
  {
    key: "maxPerColumn",
    label: "每列最多节点",
    min: 0,
    max: 30,
    step: 1,
    hint: "0 = 不限制；区域内自动换列",
    graphOnly: true,
  },
] as const;
const json = (value: unknown) => JSON.stringify(value, null, 2);
let initial: DiagramDocument;
let initialError = props.startupError ?? "";
try {
  initial = structuredClone(
    validateDocument(normalizeDocument(toRaw(props.initialSpec))),
  );
} catch (reason) {
  initialError = [
    initialError,
    reason instanceof Error ? reason.message : String(reason),
  ]
    .filter(Boolean)
    .join("\n");
  const fallback = props.examples.fishbone ?? Object.values(props.examples)[0];
  if (!fallback) throw new Error("工作台没有可用的默认示例。");
  initial = structuredClone(validateDocument(normalizeDocument(fallback)));
}
const initialSpec = initial.diagrams[0]!;
const collection = shallowRef<DiagramDocument>(initial);
const savedSnapshot = ref(json(initial));
const activeIndex = ref(0);
const applied = computed(() => collection.value.diagrams[activeIndex.value]!);
const sourceDrafts = ref(initial.diagrams.map(json));
const documentDraft = ref(json(initial));
const sourceScope = ref<"diagram" | "document">("diagram");
const draft = computed({
  get: () =>
    sourceScope.value === "document"
      ? documentDraft.value
      : sourceDrafts.value[activeIndex.value]!,
  set: (value) => {
    if (sourceScope.value === "document") documentDraft.value = value;
    else sourceDrafts.value[activeIndex.value] = value;
  },
});
const activeDirty = computed(
  () => sourceDrafts.value[activeIndex.value] !== json(applied.value),
);
const documentDirty = computed(
  () => documentDraft.value !== json(collection.value),
);
const dirty = computed(() =>
  sourceScope.value === "document" ? documentDirty.value : activeDirty.value,
);
const anySourceDirty = computed(
  () =>
    documentDirty.value ||
    collection.value.diagrams.some(
      (spec, index) => sourceDrafts.value[index] !== json(spec),
    ),
);
const canvas = ref<CanvasHandle>();
const formEditor = ref<FormHandle>();
const editor = ref<HTMLTextAreaElement>();
const importInput = ref<HTMLInputElement>();
const runtime = shallowRef<StudioRuntime>();
const runtimeError = ref("");
const error = ref(initialError);
const notice = ref("");
const editorOpen = ref(false);
const styleOpen = ref(false);
const stylePanel = ref<HTMLDetailsElement>();
const pendingSave = computed(() => json(collection.value) !== savedSnapshot.value);
const formDirty = computed(() => !!formEditor.value?.hasChanges());
async function toggleEditor(): Promise<void> {
  editorOpen.value = !editorOpen.value;
  if (!editorOpen.value) return;
  await nextTick();
  const panel = document.getElementById("diagram-editor");
  panel?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
  if (matchMedia("(max-width: 1200px)").matches) panel?.scrollIntoView({ block: "start", behavior: "auto" });
}
async function showStyles(): Promise<void> {
  styleOpen.value = !styleOpen.value;
  if (!styleOpen.value) return;
  await nextTick();
  stylePanel.value?.scrollIntoView({ block: "nearest", behavior: "auto" });
  stylePanel.value?.querySelector("summary")?.focus({ preventScroll: true });
}
const editorMode = ref<"form" | "source">("form");
const sidebarOpen = ref(false);
const loading = ref(true);
const exporting = ref(false);
const copyingImage = ref(false);
const addType = ref<DiagramType>("fishbone");
const format = ref<NonNullable<ExportOptions["format"]>>("png");
const scale = ref(2);
const quality = ref(0.94);
const currentTheme = computed(() => resolveTheme(applied.value));
const graphDiagram = computed(
  () => applied.value.type !== "sequence" && applied.value.type !== "fishbone",
);
const selectedFont = computed(() =>
  fontPresets.some((font) => font.value === currentTheme.value.fontFamily)
    ? currentTheme.value.fontFamily
    : "",
);
const itemCount = computed(() =>
  applied.value.type === "fishbone"
    ? `${applied.value.fishbone?.categories.length ?? 0} 个分析维度`
    : applied.value.type === "sequence"
      ? `${applied.value.participants?.length ?? 0} 位参与者 · ${applied.value.messages?.length ?? 0} 条消息`
      : `${applied.value.nodes?.length ?? 0} 个节点 · ${applied.value.edges?.length ?? 0} 条连线`,
);
let revision = 0;
let importRequest = 0;
let idSequence = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let resolveReady!: () => void;
let rejectReady!: (reason: unknown) => void;
const ready = new Promise<void>((resolve, reject) => {
  resolveReady = resolve;
  rejectReady = reject;
});
void ready.catch(() => {});

function showNotice(message: string): void {
  notice.value = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = "";
  }, 4000);
}
function reportError(reason: unknown): void {
  error.value = reason instanceof Error ? reason.message : String(reason);
}
function permitFormChange(): boolean {
  return (
    !formEditor.value?.hasChanges() ||
    window.confirm(
      "表单还有未应用的修改。此操作会放弃这份表单草稿；请取消并先点击“应用表单”以保留修改。继续？",
    )
  );
}
function permitCollectionReplace(): boolean {
  return (
    (!anySourceDirty.value &&
      !formEditor.value?.hasChanges() &&
      json(collection.value) === savedSnapshot.value) ||
    window.confirm(
      "当前文档有尚未保存的图表修改或未应用的草稿。替换整个文档会放弃当前集合及这些草稿；请取消并先保存 HTML / JSON 以保留修改。继续替换？",
    )
  );
}
function commitCollection(next: DiagramDocument): void {
  const synced = !documentDirty.value;
  collection.value = next;
  if (synced) documentDraft.value = json(next);
}
async function renderCandidate(
  candidate: DiagramSpec,
  ticket: number,
): Promise<boolean> {
  if (!canvas.value) throw new Error("工作台尚未挂载。");
  await canvas.value.setSpec(candidate);
  return ticket === revision;
}
async function applySpec(
  input: DiagramSpec,
  fromSource?: string,
  fromForm = false,
): Promise<boolean> {
  if (!fromForm && !permitFormChange())
    throw new Error("操作已取消；表单草稿仍然保留。");
  let ticket = revision;
  const index = activeIndex.value;
  const old = collection.value.diagrams[index]!;
  const oldSource = sourceDrafts.value[index]!;
  const sourceWasClean = oldSource === json(old);
  error.value = "";
  try {
    const candidate = structuredClone(validateSpec(toRaw(input)));
    const next = validateDocument({
      ...getDocument(),
      diagrams: collection.value.diagrams.map((spec, position) =>
        position === index ? candidate : spec,
      ),
    });
    ticket = ++revision;
    if (!(await renderCandidate(next.diagrams[index]!, ticket))) return false;
    commitCollection(structuredClone(next));
    if (
      sourceDrafts.value[index] === oldSource &&
      (sourceWasClean || fromSource === oldSource)
    )
      sourceDrafts.value[index] = json(applied.value);
    await nextTick();
    if (ticket === revision) formEditor.value?.resetDraft();
    return ticket === revision;
  } catch (reason) {
    if (ticket === revision) reportError(reason);
    throw reason;
  }
}
async function setSpec(input: DiagramSpec): Promise<void> {
  await applySpec(input);
}
async function setDocument(input: DiagramInput): Promise<void> {
  if (!permitCollectionReplace())
    throw new Error("替换已取消；所有草稿仍然保留。");
  await replaceDocument(input);
}
async function replaceDocument(
  input: unknown,
  sourceSnapshot?: string,
): Promise<boolean> {
  let ticket = revision;
  error.value = "";
  try {
    const next = structuredClone(
      validateDocument(normalizeDocument(toRaw(input))),
    );
    ticket = ++revision;
    if (!(await renderCandidate(next.diagrams[0]!, ticket))) return false;
    const pendingDocumentSource = documentDraft.value;
    collection.value = next;
    activeIndex.value = 0;
    sourceDrafts.value = next.diagrams.map(json);
    documentDraft.value =
      sourceSnapshot !== undefined && pendingDocumentSource !== sourceSnapshot
        ? pendingDocumentSource
        : json(next);
    await nextTick();
    if (ticket === revision) formEditor.value?.resetDraft();
    return ticket === revision;
  } catch (reason) {
    if (ticket === revision) reportError(reason);
    throw reason;
  }
}
async function selectDiagram(indexOrId: number | string): Promise<void> {
  const index =
    typeof indexOrId === "number"
      ? indexOrId
      : collection.value.diagrams.findIndex((spec) => spec.id === indexOrId);
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= collection.value.diagrams.length
  )
    throw new Error("图表索引无效；索引从 0 开始，或传入已有图表 ID。");
  if (index === activeIndex.value) return;
  if (!permitFormChange()) throw new Error("切换已取消；表单草稿仍然保留。");
  const ticket = ++revision;
  error.value = "";
  try {
    if (!(await renderCandidate(collection.value.diagrams[index]!, ticket)))
      return;
    activeIndex.value = index;
    await nextTick();
    if (ticket === revision) formEditor.value?.resetDraft();
  } catch (reason) {
    if (ticket === revision) reportError(reason);
    throw reason;
  }
}
function selectFromList(index: number): void {
  void selectDiagram(index).catch(reportError);
}
function uniqueId(): string {
  let id: string;
  do {
    id = `diagram-${Date.now().toString(36)}-${++idSequence}`;
  } while (collection.value.diagrams.some((spec) => spec.id === id));
  return id;
}
async function appendDiagram(
  example: DiagramSpec,
  duplicate = false,
): Promise<void> {
  if (!permitFormChange()) return;
  let ticket = revision;
  try {
    const candidate = structuredClone(toRaw(example));
    candidate.id = uniqueId();
    candidate.theme ??= "ocean";
    if (duplicate) candidate.title = `${candidate.title}（副本）`;
    const next = structuredClone(
      validateDocument({
        ...getDocument(),
        diagrams: [...collection.value.diagrams, candidate],
      }),
    );
    ticket = ++revision;
    if (
      !(await renderCandidate(next.diagrams[next.diagrams.length - 1]!, ticket))
    )
      return;
    commitCollection(next);
    sourceDrafts.value.push(json(next.diagrams[next.diagrams.length - 1]));
    activeIndex.value = next.diagrams.length - 1;
    error.value = "";
    await nextTick();
    if (ticket === revision) formEditor.value?.resetDraft();
    showNotice(
      duplicate
        ? "已复制当前已应用的图表；原图及 JSON 草稿保留"
        : `已新增${labels[candidate.type]}，现有图表保持不变`,
    );
  } catch (reason) {
    if (ticket === revision) reportError(reason);
  }
}
function addExample(type: DiagramType): void {
  const example = props.examples[type];
  if (!example) {
    reportError(new Error(`未找到「${labels[type]}」示例。`));
    return;
  }
  void appendDiagram(example);
}
async function removeDiagram(): Promise<void> {
  if (collection.value.diagrams.length < 2) return;
  if (
    !window.confirm(
      `移除“${applied.value.title}”？这张图及其未应用草稿会被删除，其他图表不受影响。`,
    )
  )
    return;
  const ticket = ++revision;
  const removed = activeIndex.value;
  const diagrams = collection.value.diagrams.filter(
    (_, index) => index !== removed,
  );
  const index = Math.min(removed, diagrams.length - 1);
  try {
    if (!(await renderCandidate(diagrams[index]!, ticket))) return;
    commitCollection({ ...getDocument(), diagrams });
    sourceDrafts.value.splice(removed, 1);
    activeIndex.value = index;
    error.value = "";
    await nextTick();
    if (ticket === revision) formEditor.value?.resetDraft();
    showNotice("图表已移除");
  } catch (reason) {
    if (ticket === revision) reportError(reason);
  }
}
async function applyDraft(): Promise<void> {
  const source = draft.value;
  const scope = sourceScope.value;
  try {
    let committed: boolean;
    if (scope === "document") {
      if (
        (json(collection.value) !== savedSnapshot.value ||
          collection.value.diagrams.some(
            (spec, index) => sourceDrafts.value[index] !== json(spec),
          ) ||
          formEditor.value?.hasChanges()) &&
        !window.confirm(
          "应用整个文档会用这份源码替换全部图表，包括当前尚未保存的图表修改及各图的未应用草稿。继续？",
        )
      )
        return;
      committed = await replaceDocument(JSON.parse(source), source);
    } else
      committed = await applySpec(validateSpec(JSON.parse(source)), source);
    if (committed)
      showNotice(
        scope === "document" ? "整个文档已应用" : "当前图表 JSON 已应用",
      );
  } catch (reason) {
    reportError(reason);
  }
}
async function applyForm(candidate: DiagramSpec): Promise<void> {
  try {
    if (await applySpec(candidate, undefined, true))
      showNotice(
        activeDirty.value
          ? "表单已应用；未应用的 JSON 草稿仍保留在源码模式"
          : "表单已应用，画布已更新",
      );
  } catch (reason) {
    reportError(reason);
  }
}
async function updateSpec(change: (spec: DiagramSpec) => void): Promise<void> {
  try {
    const source = sourceDrafts.value[activeIndex.value]!;
    const candidate = activeDirty.value
      ? structuredClone(validateSpec(JSON.parse(source)))
      : structuredClone(applied.value);
    change(candidate);
    await applySpec(candidate, source);
  } catch (reason) {
    reportError(reason);
  }
}
function selectTheme(name: ThemeName): void {
  void updateSpec((spec) => {
    spec.theme = name;
    delete spec.style;
  });
}
function updateStyle(key: keyof Theme, value: string | number): void {
  void updateSpec((spec) => {
    spec.style = { ...spec.style, [key]: value };
  });
}
function updateLayout(
  key: keyof DiagramLayoutOptions,
  value: number | boolean | 'bridge' | 'plain',
): void {
  void updateSpec((spec) => {
    spec.layout = { ...spec.layout, [key]: value };
  });
}
function selectLayoutMode(
  mode: NonNullable<DiagramLayoutOptions["mode"]>,
): void {
  void updateSpec((spec) => {
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
  const value = resolveLayout(applied.value)[key];
  return typeof value === "number" ? value : 0;
}
function renameDocument(event: Event): void {
  const title = (event.target as HTMLInputElement).value.trim();
  if (!title) {
    (event.target as HTMLInputElement).value = collection.value.title;
    reportError(new Error("文档标题不能为空。"));
    return;
  }
  commitCollection({ ...getDocument(), title });
}
function getSpec(): DiagramSpec {
  return structuredClone(applied.value);
}
function getDocument(): DiagramDocument {
  return structuredClone(collection.value);
}
function getSvg(): string {
  if (!canvas.value) throw new Error("工作台尚未挂载。");
  return canvas.value.getSvg();
}
async function exportImage(options?: ExportOptions): Promise<Blob> {
  await ready;
  if (!canvas.value) throw new Error("工作台尚未挂载。");
  return canvas.value.exportImage(options);
}
function hasUnsavedDrafts(): boolean {
  return anySourceDirty.value || !!formEditor.value?.hasChanges();
}
function saveHtml(): string {
  if (hasUnsavedDrafts())
    throw new Error(
      "存在未应用的草稿。请先应用表单 / JSON，再保存整个文档；也可在源码模式下载草稿。",
    );
  return createHtml(getDocument(), runtime.value);
}
function filename(extension: string, wholeDocument = false): string {
  const title = (wholeDocument ? collection.value.title : applied.value.title)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 100);
  return `${title || "uml-diagram"}.${extension}`;
}
async function downloadImage(): Promise<void> {
  if (
    (activeDirty.value || formEditor.value?.hasChanges()) &&
    !window.confirm(
      "当前图表有未应用草稿。继续仅导出画布中上次成功应用的图表？草稿仍保留。",
    )
  )
    return;
  exporting.value = true;
  try {
    const selected = format.value;
    downloadBlob(
      await exportImage({
        format: selected,
        scale: scale.value,
        quality: quality.value,
      }),
      filename(selected === "jpeg" ? "jpg" : selected),
    );
    showNotice(`${selected.toUpperCase()} 已导出 · ${scale.value}×`);
  } catch (reason) {
    reportError(reason);
  } finally {
    exporting.value = false;
  }
}
function copyImage(): void {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    reportError(
      new Error(
        "当前浏览器或页面环境不支持复制 PNG 图片。请在支持图片剪贴板的浏览器中，以 localhost 或 HTTPS 打开工作台并允许剪贴板权限；不会改为下载文件或复制链接。",
      ),
    );
    return;
  }
  if (
    (activeDirty.value || formEditor.value?.hasChanges()) &&
    !window.confirm(
      "当前图表有未应用草稿。继续复制画布中上次成功应用的图表？草稿仍保留。",
    )
  )
    return;
  try {
    const selectedScale = scale.value;
    // Pass a promise in the original click gesture; rendering may complete later.
    const png = exportImage({ format: "png", scale: selectedScale });
    void png.catch(() => {});
    const operation = navigator.clipboard.write([
      new ClipboardItem({ "image/png": png }),
    ]);
    copyingImage.value = true;
    void operation
      .then(
        () => {
          showNotice(`当前图表 PNG 已复制 · ${selectedScale}×`);
        },
        (reason) => {
          reportError(
            new Error(
              `复制 PNG 图片失败：${reason instanceof Error ? reason.message : String(reason)}。请确认浏览器支持图片剪贴板，并允许当前页面写入剪贴板。未下载文件，也未复制图片链接。`,
            ),
          );
        },
      )
      .finally(() => {
        copyingImage.value = false;
      });
  } catch (reason) {
    copyingImage.value = false;
    reportError(
      new Error(
        `无法复制 PNG 图片：${reason instanceof Error ? reason.message : String(reason)}。未下载文件，也未复制图片链接。`,
      ),
    );
  }
}
function downloadHtml(): void {
  try {
    if (
      hasUnsavedDrafts() &&
      !window.confirm(
        "有未应用的草稿，不会写入 HTML。继续仅保存全部已应用图表？草稿仍留在本工作台，可返回应用后重新保存。",
      )
    )
      return;
    downloadBlob(
      new Blob([createHtml(getDocument(), runtime.value)], {
        type: "text/html;charset=utf-8",
      }),
      filename("html", true),
    );
    savedSnapshot.value = json(collection.value);
    showNotice(
      `已保存全部 ${collection.value.diagrams.length} 张图表，离线打开即可继续编辑`,
    );
  } catch (reason) {
    reportError(reason);
  }
}
async function copyJson(): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("剪贴板 API 不可用");
    await navigator.clipboard.writeText(draft.value);
    showNotice("当前源码草稿已复制");
  } catch {
    const target = editor.value;
    if (!target) {
      reportError(new Error("无法访问剪贴板，请打开源码模式手动复制。"));
      return;
    }
    target.focus();
    target.select();
    if (document.execCommand("copy")) showNotice("当前源码草稿已复制");
    else
      reportError(
        new Error(
          "浏览器禁止剪贴板访问。已选中 JSON，请按 Ctrl/Cmd + C 复制。",
        ),
      );
  }
}
function downloadJson(): void {
  downloadBlob(
    new Blob([draft.value], { type: "application/json;charset=utf-8" }),
    filename("json", sourceScope.value === "document"),
  );
  showNotice(
    dirty.value ? "已下载当前源码草稿（含未应用修改）" : "JSON 已下载",
  );
}
function downloadDocumentJson(): void {
  if (
    hasUnsavedDrafts() &&
    !window.confirm(
      "继续下载全部已应用图表的 JSON？未应用草稿不会写入，仍留在工作台。",
    )
  )
    return;
  downloadBlob(
    new Blob([json(getDocument())], { type: "application/json;charset=utf-8" }),
    filename("json", true),
  );
  showNotice("整个文档 JSON 已下载");
}
function formatJson(): void {
  try {
    draft.value = json(JSON.parse(draft.value));
    error.value = "";
  } catch (reason) {
    reportError(reason);
  }
}
function resetSource(): void {
  if (dirty.value && !window.confirm("放弃当前源码草稿，恢复为已应用数据？"))
    return;
  draft.value = json(
    sourceScope.value === "document" ? collection.value : applied.value,
  );
}
async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const importTicket = ++importRequest;
  const startedAt = revision;
  const originalCollection = collection.value;
  try {
    const source = await file.text();
    if (
      importTicket !== importRequest ||
      startedAt !== revision ||
      originalCollection !== collection.value
    )
      return;
    const text = source.trimStart().startsWith("<")
      ? new DOMParser()
          .parseFromString(source, "text/html")
          .getElementById("diagram-data")?.textContent
      : source;
    if (!text)
      throw new Error(
        "HTML 中没有可编辑的 #diagram-data 数据，请导入 UML Studio 保存的文件。",
      );
    const candidate = validateDocument(normalizeDocument(JSON.parse(text)));
    if (!permitCollectionReplace()) return;
    if (!(await replaceDocument(candidate))) return;
    showNotice(
      `已导入 ${file.name} · ${collection.value.diagrams.length} 张图表`,
    );
  } catch (reason) {
    if (importTicket === importRequest && revision === startedAt)
      reportError(reason);
  }
}
function editorKeydown(event: KeyboardEvent): void {
  if (loading.value) return;
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void applyDraft();
  }
  if (event.key === "Tab") {
    event.preventDefault();
    const target = event.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    draft.value = `${draft.value.slice(0, start)}  ${draft.value.slice(target.selectionEnd)}`;
    void nextTick(() => {
      target.selectionStart = target.selectionEnd = start + 2;
    });
  }
}
function beforeUnload(event: BeforeUnloadEvent): void {
  if (!hasUnsavedDrafts() && json(collection.value) === savedSnapshot.value)
    return;
  event.preventDefault();
  event.returnValue = "";
}
onMounted(async () => {
  window.addEventListener("beforeunload", beforeUnload);
  try {
    if (!canvas.value) throw new Error("图表组件挂载失败。");
    await canvas.value.ready;
    try {
      runtime.value = await props.runtimeReady;
    } catch (reason) {
      runtimeError.value =
        reason instanceof Error ? reason.message : String(reason);
    }
    if (!runtime.value && !runtimeError.value)
      runtimeError.value = "独立 HTML 运行时未加载，请先运行构建。";
    resolveReady();
  } catch (reason) {
    reportError(reason);
    rejectReady(reason);
  }
});
onBeforeUnmount(() => {
  revision++;
  clearTimeout(noticeTimer);
  window.removeEventListener("beforeunload", beforeUnload);
});
defineExpose({
  ready,
  getSpec,
  setSpec,
  getDocument,
  setDocument,
  selectDiagram,
  getSvg,
  exportImage,
  saveHtml,
});
</script>

<template>
  <div class="studio-shell">
    <header class="studio-header">
      <a
        href="#"
        class="studio-brand"
        aria-label="UML Studio 工作台"
        @click.prevent
        ><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span
        ><span
          >UML<span class="brand-light"> STUDIO</span
          ><small>把复杂，画清楚。</small></span
        ></a
      >
      <div class="header-center">
        <span class="live-indicator"></span>本地工作台
        <span class="header-slash">/</span> 一个文件，多张图表
      </div>
      <div class="header-actions">
        <button
          class="button button-quiet mobile-menu-button"
          type="button"
          :aria-expanded="sidebarOpen"
          @click="sidebarOpen = !sidebarOpen"
        >
          图表列表
        </button>
        <button
          class="button button-quiet"
          type="button"
          title="导入单张图表或整个文档；替换当前集合"
          @click="importInput?.click()"
        >
          导入<span class="hide-small">
            JSON / HTML</span
          >
        </button>
        <button
          class="button button-dark"
          type="button"
          :disabled="!runtime || loading"
          :title="runtimeError || '保存全部图表为可离线编辑的单个 HTML 文件'"
          @click="downloadHtml"
        >
          保存 HTML<span class="hide-small">
            · 全部 {{ collection.diagrams.length }} 张</span
          >
        </button>
      </div>
      <input
        ref="importInput"
        class="visually-hidden"
        type="file"
        accept=".json,.html,.htm,application/json,text/html"
        aria-label="导入单图或多图 JSON / HTML"
        @change="importFile"
      />
    </header>

    <div class="studio-body">
      <button
        v-if="sidebarOpen"
        class="sidebar-scrim"
        type="button"
        aria-label="关闭图表列表"
        @click="sidebarOpen = false"
      ></button>
      <aside
        class="studio-sidebar"
        :class="{ 'is-open': sidebarOpen }"
        aria-label="文档与图表列表"
      >
        <button class="button button-quiet mobile-menu-button sidebar-close" type="button" @click="sidebarOpen = false">关闭图表列表</button>
        <div class="sidebar-section">
          <div class="section-heading">
            <h2>文档中的图表</h2>
            <span class="section-meta"
              >{{ collection.diagrams.length }} 张</span
            >
          </div>
          <label class="field-label" for="document-title">文档名称</label
          ><input
            id="document-title"
            class="text-input document-title"
            :value="collection.title"
            :disabled="loading"
            @change="renameDocument"
          />
          <nav class="diagram-list" aria-label="选择要编辑的图表">
            <button
              v-for="(spec, index) in collection.diagrams"
              :key="spec.id ?? index"
              type="button"
              :class="{ selected: activeIndex === index }"
              :aria-current="activeIndex === index ? 'true' : undefined"
              @click="selectFromList(index)"
            >
              <span class="diagram-list-index">{{
                String(index + 1).padStart(2, "0")
              }}</span
              ><span
                ><strong>{{ spec.title }}</strong
                ><small
                  >{{ labels[spec.type] }} ·
                  {{ themeLabels[spec.theme ?? "ocean"]
                  }}<b v-if="sourceDrafts[index] !== json(spec)">
                    · JSON 草稿</b
                  ></small
                ></span
              >
            </button>
          </nav>
          <div class="collection-actions">
            <button
              class="button button-outline"
              type="button"
              :disabled="loading"
              title="复制当前已应用数据，保留原图"
              @click="appendDiagram(applied, true)"
            >
              复制当前图</button
            ><button
              class="button button-outline danger-button"
              type="button"
              :disabled="loading || collection.diagrams.length < 2"
              title="至少保留一张图表"
              @click="removeDiagram"
            >
              移除
            </button>
          </div>
          <label class="field-label" for="diagram-type"
            >从示例新增（不会替换现有图表）</label
          >
          <div class="add-diagram-row">
            <select
              id="diagram-type"
              v-model="addType"
              class="select-input type-select"
            >
              <optgroup
                v-for="family in families"
                :key="family.label"
                :label="family.label"
              >
                <option v-for="type in family.types" :key="type" :value="type">
                  {{ labels[type] }}
                </option>
              </optgroup></select
            ><button
              class="button button-accent"
              type="button"
              :disabled="loading"
              @click="addExample(addType)"
            >
              新增图表
            </button>
          </div>
          <details class="quick-presets-disclosure"><summary>常用图型快捷新增</summary><div class="quick-presets">
            <button
              v-for="type in [
                'fishbone',
                'flowchart',
                'sequence',
                'class',
              ] as const"
              :key="type"
              type="button"
              :disabled="loading"
              @click="addExample(type)"
            >
              {{ labels[type] }}
            </button>
          </div></details>
          <p class="export-tip">
            允许同类多图。每张图独立保存主题、布局和数据。
          </p>
        </div>

        <div class="sidebar-footnote">
          <span class="live-indicator"></span>数据只留在你的浏览器中
        </div>
      </aside>

      <main class="studio-main">
        <div class="workspace-heading">
          <div>
            <h1>{{ applied.title }}</h1>
            <p v-if="applied.description">{{ applied.description }}</p>
          </div>
          <div class="workspace-actions">
          <button class="button button-outline" type="button" :aria-expanded="styleOpen" aria-controls="diagram-styles" @click="showStyles">调整样式</button>
          <button
            class="button button-accent editor-toggle"
            type="button"
            :aria-expanded="editorOpen"
            aria-controls="diagram-editor"
            @click="toggleEditor"
          >
            {{ editorOpen ? "收起编辑器" : "编辑图表" }}
          </button>
          </div>
        </div>
        <div class="workspace-meta">
          <span class="type-badge"
            >{{ activeIndex + 1 }} / {{ collection.diagrams.length }} ·
            {{ labels[applied.type] }}</span
          ><span>{{ itemCount }}</span
          ><span class="meta-dot">·</span
          ><span
            >{{ themeLabels[applied.theme ?? "ocean"] }}主题{{
              applied.style ? " / 自定义" : ""
            }}</span
          ><span v-if="anySourceDirty || formDirty" class="draft-indicator" role="status">有未应用{{ formDirty ? '表单' : 'JSON' }}草稿</span>
          <span v-else-if="pendingSave" class="save-state" role="status">待保存 HTML</span>
          <span v-else class="save-state">修改后请保存 HTML</span>
        </div>
        <section
          class="export-section export-toolbar"
          aria-label="导出与复制当前图"
        >

          <div class="export-fields">
            <label for="export-format"
              >文件格式<select
                id="export-format"
                v-model="format"
                class="select-input"
              >
                <option value="svg">SVG · 矢量</option>
                <option value="png">PNG · 无损</option>
                <option value="jpeg">JPEG · 通用</option>
                <option value="webp">WebP · 轻量</option>
              </select></label
            ><label for="export-scale"
              >导出倍率<select
                id="export-scale"
                v-model.number="scale"
                class="select-input"
              >
                <option :value="1">1× 原始</option>
                <option :value="2">2× 清晰</option>
                <option :value="3">3× 高清</option>
                <option :value="4">4× 超清</option>
              </select></label
            >
          </div>
          <label
            v-if="format === 'jpeg' || format === 'webp'"
            class="range-control quality-control"
            ><span
              >图片质量<output>{{ Math.round(quality * 100) }}%</output></span
            ><input
              v-model.number="quality"
              type="range"
              min="0.1"
              max="1"
              step="0.01"
          /></label>
          <div class="export-image-actions">
            <button
              class="button button-accent export-button"
              type="button"
              :disabled="loading || exporting"
              @click="downloadImage"
            >
              {{ exporting ? "正在导出…" : "导出图片" }}
            </button>
            <button
              class="button button-outline export-button"
              type="button"
              :disabled="loading || copyingImage"
              @click="copyImage"
            >
              {{ copyingImage ? "正在复制 PNG…" : "复制图片（PNG）" }}
            </button>
          </div>
          <details class="more-export">
            <summary>更多导出</summary>
            <div class="more-export-content">
              <button class="button button-outline" type="button" @click="downloadDocumentJson">下载整个文档 JSON</button>
              <p class="export-tip">图片导出当前图；HTML 与文档 JSON 包含全部图表。PNG / WebP 支持透明，JPEG 铺白底。</p>
            </div>
          </details>
        </section>
        <div v-if="error" class="error-banner" role="alert">
          <span class="error-icon" aria-hidden="true">!</span>
          <div>
            <strong>这次修改未替换画布，保留上次成功结果</strong>
            <p>{{ error }}</p>
          </div>
          <button
            class="icon-button"
            type="button"
            aria-label="关闭错误提示"
            @click="error = ''"
          >
            ×
          </button>
        </div>
        <div class="workspace-panels" :class="{ 'with-editor': editorOpen }">
          <div class="preview-column">
            <DiagramCanvas
              ref="canvas"
              :spec="initialSpec"
              :runtime="runtime"
              :element-selection="editorOpen && editorMode === 'form'"
              @select-element="formEditor?.focusElement($event)"
              @loading="loading = $event"
              @error="reportError"
            />
            <details id="diagram-styles" ref="stylePanel" class="preview-style-panel" :open="styleOpen" @toggle="styleOpen = ($event.target as HTMLDetailsElement).open">
              <summary>
                图形样式与布局 <span>展开调整配色、字体和布局参数</span>
              </summary>
              <div class="style-panel-content">
                <div class="sidebar-section">
                  <div class="section-heading">
                    <h2>当前图的视觉风格</h2>
                    <button
                      class="text-button"
                      type="button"
                      :disabled="!applied.style"
                      @click="
                        updateSpec((spec) => {
                          delete spec.style;
                        })
                      "
                    >
                      重置定制
                    </button>
                  </div>
                  <div class="theme-grid" aria-label="主题预设">
                    <button
                      v-for="name in themeNames"
                      :key="name"
                      type="button"
                      class="theme-option"
                      :class="{ selected: (applied.theme ?? 'ocean') === name }"
                      :aria-pressed="(applied.theme ?? 'ocean') === name"
                      @click="selectTheme(name)"
                    >
                      <span
                        class="theme-preview"
                        :style="{
                          background: themes[name].background,
                          borderColor: themes[name].border,
                        }"
                        ><i :style="{ background: themes[name].primary }"></i
                        ><i
                          :style="{ background: themes[name].secondary }"
                        ></i></span
                      ><span>{{ themeLabels[name] }}</span>
                    </button>
                  </div>
                  <details class="advanced-styles"><summary>自定义配色</summary><div class="advanced-inner">
                  <div class="style-subheading">
                    配色覆盖<span v-if="applied.style" class="custom-badge"
                      >已定制</span
                    >
                  </div>
                  <div class="studio-colors">
                    <ColorInput
                      v-for="control in colorControls"
                      :key="control.key"
                      :model-value="currentTheme[control.key]"
                      :label="control.label"
                      :allow-transparent="
                        control.key === 'background' ||
                        control.key === 'surface'
                      "
                      @update:model-value="updateStyle(control.key, $event)"
                    />
                  </div>
                  </div></details>
                  <details class="advanced-styles">
                    <summary>
                      字体与细节
                    </summary>
                    <div class="advanced-inner">
                      <label class="field-label" for="font-preset"
                        >字体预设（只使用本机字体）</label
                      ><select
                        id="font-preset"
                        class="select-input"
                        :value="selectedFont"
                        @change="
                          ($event.target as HTMLSelectElement).value &&
                          updateStyle(
                            'fontFamily',
                            ($event.target as HTMLSelectElement).value,
                          )
                        "
                      >
                        <option value="">自定义字体</option>
                        <option
                          v-for="font in fontPresets"
                          :key="font.value"
                          :value="font.value"
                        >
                          {{ font.label }}
                        </option>
                      </select>
                      <label class="field-label" for="font-family"
                        >自定义字体 / 回退列表</label
                      ><input
                        id="font-family"
                        class="text-input"
                        type="text"
                        :value="currentTheme.fontFamily"
                        @change="
                          updateStyle(
                            'fontFamily',
                            ($event.target as HTMLInputElement).value,
                          )
                        "
                      />
                      <div class="font-format-row">
                        <label for="font-weight"
                          >字重<select
                            id="font-weight"
                            class="select-input"
                            :value="currentTheme.fontWeight"
                            @change="
                              updateStyle(
                                'fontWeight',
                                Number(
                                  ($event.target as HTMLSelectElement).value,
                                ),
                              )
                            "
                          >
                            <option :value="300">300 轻体</option>
                            <option :value="400">400 常规</option>
                            <option :value="500">500 中等</option>
                            <option :value="600">600 半粗</option>
                            <option :value="700">700 粗体</option>
                            <option :value="800">800 特粗</option>
                            <option :value="900">900 重体</option>
                          </select></label
                        ><button
                          type="button"
                          class="format-button"
                          :aria-pressed="currentTheme.fontStyle === 'italic'"
                          @click="
                            updateStyle(
                              'fontStyle',
                              currentTheme.fontStyle === 'italic'
                                ? 'normal'
                                : 'italic',
                            )
                          "
                        >
                          <i>I</i><span>斜体</span></button
                        ><button
                          type="button"
                          class="format-button"
                          :aria-pressed="
                            currentTheme.textDecoration === 'underline'
                          "
                          @click="
                            updateStyle(
                              'textDecoration',
                              currentTheme.textDecoration === 'underline'
                                ? 'none'
                                : 'underline',
                            )
                          "
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
                            @change="
                              updateStyle(
                                control.key,
                                Number(
                                  ($event.target as HTMLInputElement).value,
                                ),
                              )
                            "
                        /></label>
                      </div>
                    </div>
                  </details>
                  <details class="advanced-styles">
                    <summary>
                      布局与尺寸
                    </summary>
                    <div class="advanced-inner">
                      <template v-if="graphDiagram">
                        <label class="field-label" for="edge-crossing">连线交叉表示</label>
                        <select id="edge-crossing" class="select-input"
                          :value="applied.layout?.edgeCrossing ?? 'bridge'"
                          @change="updateLayout('edgeCrossing', ($event.target as HTMLSelectElement).value as 'bridge' | 'plain')">
                          <option value="bridge">拱桥形跳线（默认）</option>
                          <option value="plain">直接交叉（无圆点）</option>
                        </select>
                        <p class="field-hint">拱桥或无圆点交叉均表示不相连。</p>
                      </template>
                      <label class="field-label" for="layout-mode"
                        >布局模式</label
                      ><select
                        id="layout-mode"
                        class="select-input layout-mode-select"
                        :value="applied.layout?.mode ?? 'balanced'"
                        @change="
                          selectLayoutMode(
                            ($event.target as HTMLSelectElement)
                              .value as NonNullable<
                              DiagramLayoutOptions['mode']
                            >,
                          )
                        "
                      >
                        <option
                          v-for="mode in layoutModes"
                          :key="mode.value"
                          :value="mode.value"
                        >
                          {{ mode.label }}
                        </option>
                      </select>
                      <p class="control-hint">
                        切换模式会恢复该模式的元素 /
                        区域间距，保留尺寸上限等设置。
                      </p>
                      <label class="checkbox-control"
                        ><input
                          type="checkbox"
                          :checked="applied.layout?.showTitle === true"
                          @change="
                            updateLayout(
                              'showTitle',
                              ($event.target as HTMLInputElement).checked,
                            )
                          "
                        /><span>在图中显示标题和说明</span></label
                      >
                      <label class="field-label" for="layout-direction"
                        >布局方向</label
                      ><select
                        id="layout-direction"
                        class="select-input"
                        :value="applied.direction ?? (applied.type === 'usecase' ? 'LR' : 'TB')"
                        :disabled="!graphDiagram"
                        @change="
                          updateSpec((spec) => {
                            spec.direction = (
                              $event.target as HTMLSelectElement
                            ).value as 'TB' | 'LR';
                          })
                        "
                      >
                        <option value="TB">从上到下 ↓</option>
                        <option value="LR">从左到右 →</option>
                      </select>
                      <p v-if="!graphDiagram" class="control-hint">
                        方向、节点尺寸及每列节点数只用于节点图；时序图和鱼骨图采用专用布局。
                      </p>
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
                            :disabled="
                              'graphOnly' in control &&
                              control.graphOnly &&
                              !graphDiagram
                            "
                            :value="layoutValue(control.key)"
                            @change="
                              updateLayout(
                                control.key,
                                Number(
                                  ($event.target as HTMLInputElement).value,
                                ),
                              )
                            "
                          /><small>{{ control.hint }}</small></label
                        >
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            </details>
          </div>
          <section
            id="diagram-editor"
            v-show="editorOpen"
            class="data-panel"
            aria-label="当前图表编辑器"
          >
            <div class="editor-mode-tabs" role="tablist" aria-label="编辑模式">
              <button
                id="form-tab"
                type="button"
                role="tab"
                :aria-selected="editorMode === 'form'"
                aria-controls="form-panel"
                @click="editorMode = 'form'"
              >
                表单编辑</button
              ><button
                id="source-tab"
                type="button"
                role="tab"
                :aria-selected="editorMode === 'source'"
                aria-controls="source-panel"
                @click="editorMode = 'source'"
              >
                JSON 源码
              </button>
            </div>
            <div
              id="form-panel"
              v-show="editorMode === 'form'"
              class="form-panel"
              role="tabpanel"
              aria-labelledby="form-tab"
            >
              <fieldset class="editor-fields" :disabled="loading">
                <FormEditor
                  ref="formEditor"
                  :model-value="applied"
                  @update:model-value="applyForm"
                />
              </fieldset>
            </div>
            <div
              id="source-panel"
              v-show="editorMode === 'source'"
              class="json-panel"
              role="tabpanel"
              aria-labelledby="source-tab"
            >
              <div class="json-header">
                <h2>JSON 源码</h2>
                <button
                  class="text-button"
                  type="button"
                  :disabled="loading"
                  @click="formatJson"
                >
                  格式化
                </button>
              </div>
              <label class="source-scope"
                >编辑范围<select v-model="sourceScope" class="select-input">
                  <option value="diagram">当前图表 · 单图 JSON</option>
                  <option value="document">整个文档 · 全部图表 JSON</option>
                </select></label
              >
              <div class="editor-filebar">
                <span class="file-dot"></span
                >{{
                  sourceScope === "document"
                    ? "document.json"
                    : `diagram-${activeIndex + 1}.json`
                }}<span :class="dirty ? 'file-dirty' : 'file-saved'">{{
                  dirty ? "未应用草稿" : "已同步"
                }}</span>
              </div>
              <label class="visually-hidden" for="json-editor"
                >编辑 JSON，按 Ctrl 或 Command 加 Enter 应用</label
              ><textarea
                id="json-editor"
                ref="editor"
                v-model="draft"
                class="json-editor"
                :readonly="loading"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                autocorrect="off"
                @keydown="editorKeydown"
              ></textarea>
              <div class="json-actions">
                <button
                  class="button button-accent"
                  type="button"
                  :disabled="loading"
                  @click="applyDraft"
                >
                  {{
                    loading
                      ? "正在绘制…"
                      : sourceScope === "document"
                        ? "应用整个文档"
                        : "应用当前图表"
                  }}<kbd>⌘ / Ctrl ↵</kbd>
                </button>
                <div>
                  <button class="text-button" type="button" @click="copyJson">
                    复制草稿</button
                  ><span>·</span
                  ><button
                    class="text-button"
                    type="button"
                    @click="downloadJson"
                  >
                    下载草稿</button
                  ><span>·</span
                  ><button
                    class="text-button"
                    type="button"
                    :disabled="loading"
                    @click="resetSource"
                  >
                    恢复已应用
                  </button>
                </div>
              </div>
              <p class="editor-hint">
                切换编辑模式和图表会保留 JSON
                草稿。无效输入不会覆盖画布。整个文档的草稿独立保存，应用后会替换全部图表。
              </p>
            </div>
          </section>
        </div>
        <footer class="workspace-footer">
          <span>修改保留在当前页面，保存 HTML 后可继续离线编辑。</span
          ><span
            v-if="runtimeError"
            class="runtime-warning"
            :title="runtimeError"
            >独立 HTML 运行时尚未就绪</span
          ><span v-else
            >18 种图表 · {{ themeNames.length }} 套主题 · 多图离线文档</span
          >
        </footer>
      </main>
    </div>
    <Transition name="toast"
      ><div v-if="notice" class="studio-toast" role="status">
        {{ notice }}
      </div></Transition
    >
  </div>
</template>

<style>
.uml-form-editor,
.uml-color-input,
.uml-cause-editor {
  --uml-edit-ink: #203c52;
  --uml-edit-muted: #61788b;
  --uml-edit-line: #cadbe7;
  --uml-edit-accent: #2167a8;
  --uml-edit-soft: #eef6fc;
  color: var(--uml-edit-ink);
  font: inherit;
  min-width: 0;
  box-sizing: border-box;
}
.uml-form-editor *,
.uml-color-input *,
.uml-cause-editor * {
  box-sizing: border-box;
}
.uml-form-editor {
  display: grid;
  gap: 14px;
  padding: 18px 20px;
}
.uml-editor-tools {
  position: sticky;
  top: 0;
  z-index: 3;
  display: grid;
  gap: 10px;
  padding: 12px 0;
  background: #fff;
  border-bottom: 1px solid var(--uml-edit-line);
}
.uml-editor-selected {
  outline: 3px solid #6ba9d8;
  outline-offset: 3px;
}
.uml-form-editor h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}
.uml-form-editor label,
.uml-color-input > label {
  display: grid;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  font-weight: 600;
}
.uml-form-editor input:not([type="checkbox"]):not([type="color"]),
.uml-form-editor select,
.uml-form-editor textarea,
.uml-color-input input[type="text"],
.uml-cause-editor input[type="text"] {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 35px;
  border: 1px solid var(--uml-edit-line);
  border-radius: 7px;
  background: #fff;
  color: var(--uml-edit-ink);
  padding: 7px 9px;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
}
.uml-form-editor textarea {
  resize: vertical;
}
.uml-form-editor input::placeholder {
  color: #61788b;
}
.uml-form-editor button,
.uml-color-input button,
.uml-cause-editor button {
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--uml-edit-line);
  border-radius: 7px;
  background: #fff;
  color: var(--uml-edit-ink);
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}
.uml-form-editor button:hover:not(:disabled),
.uml-color-input button:hover:not(:disabled),
.uml-cause-editor button:hover:not(:disabled) {
  border-color: var(--uml-edit-accent);
  background-color: var(--uml-edit-soft);
}
.uml-form-editor button:disabled,
.uml-color-input button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.uml-form-editor :is(button, input, select, textarea, summary):focus-visible,
.uml-color-input :is(button, input):focus-visible,
.uml-cause-editor :is(button, input):focus-visible {
  outline: 3px solid #9dc8ed;
  outline-offset: 2px;
}
.uml-editor-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.uml-editor-hint {
  margin: 0;
  color: var(--uml-edit-muted);
  font-size: 12px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}
.uml-editor-badge {
  padding: 3px 7px;
  border: 1px solid #c8dfef;
  border-radius: 999px;
  color: #34698f;
  background: #edf6fc;
  font-size: 12px;
}
.uml-editor-section {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 12px 0 0;
  border-top: 1px solid var(--uml-edit-line);
}
.uml-editor-card {
  min-width: 0;
  border: 1px solid var(--uml-edit-line);
  border-radius: 9px;
  background: #fff;
}
.uml-editor-card > summary,
.uml-editor-subsection > summary {
  padding: 12px 16px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.uml-editor-card > summary {
  background: #f4f8fb;
  border-radius: 8px;
}
.uml-editor-card[open] > summary {
  border-bottom: 1px solid var(--uml-edit-line);
  border-radius: 8px 8px 0 0;
}
.uml-form-editor code {
  font-size: 12px;
  color: var(--uml-edit-muted);
  font-weight: 400;
  overflow-wrap: anywhere;
}
.uml-editor-card summary code {
  display: inline-block;
  margin-inline-start: 4px;
}
.uml-editor-card__body {
  display: grid;
  gap: 10px;
  padding: 16px;
  min-width: 0;
}
.uml-editor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(145px, 100%), 1fr));
  gap: 10px;
  min-width: 0;
}
.uml-editor-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.uml-editor-inline > input {
  flex: 1;
}
.uml-editor-inline > button {
  flex: none;
}
.uml-form-editor .uml-editor-checkbox {
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 400;
}
.uml-editor-checkbox input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--uml-edit-accent);
}
.uml-editor-subsection {
  display: grid;
  min-width: 0;
  border: 1px solid #dce7ee;
  border-radius: 7px;
}
.uml-editor-subsection[open] {
  padding: 0 9px 10px;
}
.uml-editor-subsection[open] > :not(summary) {
  margin-top: 10px;
}
.uml-editor-subsection > summary {
  padding: 8px;
}
.uml-form-editor button.uml-editor-danger,
.uml-cause-editor button.uml-editor-danger {
  color: #a83545;
  border-color: #e7c6cd;
}
.uml-form-editor button.uml-editor-danger:hover,
.uml-cause-editor button.uml-editor-danger:hover {
  border-color: #bc5363;
  background: #fff3f4;
}
.uml-editor-actions {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding: 12px 0 2px;
  border-top: 1px solid var(--uml-edit-line);
  background: #fff;
}
.uml-form-editor button.uml-editor-apply {
  padding-inline: 20px;
  background: var(--uml-edit-accent);
  color: #fff;
  border-color: var(--uml-edit-accent);
  font-weight: 700;
}
.uml-form-editor button.uml-editor-apply:hover {
  background: #18568f;
  color: #fff;
}
.uml-editor-error {
  margin: 0 0 9px;
  color: #ac273d;
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.uml-color-input {
  display: grid;
  gap: 6px;
}
.uml-color-input__row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.uml-color-input__row > input[type="text"] {
  flex: 1;
  font-family: ui-monospace, Consolas, monospace;
}
.uml-color-input__sample {
  position: relative;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border: 1px solid #9dafbe;
  border-radius: 7px;
}
.uml-color-input__sample input[type="color"] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.uml-color-input__sample:focus-within {
  outline: 3px solid #9dc8ed;
  outline-offset: 2px;
}
.uml-checker {
  background-color: #fff;
  background-image: conic-gradient(
    #c5d0d9 25%,
    transparent 0 50%,
    #c5d0d9 0 75%,
    transparent 0
  );
  background-size: 12px 12px;
}
.uml-color-input__palette {
  display: grid;
  gap: 10px;
  padding: 11px;
  border: 1px solid #bfd3e3;
  border-radius: 8px;
  background: #f5f9fc;
}
.uml-color-input__palette strong {
  font-size: 12px;
}
.uml-color-input__swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(26px, 1fr));
  gap: 6px;
}
.uml-color-input__swatches button {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 28px;
  height: 28px;
  padding: 0;
  border-color: #a6b6c3;
  border-radius: 5px;
}
.uml-color-input__swatches button:hover:not(:disabled) {
  transform: translateY(-1px);
  background-color: revert;
}
.uml-color-input__swatches button[aria-pressed="true"] {
  outline: 2px solid #2167a8;
  outline-offset: 2px;
}
.uml-color-input__swatches button > span {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  color: #133e60;
  font-size: 12px;
  box-shadow: 0 0 0 1px #b5c4d0;
}
.uml-color-input__transparent {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.uml-color-input__transparent .uml-checker {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 1px solid #a6b6c3;
  border-radius: 3px;
}
.uml-color-input__transparent[aria-pressed="true"] {
  outline: 2px solid #2167a8;
  outline-offset: 1px;
}
.uml-cause-editor {
  min-width: 0;
  border: 1px solid var(--uml-edit-line);
  border-radius: 7px;
  padding: 10px;
}
.uml-cause-editor > summary {
  cursor: pointer;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.uml-cause-editor[open] > :not(summary) {
  margin-top: 10px;
}
.uml-cause-editor__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 5px;
}
.uml-cause-editor__row > label {
  grid-column: 1 / -1;
  color: var(--uml-edit-muted);
  font-size: 12px;
}
.uml-cause-editor__row > button {
  padding-inline: 7px;
  font-size: 12px;
}
.uml-cause-editor__children {
  display: grid;
  gap: 8px;
  margin-inline-start: 7px;
  padding-inline-start: 9px;
  border-inline-start: 1px solid #c6ddec;
}
@media (max-width: 420px) {
  .uml-form-editor {
    padding: 14px;
  }
  .uml-editor-card__body {
    padding: 12px;
  }
  .uml-cause-editor__row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .uml-cause-editor__row > input {
    grid-column: 1 / -1;
  }
  .uml-cause-editor__row > button {
    justify-self: start;
  }
}

:root {
  font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
  color: #203c52;
  background: #f3f6f9;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  --accent: #2167a8;
  --accent-hover: #17558d;
  --ink: #203c52;
  --muted: #526b7d;
  --line: #cfdae4;
  --paper: #fff;
  --radius: 12px;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; }
button, input, select, textarea { font: inherit; }
button, a { touch-action: manipulation; }
button { color: inherit; cursor: pointer; transition: background-color .16s, border-color .16s; }
button:disabled { cursor: not-allowed; opacity: .5; }
:is(button,a,summary,input,select,textarea):focus-visible { outline: 3px solid #70a9db; outline-offset: 3px; }
input,textarea { caret-color: var(--accent); }
input[type="range"] { accent-color: var(--accent); }
::selection { background: #cce4f7; color: #173b5b; }
* { scrollbar-width: thin; scrollbar-color: #aebfcd #f3f6f9; }
.visually-hidden { position: absolute !important; width: 1px !important; height: 1px !important; margin: -1px !important; padding: 0 !important; overflow: hidden !important; clip: rect(0,0,0,0) !important; white-space: nowrap !important; border: 0 !important; }
.studio-shell { min-height: 100vh; }
.studio-header { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 12px 24px; background: #fff; border-bottom: 1px solid var(--line); position: relative; z-index: 20; }
.studio-brand { display: flex; align-items: center; gap: 12px; color: var(--ink); text-decoration: none; font-size: 20px; font-weight: 700; line-height: 1.2; white-space: nowrap; }
.brand-light { font-weight: 400; font-size: 17px; }
.studio-brand small { display: block; margin-top: 5px; font-size: 12px; font-weight: 400; color: var(--muted); }
.brand-mark { position: relative; display: block; width: 32px; height: 36px; border: 1.5px solid var(--accent); border-radius: 6px; }
.brand-mark i { position: absolute; width: 9px; height: 9px; border: 1.5px solid var(--accent); border-radius: 2px; background: white; }
.brand-mark i:nth-child(1) { top: 5px; left: 5px; }
.brand-mark i:nth-child(2) { bottom: 5px; right: 5px; }
.brand-mark i:nth-child(3) { width: 1px; height: 13px; left: 15px; top: 10px; transform: rotate(-32deg); border-width: 0 0 0 1.5px; }
.header-center { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.live-indicator { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #357662; flex: none; }
.header-slash { margin: 0 4px; color: #92a5b4; }
.header-actions, .workspace-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; padding: 8px 12px; border: 1px solid transparent; border-radius: 6px; font-size: 13px; font-weight: 500; line-height: 1.5; white-space: nowrap; }
.button-dark, .button-accent { background: var(--accent); border-color: var(--accent); color: #fff; }
.button-dark:hover:not(:disabled), .button-accent:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
.button-outline { background: #fff; border-color: var(--line); color: #315974; }
.button-outline:hover:not(:disabled), .button-quiet:hover:not(:disabled) { background: #edf4fa; border-color: #8cabc3; }
.button-quiet { background: transparent; color: var(--muted); }
.mobile-menu-button, .sidebar-scrim { display: none; }
.studio-body { display: flex; min-height: calc(100vh - 72px); align-items: stretch; }
.studio-sidebar { width: 256px; flex: none; padding: 0 16px 16px; background: #fff; border-right: 1px solid var(--line); }
.sidebar-section { padding: 20px 0; }
.section-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.section-heading h2 { margin: 0; font-size: 14px; font-weight: 600; }
.section-meta { margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; }
.field-label { display: block; color: var(--muted); font-size: 12px; margin: 12px 0 6px; }
.select-input, .text-input { width: 100%; max-width: 100%; min-height: 38px; border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; background: #fff; color: var(--ink); font-size: 13px; }
.select-input:hover, .text-input:hover { border-color: #8ca8bd; }
.document-title { margin-bottom: 16px; }
.diagram-list { display: grid; gap: 4px; max-height: min(48vh, 500px); overflow-y: auto; margin-bottom: 12px; }
.diagram-list > button { display: flex; gap: 10px; align-items: center; min-width: 0; padding: 10px 8px; text-align: left; background: transparent; border: 1px solid transparent; border-radius: 6px; }
.diagram-list > button:hover { background: #f1f6fa; }
.diagram-list > button.selected { background: #e9f3fb; border-color: #a8c6df; }
.diagram-list-index { color: #4b7594; font-size: 12px; font-variant-numeric: tabular-nums; flex: none; }
.diagram-list > button > span:last-child { min-width: 0; }
.diagram-list strong { display: block; font-size: 13px; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere; }
.diagram-list small { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.diagram-list small b { color: #8b571e; font-weight: 400; }
.collection-actions { display: flex; gap: 8px; padding-bottom: 16px; margin-bottom: 18px; border-bottom: 1px solid var(--line); }
.collection-actions .button { flex: 1; min-height: 34px; padding: 6px; font-size: 12px; }
.danger-button { color: #a2394a; }
.add-diagram-row { display: flex; gap: 6px; }
.add-diagram-row .select-input { flex: 1; min-width: 0; }
.add-diagram-row .button { flex: none; padding: 7px 9px; font-size: 12px; }
.quick-presets-disclosure { margin-top: 16px; font-size: 12px; color: var(--muted); }
.quick-presets-disclosure > summary { cursor: pointer; padding: 4px 0; }
.quick-presets { display: grid; grid-template-columns: repeat(2,1fr); gap: 6px; margin-top: 10px; }
.quick-presets button { min-height: 34px; border: 1px solid var(--line); border-radius: 5px; background: #fff; color: #315974; font-size: 12px; }
.quick-presets button:hover { background: #edf4fa; }
.export-tip, .control-hint, .field-hint { margin: 10px 0 0; font-size: 12px; color: var(--muted); line-height: 1.7; }
.sidebar-footnote { display: flex; gap: 7px; align-items: center; color: var(--muted); font-size: 12px; line-height: 1.6; padding-top: 16px; border-top: 1px solid var(--line); }
.studio-main { flex: 1; min-width: 0; padding: 24px; background: #f3f6f9; }
.workspace-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.workspace-heading > div:first-child { min-width: 0; }
.workspace-heading h1 { margin: 0; font-size: 24px; font-weight: 600; line-height: 1.45; overflow-wrap: anywhere; }
.workspace-heading p { max-width: 74ch; margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
.workspace-actions { flex: none; }
.workspace-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 12px 0 20px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.type-badge { color: #315f83; }
.meta-dot { color: #7a91a2; }
.draft-indicator { color: #895518; }
.save-state { color: var(--muted); margin-left: auto; }
.export-toolbar { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; padding: 12px 0 16px; border-bottom: 1px solid var(--line); }
.export-fields { display: flex; gap: 8px; }
.export-fields > label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; }
.export-fields .select-input { min-width: 124px; }
.export-image-actions { display: flex; gap: 8px; }
.quality-control { width: 128px; margin: 0 0 4px; }
.range-control > span { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; gap: 8px; }
.range-control input { width: 100%; margin: 8px 0 0; }
.more-export { position: relative; margin-bottom: 1px; font-size: 12px; }
.more-export > summary { min-height: 38px; padding: 9px 4px; cursor: pointer; color: #315974; }
.more-export-content { position: absolute; z-index: 10; top: 44px; right: 0; width: 290px; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
.workspace-panels { display: grid; grid-template-columns: minmax(0,1fr); align-items: start; gap: 16px; }
.workspace-panels.with-editor { grid-template-columns: minmax(0,1fr) minmax(340px,380px); }
.preview-column { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.preview-style-panel { min-width: 0; background: #fff; border: 1px solid var(--line); border-radius: 12px; }
.preview-style-panel > summary { padding: 16px 18px; cursor: pointer; color: var(--ink); font-size: 14px; font-weight: 600; }
.preview-style-panel > summary span { margin-left: 8px; font-size: 12px; color: var(--muted); font-weight: 400; }
.style-panel-content { padding: 0 18px 18px; }
.style-panel-content > .sidebar-section { padding: 12px 0 0; }
.section-heading .text-button { margin-left: auto; }
.text-button { border: 0; background: none; padding: 5px 0; color: #315f83; font-size: 12px; line-height: 1.6; }
.text-button:hover:not(:disabled) { color: var(--accent-hover); text-decoration: underline; text-underline-offset: 3px; }
.theme-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(64px,1fr)); gap: 10px; }
.theme-option { display: flex; flex-direction: column; align-items: center; gap: 8px; background: transparent; border: 0; padding: 4px; color: var(--muted); font-size: 12px; }
.theme-preview { width: 100%; height: 30px; display: flex; gap: 5px; align-items: center; justify-content: center; border: 1px solid; border-radius: 5px; }
.theme-preview i { display: block; width: 10px; height: 12px; border-radius: 2px; }
.theme-preview i + i { height: 9px; }
.theme-option.selected .theme-preview { outline: 2px solid var(--accent); outline-offset: 2px; }
.theme-option.selected { color: var(--accent); font-weight: 600; }
.style-subheading { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--muted); font-size: 12px; }
.custom-badge { padding: 2px 6px; border-radius: 4px; color: #8b571e; background: #fff2df; font-size: 12px; }
.studio-colors { display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 16px; }
.advanced-styles { margin-top: 20px; border-top: 1px solid var(--line); }
.advanced-styles > summary { padding: 14px 0; font-size: 13px; font-weight: 600; color: #315974; cursor: pointer; }
.advanced-inner { padding: 0 0 4px; }
.advanced-inner > .text-input { margin-bottom: 12px; }
.font-format-row { display: flex; gap: 8px; align-items: flex-end; margin: 16px 0; }
.font-format-row > label { flex: 1; font-size: 12px; color: var(--muted); }
.font-format-row select { margin-top: 6px; }
.format-button { display: flex; gap: 5px; align-items: center; justify-content: center; min-height: 38px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: #315974; font-size: 12px; }
.format-button[aria-pressed="true"] { background: #e9f3fb; border-color: #86b1d2; }
.number-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 16px; }
.number-control { display: grid; align-content: start; gap: 6px; min-width: 0; color: var(--muted); font-size: 12px; }
.number-control > span { display: flex; justify-content: space-between; gap: 4px; }
.number-control small { font-size: 12px; color: var(--muted); line-height: 1.5; }
.number-control input { font-variant-numeric: tabular-nums; }
.number-control input:disabled { opacity: .5; cursor: not-allowed; }
.layout-number-grid { margin-top: 16px; }
.checkbox-control { display: flex; align-items: center; gap: 8px; margin: 16px 0; font-size: 13px; }
.checkbox-control input { accent-color: var(--accent); }
.data-panel { display: flex; flex-direction: column; min-width: 0; height: clamp(560px,calc(100vh - 250px),900px); border: 1px solid var(--line); border-radius: 12px; background: #fff; overflow: hidden; scroll-margin-top: 16px; }
.editor-mode-tabs { display: flex; flex: none; padding: 6px; gap: 6px; background: #edf3f8; border-bottom: 1px solid var(--line); }
.editor-mode-tabs > button { flex: 1; min-height: 36px; border: 1px solid transparent; border-radius: 5px; padding: 8px; background: transparent; color: var(--muted); font-size: 13px; }
.editor-mode-tabs > button[aria-selected="true"] { background: #fff; border-color: #c4d6e4; color: #215a86; font-weight: 600; }
.form-panel { flex: 1; min-height: 0; overflow: auto; }
.editor-fields { min-width: 0; margin: 0; padding: 0; border: 0; }
.json-panel { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; background: #fff; overflow: hidden; }
.json-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; border-bottom: 1px solid var(--line); }
.json-header h2 { margin: 0; font-size: 13px; font-weight: 600; }
.source-scope { display: flex; align-items: center; gap: 8px; padding: 10px 16px; color: var(--muted); font-size: 12px; }
.source-scope select { flex: 1; min-width: 0; font-size: 12px; }
.editor-filebar { display: flex; align-items: center; gap: 7px; flex: none; padding: 9px 16px; background: #f3f7fa; border-block: 1px solid #e4ebf1; color: var(--muted); font-size: 12px; }
.file-dot { width: 5px; height: 5px; background: #5d8b78; border-radius: 50%; }
.file-saved, .file-dirty { margin-left: auto; }
.file-dirty { color: #895518; }
.json-editor { flex: 1; min-height: 220px; width: 100%; resize: vertical; border: 0; background: #fff; color: #24485f; font: 13px/1.8 Consolas,"Microsoft YaHei",monospace; padding: 16px; tab-size: 2; white-space: pre; overflow: auto; }
.json-editor:focus-visible { outline: 2px solid #70a9db; outline-offset: -2px; }
.json-actions { border-top: 1px solid var(--line); padding: 12px 16px 0; }
.json-actions > .button { width: 100%; justify-content: space-between; }
.json-actions kbd { font: 11px/1.5 Consolas,monospace; }
.json-actions > div { display: flex; gap: 10px; justify-content: center; align-items: center; flex-wrap: wrap; margin-top: 8px; color: #a0b0bc; }
.editor-hint { margin: 0; padding: 8px 16px 14px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.workspace-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 16px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.runtime-warning { color: #895518; }
.error-banner { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px; padding: 14px; background: #fff3f3; border: 1px solid #e8bfc5; border-radius: 8px; color: #9c2f40; }
.error-banner strong { font-size: 14px; }
.error-banner p { margin: 6px 0 0; font-size: 13px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.error-banner > div { flex: 1; min-width: 0; }
.error-icon { font-size: 14px; }
.icon-button { width: 32px; height: 32px; border: 0; border-radius: 5px; background: transparent; color: #9c2f40; font-size: 20px; }
.studio-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 100; max-width: calc(100vw - 32px); padding: 12px 20px; background: #234963; color: #fff; border-radius: 8px; box-shadow: 0 6px 20px #203c5230; font-size: 13px; line-height: 1.6; }
.toast-enter-active, .toast-leave-active { transition: opacity .15s; }
.toast-enter-from, .toast-leave-to { opacity: 0; }
/* Canvas geometry and export stay unchanged; align its controls with the workbench. */
.studio-shell .diagram-canvas { height: clamp(560px,calc(100vh - 250px),900px); min-height: 560px; border-color: var(--line); border-radius: 12px; background: #fff; box-shadow: none; color: var(--ink); }
.studio-shell .canvas-toolbar { min-height: 48px; height: auto; padding: 8px 12px; background: #fff; border-color: var(--line); flex-wrap: wrap; }
.studio-shell .canvas-status { color: var(--muted); font-size: 12px; }
.studio-shell .canvas-dimensions { color: var(--muted); font-size: 12px; }
.studio-shell .canvas-stage { background-color: #edf2f6; background-image: radial-gradient(#c0ced9 .7px,transparent .7px); }
.studio-shell .zoom-value { font-size: 12px; color: var(--muted); min-width: 40px; }
.studio-shell .zoom-tools button { width: 28px; min-height: 30px; color: #315974; font-size: 16px; }
.studio-shell .zoom-tools .fit-button { width: auto; padding: 0 6px; font-size: 12px; }
.studio-shell .zoom-tools button:hover { background: #edf4fa; color: var(--accent); }
.studio-shell .diagram-canvas button:focus-visible { outline-color: #70a9db; }
@media (max-width: 1200px) {
  .header-center { display: none; }
  .workspace-panels.with-editor { grid-template-columns: minmax(0,1fr); }
  .data-panel { height: 650px; }
}
@media (max-width: 860px) {
  .studio-header { gap: 12px; padding: 12px 16px; }
  .mobile-menu-button { display: inline-flex; }
  .studio-sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: min(300px,88vw); z-index: 40; overflow-y: auto; transform: translateX(-100%); visibility: hidden; }
  .studio-sidebar.is-open { transform: translateX(0); visibility: visible; }
  .sidebar-scrim { display: block; position: fixed; inset: 0; z-index: 35; border: 0; background: #18314666; }
  .studio-main { padding: 20px 16px; }
  .workspace-heading { flex-wrap: wrap; gap: 16px; }
  .workspace-actions { width: 100%; }
  .workspace-heading h1 { font-size: 22px; }
  .save-state { margin-left: 0; }
}
@media (max-width: 540px) {
  .studio-header { flex-wrap: wrap; gap: 16px; }
  .studio-brand { font-size: 18px; }
  .header-actions { width: 100%; }
  .header-actions .button { flex: 1; padding-inline: 8px; font-size: 12px; }
  .hide-small { display: none; }
  .workspace-heading h1 { font-size: 21px; }
  .workspace-actions .button { flex: 1; }
  .export-toolbar { gap: 12px; }
  .export-fields { width: 100%; }
  .export-fields > label { flex: 1; min-width: 0; }
  .export-fields .select-input { min-width: 0; }
  .export-image-actions { width: 100%; }
  .export-image-actions .button { flex: 1; font-size: 12px; padding-inline: 8px; }
  .more-export-content { position: static; width: min(290px,calc(100vw - 32px)); margin-top: 6px; }
  .preview-style-panel > summary span { display: block; margin: 6px 0 0; }
  .style-panel-content { padding-inline: 14px; }
  .theme-grid { grid-template-columns: repeat(5,minmax(0,1fr)); gap: 8px 4px; }
  .theme-option { padding: 2px; }
  .studio-colors { grid-template-columns: 1fr; }
  .number-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
  .data-panel { height: 650px; }
  .studio-shell .diagram-canvas { height: 520px; min-height: 520px; }
  .studio-shell .canvas-dimensions { display: none; }
  .json-actions > .button { flex-wrap: wrap; gap: 4px; }
}
@media (prefers-reduced-motion: reduce) {
  *,*::before,*::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
@media print {
  .studio-header,.studio-sidebar,.workspace-heading,.workspace-meta,.export-toolbar,.data-panel,.workspace-footer,.studio-toast,.error-banner,.preview-style-panel { display: none !important; }
  .studio-main { padding: 0; background: #fff; }
  .workspace-panels.with-editor,.studio-body { display: block; }
}
/* Persistent preview instructions remain legible at every viewport. */
.studio-shell .canvas-footer { height: auto; min-height: 38px; color: #526b7d; font-size: 12px; line-height: 1.6; padding: 10px 12px; background: #fff; border-color: #cfdae4; flex-wrap: wrap; gap: 6px; }
.studio-shell .canvas-empty { color: #526b7d; }
.studio-shell .canvas-empty p { font-size: 13px; }
.sidebar-close { margin-top: 12px; }
</style>
