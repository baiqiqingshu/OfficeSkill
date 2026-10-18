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
    hint: "分组、泳道或分析维度间距",
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
const editorOpen = ref(true);
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
  value: number | boolean,
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
          <span aria-hidden="true">↥</span> 导入<span class="hide-small">
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
          ↓ 保存 HTML<span class="hide-small">
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
        <div class="sidebar-section">
          <div class="section-heading">
            <span class="section-index">01</span>
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
              ＋ 新增
            </button>
          </div>
          <div class="quick-presets">
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
              <span aria-hidden="true">＋</span>{{ labels[type] }}
            </button>
          </div>
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
            <div class="eyebrow">ONE DOCUMENT, MANY CONNECTED IDEAS</div>
            <h1>{{ applied.title }}</h1>
            <p>
              {{ applied.description || "让节点找到位置，让想法建立连接。" }}
            </p>
          </div>
          <button
            class="button button-outline editor-toggle"
            type="button"
            :aria-pressed="editorOpen"
            @click="editorOpen = !editorOpen"
          >
            {{ editorOpen ? "收起编辑器" : "编辑图表" }}
          </button>
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
          ><span v-if="anySourceDirty" class="draft-indicator"
            >保留着未应用 JSON 草稿</span
          >
        </div>
        <section
          class="export-section export-toolbar"
          aria-label="导出与复制当前图"
        >
          <div class="section-heading"><h2>导出当前图</h2></div>
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
              ↓
              {{
                exporting ? "正在导出…" : `导出 ${format.toUpperCase()} 图片`
              }}
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
          <button
            class="button button-outline export-button"
            type="button"
            @click="downloadDocumentJson"
          >
            下载整个文档 JSON
          </button>
          <p class="export-tip">
            图片只导出当前图；HTML 和文档 JSON 包含全部图表。PNG / WebP
            保留透明，JPEG 铺白底。
          </p>
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
              @loading="loading = $event"
              @error="reportError"
            />
            <details class="preview-style-panel">
              <summary>
                图形样式与布局 <span>展开调整配色、字体和布局参数</span>
              </summary>
              <div class="style-panel-content">
                <div class="sidebar-section">
                  <div class="section-heading">
                    <span class="section-index">02</span>
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
                  <div class="style-subheading">
                    自定义配色<span v-if="applied.style" class="custom-badge"
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
                  <details class="advanced-styles" open>
                    <summary>
                      字体与细节<span aria-hidden="true">＋</span>
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
                  <details class="advanced-styles" open>
                    <summary>
                      布局与尺寸<span aria-hidden="true">＋</span>
                    </summary>
                    <div class="advanced-inner">
                      <label class="field-label" for="layout-mode"
                        >布局模式</label
                      ><select
                        id="layout-mode"
                        class="select-input layout-mode-select"
                        :value="applied.layout?.mode ?? 'compact'"
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
                        :value="applied.direction ?? 'TB'"
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
          <span>结构先行，表达自有力量。</span
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
        <span aria-hidden="true">✓</span>{{ notice }}
      </div></Transition
    >
  </div>
</template>
