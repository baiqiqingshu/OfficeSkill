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
import VSelect from "./VSelect.vue";
import ElementInspector from "./ElementInspector.vue";
import StyleDialog from "./StyleDialog.vue";
import AddElementDialog from "./AddElementDialog.vue";
import ContextMenu from "./ContextMenu.vue";
import type { MenuEntry } from "./ContextMenu.vue";
import type { AddElementPayload } from "./AddElementDialog.vue";
import type { ElementMove, LayoutBox, LayoutItem, LayoutSnapshot } from "./DiagramCanvas.vue";
import { createHtml, downloadBlob } from "./export";
import type { StudioRuntime } from "./export";
import {
  canChooseDirectory,
  canSaveLocalHtml,
  chooseDefaultDirectory,
  chooseLocalHtmlTarget,
  loadHandle,
  pageDirectory,
  pageFileName,
  pageHandleKey,
  storeHandle,
  writeLocalHtml,
} from "./filesystem-save";
import type { LocalDirectory, LocalHtmlTarget } from "./filesystem-save";
import { isMermaidSource, mermaidToDocument } from "./mermaid";
import { resolveTheme, themeLabels, themes } from "./themes";
import { normalizeDocument, validateDocument } from "./document";
import { validateSpec } from "./validate";
import type {
  DiagramDocument,
  DiagramEdge,
  DiagramInput,
  DiagramNode,
  DiagramSpec,
  DiagramType,
  ElementAdjustment,
  ExportOptions,
  FishboneCause,
  Participant,
  ThemeName,
} from "./types";

interface CanvasHandle {
  ready: Promise<void>;
  getSpec(): DiagramSpec;
  setSpec(spec: DiagramSpec): Promise<void>;
  getSvg(): string;
  exportImage(options?: ExportOptions): Promise<Blob>;
  layoutSnapshot(): LayoutSnapshot | undefined;
  restoreRendered(): void;
}
interface FormHandle {
  hasChanges(): boolean;
  getDraft(): DiagramSpec;
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
// Committed specs/documents are never mutated in place (every edit clones and replaces), so the
// pretty JSON of an object can be memoised: dirty checks, drafts and the save snapshot otherwise
// re-serialised the whole document (images included) several times per edit.
const jsonCache = new WeakMap<object, string>();
const json = (value: unknown): string => {
  if (!value || typeof value !== "object") return JSON.stringify(value, null, 2);
  const raw = toRaw(value) as object;
  let text = jsonCache.get(raw);
  if (text === undefined) jsonCache.set(raw, (text = JSON.stringify(raw, null, 2)));
  return text;
};
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
const diagramFilter = ref("");
const filteredDiagrams = computed(() => {
  const keyword = diagramFilter.value.trim().toLowerCase();
  return collection.value.diagrams
    .map((spec, index) => ({ spec, index }))
    .filter(
      ({ spec }) =>
        !keyword ||
        spec.title.toLowerCase().includes(keyword) ||
        labels[spec.type].toLowerCase().includes(keyword),
    );
});
const canvas = ref<CanvasHandle>();
const formEditor = ref<FormHandle>();
const editor = ref<HTMLTextAreaElement>();
const importInput = ref<HTMLInputElement>();
const runtime = shallowRef<StudioRuntime>();
const runtimeError = ref("");
const error = ref(initialError);
const notice = ref("");
const editorOpen = ref(false);
const styleDialogOpen = ref(false);
const addDialogOpen = ref(false);
const interactionMode = ref<"select" | "connect">("select");
const selectedKeys = ref<string[]>([]);
const marqueeKeys = ref<string[]>([]);
const menuState = ref<{ x: number; y: number; canvas: boolean } | undefined>();
const adjustmentsOpen = ref(false);
const savingHtml = ref(false);
const localSaveSupported = canSaveLocalHtml();
const localTargetName = ref("");
let localTarget: LocalHtmlTarget | undefined;
let lastLocalTarget: LocalHtmlTarget | undefined;
let defaultDirectory: LocalDirectory | undefined;
const defaultDirectoryName = ref("");
const directoryPickerSupported = canChooseDirectory();
const currentPageDirectory = pageDirectory();
const mermaidSource = ref("");
void (async () => {
  if (!localSaveSupported) return;
  const [page, last, directory] = await Promise.all([
    loadHandle<LocalHtmlTarget>(pageHandleKey()),
    loadHandle<LocalHtmlTarget>("last-file"),
    loadHandle<LocalDirectory>("default-directory"),
  ]);
  if (page && !localTarget) { localTarget = page; localTargetName.value = page.name; }
  lastLocalTarget = last;
  defaultDirectory = directory;
  defaultDirectoryName.value = directory?.name ?? "";
})();
const adjustmentCount = computed(() => Object.keys(applied.value.layout?.adjustments?.elements ?? {}).length + Object.keys(applied.value.layout?.adjustments?.edges ?? {}).length);
const adjustmentsJson = computed(() => json(applied.value.layout?.adjustments ?? { elements: {}, edges: {} }));
const pendingSave = computed(() => json(collection.value) !== savedSnapshot.value);
const formDirty = computed(() => !!formEditor.value?.hasChanges());
async function toggleEditor(): Promise<void> {
  editorOpen.value = !editorOpen.value;
  if (!editorOpen.value) return;
  await nextTick();
  const panel = document.getElementById("diagram-editor");
  panel?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
}
const editorMode = ref<"form" | "source">("form");
const sidebarOpen = ref(false);
const sidebarTab = ref<"theme" | "diagrams">("theme");
const loading = ref(true);
const exporting = ref(false);
const copyingImage = ref(false);
const addType = ref<DiagramType>("fishbone");
const format = ref<NonNullable<ExportOptions["format"]>>("png");
const scale = ref(2);
const quality = ref(0.94);
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
    // Other diagrams are already validated and immutable: share them instead of cloning and
    // re-validating the whole document; only the document-level ID uniqueness needs a check.
    if (candidate.id && collection.value.diagrams.some((spec, position) => position !== index && spec.id === candidate.id))
      throw new Error(`图形存在重复 ID：${candidate.id}`);
    const next: DiagramDocument = {
      ...collection.value,
      diagrams: collection.value.diagrams.map((spec, position) =>
        position === index ? candidate : spec,
      ),
    };
    ticket = ++revision;
    if (!(await renderCandidate(next.diagrams[index]!, ticket))) return false;
    commitCollection(next);
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
    candidate.theme ??= "modern";
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
async function removeDiagramAt(index: number): Promise<void> {
  const target = collection.value.diagrams[index];
  if (!target || collection.value.diagrams.length < 2) return;
  if (
    !window.confirm(
      `移除“${target.title}”？这张图及其未应用草稿会被删除，其他图表不受影响。`,
    )
  )
    return;
  const ticket = ++revision;
  const diagrams = collection.value.diagrams.filter(
    (_, position) => position !== index,
  );
  const nextIndex = Math.min(index, diagrams.length - 1);
  try {
    if (!(await renderCandidate(diagrams[nextIndex]!, ticket))) return;
    commitCollection({ ...getDocument(), diagrams });
    sourceDrafts.value.splice(index, 1);
    activeIndex.value = nextIndex;
    error.value = "";
    await nextTick();
    if (ticket === revision) formEditor.value?.resetDraft();
    showNotice("图表已移除");
  } catch (reason) {
    if (ticket === revision) reportError(reason);
  }
}
async function removeDiagram(): Promise<void> {
  await removeDiagramAt(activeIndex.value);
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
      committed = await replaceDocument(parseSource(source, scope), source);
    } else
      committed = await applySpec(validateSpec(parseSource(source, scope)), source);
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
    frozenOrigins.length = 0;
    change(candidate);
    const frozen = frozenOrigins.splice(0);
    await applySpec(candidate, source);
    if (frozen.length) convertToCenters(frozen);
  } catch (reason) {
    reportError(reason);
  }
}
/* 检查器文本输入防抖：连续输入合并为一次校验 + 排版。 */
const queuedSpecChanges: ((spec: DiagramSpec) => void)[] = [];
let updateSpecTimer: ReturnType<typeof setTimeout> | undefined;
function updateSpecDebounced(change: (spec: DiagramSpec) => void): void {
  queuedSpecChanges.push(change);
  clearTimeout(updateSpecTimer);
  updateSpecTimer = setTimeout(() => {
    const batch = queuedSpecChanges.splice(0);
    void updateSpec((spec) => {
      for (const run of batch) run(spec);
    });
  }, 300);
}
function selectTheme(name: ThemeName): void {
  void updateSpec((spec) => {
    spec.theme = name;
    delete spec.style;
  });
}
async function applyPositionChange(change: (spec: DiagramSpec) => void): Promise<boolean> {
  try {
    if (savingHtml.value) throw new Error("正在保存 HTML，请保存结束后再调整位置。");
    if (activeDirty.value || formEditor.value?.hasChanges())
      throw new Error("请先应用当前表单或 JSON 草稿，再调整位置；草稿仍保留。");
    const candidate = getSpec();
    change(candidate);
    return await applySpec(candidate);
  } catch (reason) {
    // A rejected gesture must also discard its temporary SVG preview. The canvas keeps its last
    // successful render (a failed render never replaces it), so restore that without re-rendering.
    canvas.value?.restoreRendered();
    reportError(reason);
    showNotice("位置调整未生效，已恢复上一次的布局");
    return false;
  }
}
const isPinnedAdjustment = (value?: ElementAdjustment): boolean => !!value && ("cx" in value || "x" in value);
const roundCoordinate = (value: number) => Math.round(value * 100) / 100;
/** Drag commit: the element is pinned at its new absolute centre `{cx, cy}`. */
function adjustElement(change: ElementMove): void {
  // Sequence / fishbone centres are renderer-defined anchors; without data-layout-cx (first
  // adjustment of the diagram) the canvas can only estimate them, so record the exact legacy
  // offset once and convert it to {cx, cy} from the next render's metadata.
  const special = applied.value.type === "sequence" || applied.value.type === "fishbone";
  const legacy = special && !change.exact;
  void applyPositionChange((spec) => {
    const adjustments = spec.layout?.adjustments ?? {};
    const elements = { ...adjustments.elements };
    const old = elements[change.key];
    elements[change.key] = !legacy ? { cx: change.cx, cy: change.cy }
      : old && "cx" in old ? { cx: old.cx + change.dx, cy: old.cy + change.dy }
      : old && "x" in old ? { x: old.x + change.dx, y: old.y + change.dy }
      : { dx: (old && "dx" in old ? old.dx : 0) + change.dx, dy: (old && "dy" in old ? old.dy : 0) + change.dy };
    // Pinned containers carry unpinned members; already pinned followers move explicitly.
    for (const member of change.members ?? [])
      if (isPinnedAdjustment(elements[member.key])) elements[member.key] = { cx: member.cx, cy: member.cy };
    spec.layout = { ...spec.layout, adjustments: { ...adjustments, elements } };
  }).then((committed) => { if (committed && legacy) convertToCenters([change.key]); });
}
/**
 * Rewrite legacy offsets as `{cx, cy}` from the current render's centre metadata. The element
 * already sits there, so this is a data-only commit (no re-render).
 */
function convertToCenters(keys: string[]): void {
  const snapshot = canvas.value?.layoutSnapshot();
  if (!snapshot || activeDirty.value || formEditor.value?.hasChanges()) return;
  const spec = getSpec();
  const elements = spec.layout?.adjustments?.elements;
  if (!elements) return;
  let changed = false;
  for (const key of keys) {
    const item = snapshot.items.find((entry) => entry.key === key);
    if (!item?.exact || !elements[key] || "cx" in elements[key]!) continue;
    elements[key] = { cx: roundCoordinate(item.center.x), cy: roundCoordinate(item.center.y) };
    changed = true;
  }
  if (!changed) return;
  const index = activeIndex.value;
  const sourceWasClean = sourceDrafts.value[index] === json(applied.value);
  commitCollection({ ...collection.value, diagrams: collection.value.diagrams.map((value, position) => position === index ? spec : value) });
  if (sourceWasClean) sourceDrafts.value[index] = json(spec);
}
function adjustWaypoints(change: { key: string; waypoints: { x: number; y: number }[] }): void {
  void applyPositionChange((spec) => {
    const adjustments = spec.layout?.adjustments ?? {};
    const edges = { ...adjustments.edges };
    if (change.waypoints.length) edges[change.key] = { waypoints: change.waypoints };
    else delete edges[change.key];
    spec.layout = { ...spec.layout, adjustments: { ...adjustments, edges } };
  });
}
function clearAdjustments(): void {
  void applyPositionChange((spec) => {
    if (spec.layout) delete spec.layout.adjustments;
  });
}
/* ---------- 画布选择与编辑（契约：select-element / selection-change / request-delete / connect-nodes） ---------- */
function onSelectElement(key: string): void {
  // 空 key 是点中空白：清空选择，避免留下 [''] 脏状态。
  selectedKeys.value = key ? [key] : [];
  if (key) formEditor.value?.focusElement(key).catch(() => {});
}
function onSelectionChange(keys: string[]): void {
  marqueeKeys.value = keys;
  // 单击选中后画布会补发 selectionChange([]) 清理框选态，不能把单选冲掉；
  // 只有框选真正圈到元素时才改写 selectedKeys。
  if (keys.length) selectedKeys.value = keys;
}
function uniqueElementId(spec: DiagramSpec, prefix: string): string {
  const used = new Set(
    [
      ...(spec.nodes ?? []),
      ...(spec.edges ?? []),
      ...(spec.groups ?? []),
      ...(spec.lanes ?? []),
      ...(spec.participants ?? []),
      ...(spec.fishbone?.categories ?? []),
    ]
      .map((item) => item.id)
      .filter(Boolean),
  );
  let index = 1;
  while (used.has(`${prefix}_${index}`)) index++;
  return `${prefix}_${index}`;
}
function dropEdge(spec: DiagramSpec, index: number): void {
  const edge = spec.edges?.[index];
  if (!edge) return;
  const key = edge.id ?? `edge-${index}`;
  spec.edges!.splice(index, 1);
  const adjustments = spec.layout?.adjustments;
  if (adjustments?.edges) delete adjustments.edges[key];
  if (adjustments?.elements)
    for (const name of Object.keys(adjustments.elements))
      if (name.startsWith(`edge-labels/${key}/`)) delete adjustments.elements[name];
}
function dropElement(spec: DiagramSpec, key: string): void {
  const [field, raw] = key.split("/");
  const index = Number(raw);
  const elements = spec.layout?.adjustments?.elements;
  switch (field) {
    case "edges":
      dropEdge(spec, index);
      return;
    case "nodes": {
      const node = spec.nodes?.[index];
      if (!node) return;
      for (let i = (spec.edges?.length ?? 0) - 1; i >= 0; i--)
        if (spec.edges![i]!.from === node.id || spec.edges![i]!.to === node.id)
          dropEdge(spec, i);
      spec.nodes!.splice(index, 1);
      if (elements) delete elements[`nodes/${node.id}`];
      return;
    }
    case "groups": {
      const group = spec.groups?.[index];
      if (!group) return;
      spec.groups!.splice(index, 1);
      spec.nodes?.forEach((node) => {
        if (node.group === group.id) delete node.group;
      });
      spec.groups?.forEach((child) => {
        if (child.parent === group.id) delete child.parent;
      });
      if (elements) delete elements[`groups/${group.id}`];
      return;
    }
    case "lanes": {
      const lane = spec.lanes?.[index];
      if (!lane) return;
      spec.lanes!.splice(index, 1);
      spec.nodes?.forEach((node) => {
        if (node.lane === lane.id) delete node.lane;
      });
      if (elements) delete elements[`lanes/${lane.id}`];
      return;
    }
    case "participants": {
      const participant = spec.participants?.[index];
      if (!participant) return;
      if (
        spec.messages?.some(
          (message) =>
            message.from === participant.id || message.to === participant.id,
        )
      )
        throw new Error(
          `参与者「${participant.label}」仍被消息引用；请先删除相关消息。`,
        );
      spec.participants!.splice(index, 1);
      spec.boxes?.forEach((box) => {
        box.participants = box.participants.filter((id) => id !== participant.id);
      });
      if (elements) delete elements[`participants/${participant.id}`];
      return;
    }
    case "messages": {
      const message = spec.messages?.[index];
      if (!message) return;
      if (
        spec.fragments?.some(
          (fragment) => fragment.from <= index && fragment.to >= index,
        )
      )
        throw new Error(
          `第 ${index + 1} 条消息属于组合片段，暂不支持直接删除；请在“完整编辑”中调整片段范围。`,
        );
      spec.messages!.splice(index, 1);
      for (const fragment of spec.fragments ?? []) {
        if (fragment.from > index) fragment.from--;
        if (fragment.to > index) fragment.to--;
        if (fragment.elseAt !== undefined && fragment.elseAt > index)
          fragment.elseAt--;
        fragment.elses?.forEach((item) => {
          if (item.at > index) item.at--;
        });
      }
      return;
    }
    case "fragments":
      spec.fragments?.splice(index, 1);
      return;
    case "boxes":
      spec.boxes?.splice(index, 1);
      return;
    case "categories": {
      // categories/<i> 或 categories/<i>/causes/<j>/children/<k>…：逐对下钻到父容器
      const parts = key.split("/");
      const pairs: [string, number][] = [];
      for (let d = 0; d + 1 < parts.length; d += 2)
        pairs.push([parts[d]!, Number(parts[d + 1])]);
      const prop = (name: string) =>
        name === "children" ? "children" : name === "causes" ? "causes" : name;
      let container: any = spec.fishbone;
      for (let p = 0; container && p + 1 < pairs.length; p++)
        container = container[prop(pairs[p]![0])]?.[pairs[p]![1]];
      if (!container) return;
      const [lastName, at] = pairs[pairs.length - 1]!;
      const list = container[prop(lastName)] as { label: string }[] | undefined;
      if (!Array.isArray(list) || !list[at]) return;
      if (lastName === "categories" && list.length <= 1)
        throw new Error("鱼骨图至少保留一个分类。");
      if (lastName === "causes" && list.length <= 1)
        throw new Error("每个鱼骨分类至少保留一个原因。");
      list.splice(at, 1);
      return;
    }
    default:
      // effect / edge-labels / 其他图元暂不支持删除
      return;
  }
}
function onRequestDelete(keys: string[]): void {
  if (!keys.length) return;
  const order = [
    "edges",
    "messages",
    "fragments",
    "boxes",
    "nodes",
    "groups",
    "lanes",
    "participants",
    "categories",
  ];
  const sorted = [...new Set(keys)].sort((a, b) => {
    const fa = order.indexOf(a.split("/")[0]!);
    const fb = order.indexOf(b.split("/")[0]!);
    if (fa !== fb) return fa - fb;
    return Number(b.split("/")[1]) - Number(a.split("/")[1]);
  });
  void updateSpec((spec) => {
    for (const key of sorted) dropElement(spec, key);
  }).then(() => {
    selectedKeys.value = [];
    marqueeKeys.value = [];
    showNotice(`已删除 ${sorted.length} 个元素`);
  });
}
function onConnectNodes({ from, to }: { from: string; to: string }): void {
  if (!applied.value.nodes?.length) {
    showNotice("当前图类型不支持手动连线。");
    return;
  }
  void updateSpec((spec) => {
    (spec.edges ??= []).push({
      id: uniqueElementId(spec, "edge"),
      from,
      to,
      kind: "flow",
    });
  }).then(() => showNotice(`已连接 ${from} → ${to}`));
}
/* ---------- 新增元素：冻结现有节点 + 空位放置（仅节点图） ---------- */
type PlacedSize = { width: number; height: number };
interface Addition { key: string; size: PlacedSize; offset: { x: number; y: number } }
/** Clearance kept between new elements and existing content (layout units). */
const PLACE_GAP = 64;
function isNodeGraph(spec: DiagramSpec): boolean {
  return spec.type !== "sequence" && spec.type !== "fishbone";
}
function textWidth(value: string, size: number): number {
  return Math.max(0, ...value.replace(/\r\n?/g, "\n").split("\n").map((line) =>
    Array.from(line).reduce((width, char) => width + (/[\u2e80-\uffff]/.test(char) ? size : size * 0.62), 0)));
}
/** Generous estimate of the renderer's node box (the new node is pinned at its centre). */
function estimateNodeSize(spec: DiagramSpec, node: DiagramNode): PlacedSize {
  const size = resolveTheme(spec).fontSize;
  const lines = (value?: string) => (value ? value.split("\n").length : 0);
  const label = textWidth(node.label ?? "", size), detail = node.detail ? textWidth(node.detail, size - 2) : 0;
  const content = Math.max(label, detail);
  const contentHeight = (lines(node.label) || 1) * size * 1.4 + lines(node.detail) * (size - 2) * 1.4;
  switch (node.kind) {
    case "image": {
      const width = Math.min(node.width ?? 240, 10000), height = node.height ?? 160;
      return { width: Math.max(width, label + 24), height: height + size * 1.4 + 16 };
    }
    case "start": case "end": return { width: 32, height: 32 };
    case "fork": case "join": return spec.direction === "LR" ? { width: 12, height: 120 } : { width: 120, height: 12 };
    case "actor": return { width: Math.max(88, label + 24), height: 98 + contentHeight };
    case "decision": return { width: Math.max(160, content * 2 + 40), height: Math.max(84, contentHeight * 2 + 28) };
    default: return { width: Math.max(140, content + 64), height: Math.max(60, contentHeight + 40) };
  }
}
const boxOverlaps = (a: LayoutBox, b: LayoutBox) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const inflateBox = (box: LayoutBox, by: number): LayoutBox => ({ left: box.left - by, top: box.top - by, right: box.right + by, bottom: box.bottom + by });
const boxContains = (outer: LayoutBox, inner: LayoutBox) => inner.left >= outer.left - 1 && inner.top >= outer.top - 1 && inner.right <= outer.right + 1 && inner.bottom <= outer.bottom + 1;
const boxUnion = (a: LayoutBox, b: LayoutBox): LayoutBox => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) });
const boxArea = (box: LayoutBox) => (box.right - box.left) * (box.bottom - box.top);
/**
 * Pick a free spot for a cluster of new elements (relative offsets kept). Returns the centre of
 * each addition. Without a container the cluster goes just outside the content bounds (right of
 * top-down flows, below left-right flows), as close to the visible viewport as possible; inside a
 * container it takes the spot that grows the container least without touching anything else.
 */
function placeAdditions(spec: DiagramSpec, snapshot: LayoutSnapshot, additions: Addition[], containerKey?: string): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  const items = snapshot.items, bounds = snapshot.bounds;
  if (!additions.length || !items.length || !bounds) return result;
  let cluster: LayoutBox | undefined;
  for (const item of additions) {
    const box = { left: item.offset.x - item.size.width / 2, top: item.offset.y - item.size.height / 2, right: item.offset.x + item.size.width / 2, bottom: item.offset.y + item.size.height / 2 };
    cluster = cluster ? boxUnion(cluster, box) : box;
  }
  const width = cluster!.right - cluster!.left, height = cluster!.bottom - cluster!.top;
  const middle = { x: (cluster!.left + cluster!.right) / 2, y: (cluster!.top + cluster!.bottom) / 2 };
  const boxAt = (x: number, y: number): LayoutBox => ({ left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 });
  const view = snapshot.viewport && boxOverlaps(snapshot.viewport, bounds) ? snapshot.viewport : bounds;
  const focus = { x: (view.left + view.right) / 2, y: (view.top + view.bottom) / 2 };
  let best: { x: number; y: number; score: number } | undefined;
  const container = containerKey ? items.find((item) => item.key === containerKey) : undefined;
  if (container) {
    const frame = container.box;
    const members = items.filter((item) => item !== container && boxContains(frame, item.box));
    const others = items.filter((item) => item !== container && !members.includes(item) && !boxContains(item.box, frame));
    const centre = { x: (frame.left + frame.right) / 2, y: (frame.top + frame.bottom) / 2 };
    // Elements already overlapping the container are not held against the growth it needs.
    const outside = others.filter((item) => !boxOverlaps(frame, inflateBox(item.box, 16)));
    for (let ring = 0; ring < 6 && !best; ring++) {
      const reach = Math.max(width, height) / 2 + PLACE_GAP + ring * 160, step = 16 + ring * 8;
      for (let y = frame.top - reach; y <= frame.bottom + reach; y += step) for (let x = frame.left - reach; x <= frame.right + reach; x += step) {
        const box = boxAt(x, y);
        if (members.some((item) => boxOverlaps(inflateBox(box, PLACE_GAP / 2), item.box))) continue;
        if (others.some((item) => boxOverlaps(inflateBox(box, PLACE_GAP), item.box))) continue;
        const grown = boxUnion(frame, inflateBox(box, 28));
        if (outside.some((item) => boxOverlaps(grown, inflateBox(item.box, 16)))) continue;
        const score = boxArea(grown) - boxArea(frame) + Math.hypot(x - centre.x, y - centre.y) * 4;
        if (!best || score < best.score) best = { x, y, score };
      }
    }
  }
  if (!best) {
    const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));
    const preferBelow = spec.direction === "LR";
    const candidates = [
      { x: bounds.right + PLACE_GAP + width / 2, y: clamp(focus.y, bounds.top + height / 2, bounds.bottom - height / 2), preferred: !preferBelow },
      { x: clamp(focus.x, bounds.left + width / 2, bounds.right - width / 2), y: bounds.bottom + PLACE_GAP + height / 2, preferred: preferBelow },
    ];
    for (const candidate of candidates) {
      // Outside the content bounds nothing can collide; keep the check for exotic geometry anyway.
      let { x, y } = candidate;
      for (let guard = 0; guard < 200 && items.some((item) => boxOverlaps(inflateBox(boxAt(x, y), PLACE_GAP), item.box)); guard++)
        if (candidate.preferred !== preferBelow) x += 16; else y += 16;
      const score = Math.hypot(x - focus.x, y - focus.y) * (candidate.preferred ? 1 : 1.35);
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  for (const item of additions)
    result.set(item.key, { x: roundCoordinate(best!.x + item.offset.x - middle.x), y: roundCoordinate(best!.y + item.offset.y - middle.y) });
  return result;
}
/* 泳道：新节点必须归属一条泳道，并放在该泳道带内的空位（可沿流程方向延长泳道）。 */
function clusterOf(additions: Addition[]): { width: number; height: number; middle: { x: number; y: number } } {
  let cluster: LayoutBox | undefined;
  for (const item of additions) {
    const box = { left: item.offset.x - item.size.width / 2, top: item.offset.y - item.size.height / 2, right: item.offset.x + item.size.width / 2, bottom: item.offset.y + item.size.height / 2 };
    cluster = cluster ? boxUnion(cluster, box) : box;
  }
  return { width: cluster!.right - cluster!.left, height: cluster!.bottom - cluster!.top, middle: { x: (cluster!.left + cluster!.right) / 2, y: (cluster!.top + cluster!.bottom) / 2 } };
}
function laneItems(spec: DiagramSpec, snapshot?: LayoutSnapshot): LayoutItem[] {
  const ids = new Set((spec.lanes ?? []).map((lane) => lane.id));
  return (snapshot?.items ?? []).filter((item) => item.key.startsWith("lanes/") && ids.has(item.key.slice(6)));
}
/** The axis lanes are laid out across (x for top-down bands, y for left-right bands). */
function laneCrossAxis(spec: DiagramSpec, lanes: LayoutItem[]): "x" | "y" {
  if (lanes.length >= 2) {
    const xs = lanes.map((lane) => (lane.box.left + lane.box.right) / 2), ys = lanes.map((lane) => (lane.box.top + lane.box.bottom) / 2);
    return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? "x" : "y";
  }
  return (spec.direction ?? "TB") === "LR" ? "y" : "x";
}
const low = (box: LayoutBox, axis: "x" | "y") => (axis === "x" ? box.left : box.top);
const high = (box: LayoutBox, axis: "x" | "y") => (axis === "x" ? box.right : box.bottom);
/** Lane of the current selection: a selected lane, or the lane of a selected node. */
function selectedLane(spec: DiagramSpec): string | undefined {
  const lanes = new Set((spec.lanes ?? []).map((lane) => lane.id));
  for (const key of [...selectedKeys.value, ...marqueeKeys.value]) {
    const [field, raw] = key.split("/");
    const index = Number(raw);
    if (field === "lanes" && spec.lanes?.[index]) return spec.lanes[index]!.id;
    const lane = field === "nodes" ? spec.nodes?.[index]?.lane : undefined;
    if (lane && lanes.has(lane)) return lane;
  }
}
/** Selection first; else the band the free spot falls in (across the flow); else the nearest band. */
function pickLane(spec: DiagramSpec, snapshot: LayoutSnapshot | undefined, additions: Addition[]): string {
  const chosen = selectedLane(spec);
  if (chosen) return chosen;
  const lanes = laneItems(spec, snapshot);
  if (!snapshot || !lanes.length) return spec.lanes![0]!.id;
  const spot = placeAdditions(spec, snapshot, additions);
  const first = additions[0]!, point = spot.get(first.key);
  if (!point) return lanes[0]!.key.slice(6);
  const { middle } = clusterOf(additions);
  const axis = laneCrossAxis(spec, lanes), value = axis === "x" ? point.x - first.offset.x + middle.x : point.y - first.offset.y + middle.y;
  const distance = (lane: LayoutItem) => Math.max(0, low(lane.box, axis) - value, value - high(lane.box, axis));
  return [...lanes].sort((a, b) => distance(a) - distance(b))[0]!.key.slice(6);
}
/** Free spot inside the lane band: across the flow within the band, along the flow anywhere (the lane may grow). */
function placeInLane(spec: DiagramSpec, snapshot: LayoutSnapshot, additions: Addition[], lane: LayoutItem): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (!additions.length || !snapshot.bounds) return result;
  const cross = laneCrossAxis(spec, laneItems(spec, snapshot)), flow = cross === "x" ? "y" : "x";
  const { width, height, middle } = clusterOf(additions);
  const crossSize = cross === "x" ? width : height, flowSize = cross === "x" ? height : width;
  const band = lane.box;
  let crossMin = low(band, cross) + 24 + crossSize / 2, crossMax = high(band, cross) - 24 - crossSize / 2;
  if (crossMin > crossMax) crossMin = crossMax = (low(band, cross) + high(band, cross)) / 2;
  // Keep clear of the lane header at the start of the flow.
  const flowMin = low(band, flow) + 56 + flowSize / 2;
  const flowEnd = Math.max(high(band, flow), high(snapshot.bounds, flow));
  const flowMax = flowEnd + PLACE_GAP + flowSize / 2 + 480;
  const others = snapshot.items.filter((item) => !item.key.startsWith("lanes/"));
  const view = snapshot.viewport ?? snapshot.bounds;
  const focus = { x: (view.left + view.right) / 2, y: (view.top + view.bottom) / 2 };
  const at = (c: number, f: number) => (cross === "x" ? { x: c, y: f } : { x: f, y: c });
  let best: { x: number; y: number; score: number } | undefined;
  for (const gap of [PLACE_GAP, 40]) {
    for (let f = flowMin; f <= flowMax; f += 16) for (let c = crossMin; c <= crossMax + 0.01; c += Math.max(8, Math.min(16, crossMax - crossMin || 16))) {
      const point = at(c, f);
      const box = { left: point.x - width / 2, top: point.y - height / 2, right: point.x + width / 2, bottom: point.y + height / 2 };
      if (others.some((item) => boxOverlaps(inflateBox(box, gap), item.box))) continue;
      // Prefer spots inside the current band extent over lengthening the lane.
      const beyond = Math.max(0, f + flowSize / 2 - high(band, flow));
      const score = Math.hypot(point.x - focus.x, point.y - focus.y) + beyond * 2;
      if (!best || score < best.score) best = { ...point, score };
    }
    if (best) break;
  }
  const spot = best ?? { ...at((crossMin + crossMax) / 2, flowEnd + PLACE_GAP + flowSize / 2), score: 0 };
  for (const item of additions)
    result.set(item.key, { x: roundCoordinate(spot.x + item.offset.x - middle.x), y: roundCoordinate(spot.y + item.offset.y - middle.y) });
  return result;
}
/**
 * Keep the current layout while adding: every existing node without a `{cx, cy}` pin is frozen at
 * its rendered centre (legacy dx/dy or x/y are converted), then the additions are pinned on a free
 * spot. Containers are not pinned; the renderer fits them to their members.
 */
/** Keys frozen at their exact `{x, y}` origin during the current updateSpec change. */
const frozenOrigins: string[] = [];
function pinAdditions(spec: DiagramSpec, snapshot: LayoutSnapshot | undefined, additions: Addition[], containerKey?: string): void {
  // Diagrams with lanes: every new node gets a lane (group and lane are exclusive; a swimlane
  // node must have a lane, elsewhere an explicit group is kept).
  const laneNodes = (spec.lanes?.length ? additions : [])
    .map((item) => (item.key.startsWith("nodes/") ? spec.nodes?.find((node) => node.id === item.key.slice(6)) : undefined))
    .filter((node): node is DiagramNode => !!node && (spec.type === "swimlane" || !node.group));
  let lane: LayoutItem | undefined;
  if (laneNodes.length) {
    const laneId = pickLane(spec, snapshot, additions);
    for (const node of laneNodes) { node.lane = laneId; delete node.group; }
    lane = laneItems(spec, snapshot).find((item) => item.key === `lanes/${laneId}`);
  }
  if (!snapshot || !isNodeGraph(spec) || !snapshot.items.length) return;
  const adjustments = spec.layout?.adjustments ?? {};
  const elements = { ...adjustments.elements };
  const nodeIds = new Set((spec.nodes ?? []).map((node) => node.id));
  const added = new Set(additions.map((item) => item.key));
  for (const item of snapshot.items) {
    if (!item.key.startsWith("nodes/") || added.has(item.key) || !nodeIds.has(item.key.slice(6))) continue;
    const old = elements[item.key];
    if (old && "cx" in old) continue;
    // Unadjusted renders only allow an estimated centre; pin the exact top-left instead and
    // convert it to {cx, cy} from the next render's metadata (see updateSpec).
    if (!item.exact && item.origin) {
      elements[item.key] = { x: item.origin.x, y: item.origin.y };
      frozenOrigins.push(item.key);
    } else elements[item.key] = { cx: roundCoordinate(item.center.x), cy: roundCoordinate(item.center.y) };
  }
  // A pinned group keeps its centre and grows symmetrically, which would sweep over neighbours
  // once its (now frozen) members change. Groups with node members drop the pin and hug them.
  for (const group of spec.groups ?? [])
    if (isPinnedAdjustment(elements[`groups/${group.id}`]) && spec.nodes?.some((node) => node.group === group.id))
      delete elements[`groups/${group.id}`];
  for (const [key, point] of lane ? placeInLane(spec, snapshot, additions, lane) : placeAdditions(spec, snapshot, additions, containerKey))
    elements[key] = { cx: point.x, cy: point.y };
  spec.layout = { ...spec.layout, adjustments: { ...adjustments, elements } };
}
/** Geometry of the applied render, captured before an addition changes the spec. */
function currentLayout(): LayoutSnapshot | undefined {
  return isNodeGraph(applied.value) ? canvas.value?.layoutSnapshot() : undefined;
}
function onAddElement(payload: AddElementPayload): void {
  const snapshot = currentLayout();
  void updateSpec((spec) => {
    if (payload.element === "group") {
      const id = uniqueElementId(spec, "group");
      (spec.groups ??= []).push({
        id,
        label: payload.label || "新分组",
        kind: "boundary",
      });
      for (const key of payload.memberKeys) {
        const node = spec.nodes?.[Number(key.split("/")[1])];
        if (node) {
          node.group = id;
          delete node.lane;
        }
      }
      // An empty group gets a free spot of its own; otherwise it fits the (frozen) members.
      pinAdditions(spec, snapshot, payload.memberKeys.length ? [] : [{ key: `groups/${id}`, size: { width: 220, height: 140 }, offset: { x: 0, y: 0 } }]);
    } else if (payload.element === "lane") {
      const id = uniqueElementId(spec, "lane");
      (spec.lanes ??= []).push({ id, label: payload.label || "新泳道" });
      for (const key of payload.memberKeys) {
        const node = spec.nodes?.[Number(key.split("/")[1])];
        if (node) {
          node.lane = id;
          delete node.group;
        }
      }
      pinAdditions(spec, snapshot, []);
    } else if (payload.element === "category") {
      spec.fishbone ??= { effect: "待分析结果", categories: [] };
      spec.fishbone.categories.push({
        id: uniqueElementId(spec, "category"),
        label: payload.label || "新分类",
        causes: [{ label: "新原因" }],
      });
    } else if (payload.element.startsWith("participant:")) {
      (spec.participants ??= []).push({
        id: uniqueElementId(spec, "participant"),
        label: payload.label || "新参与者",
        kind: payload.element.slice(12) as Participant["kind"],
      });
    } else if (payload.element.startsWith("node:")) {
      const node: DiagramNode = {
        id: uniqueElementId(spec, "node"),
        label: payload.label || "新节点",
        kind: payload.element.slice(5) as DiagramNode["kind"],
        ...(payload.group ? { group: payload.group } : {}),
      };
      (spec.nodes ??= []).push(node);
      pinAdditions(spec, snapshot, [{ key: `nodes/${node.id}`, size: estimateNodeSize(spec, node), offset: { x: 0, y: 0 } }],
        payload.group ? `groups/${payload.group}` : undefined);
    }
  }).then(() => showNotice("已添加元素"));
}
/* ---------- 外部粘贴：图片 / UML JSON / Mermaid / 纯文本 ---------- */
const MAX_IMAGE_DATA_URL = 7_340_032; // 约 5MB 图片二进制
function isEditablePasteTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
    )
  );
}
function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取剪贴板图片失败。"));
    reader.readAsDataURL(blob);
  });
}
function probeImage(src: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(undefined);
    image.src = src;
  });
}
function makeImageNode(spec: DiagramSpec | undefined, src: string, size?: { width: number; height: number }): DiagramNode {
  let width = size?.width ?? 240;
  let height = size?.height ?? 160;
  const max = 480;
  if (width > max) {
    height = Math.max(8, Math.round((height * max) / width));
    width = max;
  }
  return {
    id: spec ? uniqueElementId(spec, "image") : "image_1",
    label: "图片",
    kind: "image",
    src,
    width,
    height,
  };
}
async function pasteImage(src: string): Promise<void> {
  if (!src.startsWith("data:image/"))
    throw new Error("剪贴板中的图片不是可内嵌的 data:image/ 数据。");
  if (src.length > MAX_IMAGE_DATA_URL)
    throw new Error("粘贴的图片超过约 5MB 上限，请先在图片工具中压缩后再粘贴。");
  const size = await probeImage(src);
  if (applied.value.nodes) {
    const snapshot = currentLayout();
    await updateSpec((spec) => {
      const node = makeImageNode(spec, src, size);
      spec.nodes!.push(node);
      pinAdditions(spec, snapshot, [{ key: `nodes/${node.id}`, size: estimateNodeSize(spec, node), offset: { x: 0, y: 0 } }]);
    });
    showNotice("已把剪贴板图片添加为图片节点");
  } else {
    await appendDiagram({
      version: 1,
      type: "flowchart",
      title: "粘贴的图片",
      nodes: [makeImageNode(undefined, src, size)],
      edges: [],
    });
    showNotice("当前图不支持节点，已新建流程图存放剪贴板图片");
  }
}
/** 从 text/html 剪贴板内容提取可内嵌图片：优先 <img data:…>，其次整段 <svg>。 */
function imageFromHtml(html: string): string | undefined {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const img = doc.querySelector("img");
  const src = img?.getAttribute("src") ?? "";
  if (src.startsWith("data:image/")) return src;
  const svg = doc.querySelector("svg");
  if (!svg) return undefined;
  if (!svg.hasAttribute("xmlns"))
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
}
async function pasteText(raw: string): Promise<void> {
  const text = raw.trim();
  if (!text) return;
  if (text.startsWith("{") || text.startsWith("[")) {
    let candidate: DiagramDocument;
    try {
      candidate = validateDocument(normalizeDocument(JSON.parse(text)));
    } catch (reason) {
      reportError(
        new Error(
          `剪贴板里的 JSON 不是有效的 UML 图表：${reason instanceof Error ? reason.message : reason}`,
        ),
      );
      return;
    }
    for (const spec of candidate.diagrams)
      await appendDiagram(structuredClone(spec));
    showNotice(`已把剪贴板 JSON 导入为 ${candidate.diagrams.length} 张图表`);
    return;
  }
  if (isMermaidSource(text)) {
    await importMermaid(text, "剪贴板");
    return;
  }
  const label = text.replace(/\s+/g, " ").trim();
  const truncated = label.length > 60 ? `${label.slice(0, 60)}…` : label;
  if (applied.value.nodes) {
    const snapshot = currentLayout();
    await updateSpec((spec) => {
      const node: DiagramNode = {
        id: uniqueElementId(spec, "note"),
        label: truncated,
        kind: "note",
        detail: text,
      };
      spec.nodes!.push(node);
      pinAdditions(spec, snapshot, [{ key: `nodes/${node.id}`, size: estimateNodeSize(spec, node), offset: { x: 0, y: 0 } }]);
    });
    showNotice("已把剪贴板文本添加为注释节点");
  } else {
    await appendDiagram({
      version: 1,
      type: "flowchart",
      title: truncated || "粘贴的文本",
      nodes: [
        { id: "note_1", label: truncated || "文本", kind: "note", detail: text },
      ],
      edges: [],
    });
    showNotice("当前图不支持节点，已新建流程图存放剪贴板文本");
  }
}
async function onPaste(event: ClipboardEvent): Promise<void> {
  if (isEditablePasteTarget(event.target)) return;
  const data = event.clipboardData;
  if (!data) return;
  const imageItem = [...data.items].find(
    (item) => item.kind === "file" && /^image\//i.test(item.type),
  );
  const file = imageItem?.getAsFile();
  const htmlImage = file ? undefined : imageFromHtml(data.getData("text/html") ?? "");
  const text = file || htmlImage ? "" : data.getData("text/plain");
  if (!file && !htmlImage && !text.trim()) return;
  event.preventDefault();
  try {
    if (file) await pasteImage(await readBlobAsDataUrl(file));
    else if (htmlImage) await pasteImage(htmlImage);
    else await pasteText(text);
  } catch (reason) {
    reportError(reason);
  }
}
/* ---------- 溢出菜单 / 画布右键菜单 ---------- */
function newDiagramEntries(): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const family of families) {
    entries.push({ type: "heading", label: family.label });
    for (const type of family.types)
      entries.push({ label: labels[type], action: () => addExample(type) });
  }
  return entries;
}
function buildMenu(canvas: boolean): MenuEntry[] {
  const entries: MenuEntry[] = [
    { label: "新建图表", children: newDiagramEntries() },
    { label: "添加元素…", action: () => void (addDialogOpen.value = true) },
  ];
  if (canvas)
    entries.push({
      label: "删除所选",
      hint: selectedKeys.value.length ? `${selectedKeys.value.length} 项` : "",
      danger: true,
      disabled: !selectedKeys.value.length,
      action: () => onRequestDelete(selectedKeys.value),
    });
  entries.push(
    { type: "separator" },
    {
      label: "导入 JSON / HTML / Mermaid…",
      action: () => importInput.value?.click(),
    },
    { label: "下载文档 JSON", action: downloadDocumentJson },
  );
  if (localSaveSupported)
    entries.push(
      { type: "separator" },
      {
        label: localTargetName.value ? "另选本地文件…" : "授权本地保存…",
        disabled: savingHtml.value,
        action: () => saveLocalHtml(!localTargetName.value),
      },
      ...(directoryPickerSupported
        ? [
            {
              label: defaultDirectoryName.value
                ? `默认目录：${defaultDirectoryName.value}`
                : "设置默认保存目录…",
              action: setDefaultDirectory,
            } satisfies MenuEntry,
            ...(defaultDirectoryName.value
              ? [
                  {
                    label: "清除默认保存目录",
                    action: clearDefaultDirectory,
                  } satisfies MenuEntry,
                ]
              : []),
          ]
        : []),
    );
  entries.push(
    { type: "separator" },
    { label: "调整样式…", action: () => void (styleDialogOpen.value = true) },
    { label: "完整编辑（表单 / JSON）…", action: () => void toggleEditor() },
  );
  return entries;
}
function openHeaderMenu(event: MouseEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  menuState.value = { x: rect.left, y: rect.bottom + 6, canvas: false };
}
function openCanvasMenu(event: MouseEvent): void {
  event.preventDefault();
  menuState.value = { x: event.clientX, y: event.clientY, canvas: true };
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
/** Validate every draft before committing, so a failed save never drops editing work. */
async function applyDraftsForSave(): Promise<void> {
  await ready;
  const formChanged = !!formEditor.value?.hasChanges();
  const dirtySources = collection.value.diagrams.map((spec, index) => sourceDrafts.value[index] !== json(spec));
  if (documentDirty.value && (formChanged || dirtySources.some(Boolean)))
    throw new Error("整个文档 JSON 与图表草稿同时有修改。请先应用要保留的版本，再保存 HTML；所有草稿仍保留。");
  if (formChanged && dirtySources[activeIndex.value])
    throw new Error("当前表单与图表 JSON 都有修改。请先应用要保留的版本，再保存 HTML；两份草稿仍保留。");
  if (!documentDirty.value && !formChanged && !dirtySources.some(Boolean)) return;
  const index = activeIndex.value;
  const sourceSnapshot = sourceDrafts.value.slice();
  const documentSnapshot = documentDraft.value;
  const formSnapshot = formEditor.value ? json(formEditor.value.getDraft()) : undefined;
  const next = structuredClone(validateDocument(documentDirty.value
    ? normalizeDocument(JSON.parse(documentSnapshot))
    : { ...getDocument(), diagrams: collection.value.diagrams.map((spec, position) =>
      position === index && formChanged && formSnapshot !== undefined ? validateSpec(JSON.parse(formSnapshot))
        : dirtySources[position] ? validateSpec(JSON.parse(sourceSnapshot[position]!)) : spec) }));
  const nextIndex = Math.min(index, next.diagrams.length - 1);
  const ticket = ++revision;
  if (!(await renderCandidate(next.diagrams[nextIndex]!, ticket)))
    throw new Error("保存期间图表发生变化，请再次保存。");
  if (activeIndex.value !== index || documentDraft.value !== documentSnapshot ||
      sourceDrafts.value.length !== sourceSnapshot.length ||
      sourceDrafts.value.some((value, position) => value !== sourceSnapshot[position]) ||
      (formEditor.value ? json(formEditor.value.getDraft()) : undefined) !== formSnapshot) {
    await canvas.value?.setSpec(getSpec());
    throw new Error("保存期间草稿发生变化，请再次保存；最新草稿仍保留。");
  }
  collection.value = next;
  activeIndex.value = nextIndex;
  sourceDrafts.value = next.diagrams.map(json);
  documentDraft.value = json(next);
  await nextTick();
  formEditor.value?.resetDraft();
}
async function htmlSnapshot(): Promise<{ html: string; snapshot: string; count: number }> {
  await applyDraftsForSave();
  const document = getDocument();
  return { html: createHtml(document, runtime.value), snapshot: json(document), count: document.diagrams.length };
}
async function saveHtmlAsync(): Promise<string> {
  return (await htmlSnapshot()).html;
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
async function downloadHtml(): Promise<void> {
  if (savingHtml.value) return;
  savingHtml.value = true;
  try {
    const { html, snapshot, count } = await htmlSnapshot();
    downloadBlob(
      new Blob([html], {
        type: "text/html;charset=utf-8",
      }),
      filename("html", true),
    );
    savedSnapshot.value = snapshot;
    error.value = "";
    showNotice(
      `已下载 HTML，包含全部 ${count} 张图表及编辑结果`,
    );
  } catch (reason) {
    reportError(reason);
  } finally {
    savingHtml.value = false;
  }
}
async function saveToLocal(selectNew = false): Promise<void> {
  if (savingHtml.value) throw new Error("正在保存 HTML，请稍候。");
  savingHtml.value = true;
  try {
    // Start the picker in the original user gesture, before draft rendering.
    const targetPromise = chooseLocalHtmlTarget(
      pageFileName() ?? filename("html", true),
      selectNew ? undefined : localTarget,
      defaultDirectory ?? lastLocalTarget,
    );
    const target = await targetPromise;
    localTarget = target;
    lastLocalTarget = target;
    localTargetName.value = target.name;
    void storeHandle(pageHandleKey(), target);
    void storeHandle("last-file", target);
    const { html, snapshot } = await htmlSnapshot();
    await writeLocalHtml(target, html);
    savedSnapshot.value = snapshot;
    error.value = "";
    showNotice(`已同步到本地文件 ${target.name}`);
  } finally {
    savingHtml.value = false;
  }
}
function setDefaultDirectory(): void {
  void chooseDefaultDirectory(defaultDirectory ?? lastLocalTarget)
    .then(async (directory) => {
      defaultDirectory = directory;
      defaultDirectoryName.value = directory.name;
      await storeHandle("default-directory", directory);
      showNotice(`默认保存目录已设为 ${directory.name}，下次选择文件时从该目录打开`);
    })
    .catch((reason) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      reportError(reason);
    });
}
function clearDefaultDirectory(): void {
  defaultDirectory = undefined;
  defaultDirectoryName.value = "";
  void storeHandle("default-directory", undefined);
  showNotice("已清除默认保存目录");
}
async function importMermaid(text: string, source = "Mermaid"): Promise<void> {
  const { document, warnings } = mermaidToDocument(text);
  for (const spec of document.diagrams) await appendDiagram(spec);
  showNotice(
    `已从 ${source} 新增 ${document.diagrams.length} 张图表${warnings.length ? `；${warnings.length} 条语句未识别：${warnings.slice(0, 2).join("；")}` : ""}`,
  );
}
function addMermaid(): void {
  const text = mermaidSource.value;
  if (!text.trim()) return;
  void importMermaid(text)
    .then(() => { mermaidSource.value = ""; })
    .catch(reportError);
}
/** JSON first; Mermaid text pasted into the source editor is converted in place. */
function parseSource(source: string, scope: "diagram" | "document"): unknown {
  try {
    return JSON.parse(source);
  } catch (reason) {
    if (!isMermaidSource(source)) throw reason;
    const { document, warnings } = mermaidToDocument(source);
    if (warnings.length) showNotice(`Mermaid 已转换；${warnings.length} 条语句未识别：${warnings.slice(0, 2).join("；")}`);
    if (scope === "document") return document;
    const current = applied.value;
    return { ...document.diagrams[0]!, id: current.id, ...(current.theme ? { theme: current.theme } : {}) };
  }
}
function saveLocalHtml(selectNew = false): void {
  void saveToLocal(selectNew).catch((reason) => {
    if (reason instanceof DOMException && reason.name === "AbortError") {
      showNotice("已取消本地保存，修改仍保留在工作台");
      return;
    }
    reportError(reason);
  });
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
    if (!source.trimStart().startsWith("<") && isMermaidSource(source)) {
      await importMermaid(source, file.name);
      return;
    }
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
  window.addEventListener("paste", onPaste);
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
  clearTimeout(updateSpecTimer);
  window.removeEventListener("beforeunload", beforeUnload);
  window.removeEventListener("paste", onPaste);
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
  saveHtmlAsync,
  saveToLocal,
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
        ><span class="brand-mark" aria-hidden="true"
          ><svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            ><rect x="3.5" y="3.5" width="7" height="7" rx="1.8" /><rect
              x="13.5"
              y="13.5"
              width="7"
              height="7"
              rx="1.8"
            /><path d="M10.5 7h4.2a2.8 2.8 0 0 1 2.8 2.8v3.7" /><path
              d="M13.5 17h-4.2a2.8 2.8 0 0 1-2.8-2.8v-3.7"
            /></svg></span
        ><span
          >UML<span class="brand-light"> STUDIO</span
          ><small>把复杂，画清楚。</small></span
        ></a
      >
      <div class="header-center">
        <span class="header-doc-name" :title="collection.title">{{
          collection.title
        }}</span>
        <span v-if="anySourceDirty || formDirty" class="draft-indicator" role="status"
          >有未应用{{ formDirty ? "表单" : "JSON" }}草稿</span
        >
        <span v-else-if="pendingSave" class="save-state" role="status"
          >待保存 HTML</span
        >
      </div>
      <div class="header-actions">
        <button
          class="button button-quiet mobile-menu-button"
          type="button"
          :aria-expanded="sidebarOpen"
          @click="
            sidebarOpen = !sidebarOpen;
            if (sidebarOpen) sidebarTab = 'diagrams';
          "
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
          图表列表
        </button>
        <button
          class="button button-dark"
          type="button"
          :disabled="!runtime || loading || savingHtml"
          :title="runtimeError || '保存全部图表为可离线编辑的单个 HTML 文件'"
          @click="downloadHtml"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          保存 HTML<span class="hide-small">
            · 全部 {{ collection.diagrams.length }} 张</span
          >
        </button>
        <button
          class="button button-outline local-save-button"
          type="button"
          :disabled="!runtime || loading || savingHtml || !localSaveSupported"
          :title="
            !localSaveSupported
              ? '当前浏览器不支持本地写入，请用保存 HTML 下载'
              : localTargetName
                ? `同步至 ${localTargetName}`
                : '选择本地 HTML 文件并授权保存；后续点击同步修改'
          "
          @click="saveLocalHtml()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0V5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2M12 12v6m-3-3 3 3 3-3" /></svg>
          {{
            savingHtml
              ? "正在保存…"
              : localTargetName
                ? "同步到本地"
                : "授权本地保存"
          }}
        </button>
        <button
          class="button button-outline menu-trigger"
          type="button"
          aria-label="更多操作"
          title="更多操作"
          :aria-expanded="!!menuState && !menuState.canvas"
          @click="openHeaderMenu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5.5h.01M12 12h.01M12 18.5h.01" stroke-width="3"/></svg>
        </button>
      </div>
      <input
        ref="importInput"
        class="visually-hidden"
        type="file"
        accept=".json,.html,.htm,.mmd,.mermaid,.md,.markdown,application/json,text/html,text/markdown"
        aria-label="导入单图或多图 JSON / HTML，或 Mermaid / Markdown"
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
        <button class="button button-quiet mobile-menu-button sidebar-close" type="button" @click="sidebarOpen = false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18 18 6M6 6l12 12" /></svg>关闭图表列表</button>
        <div class="sidebar-tabs" role="tablist" aria-label="侧栏面板">
          <button
            type="button"
            role="tab"
            :aria-selected="sidebarTab === 'theme'"
            @click="sidebarTab = 'theme'"
          >
            主题</button
          ><button
            type="button"
            role="tab"
            :aria-selected="sidebarTab === 'diagrams'"
            @click="sidebarTab = 'diagrams'"
          >
            图表<span class="tab-count">{{ collection.diagrams.length }}</span>
          </button>
        </div>
        <div v-show="sidebarTab === 'diagrams'" class="sidebar-section">
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
          <div class="diagram-search">
            <svg
              class="diagram-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              v-model="diagramFilter"
              type="search"
              role="searchbox"
              class="text-input diagram-filter"
              placeholder="搜索标题或图型"
              aria-label="过滤图表列表"
            />
          </div>
          <nav class="diagram-list" aria-label="选择要编辑的图表">
            <div
              v-for="{ spec, index } in filteredDiagrams"
              :key="spec.id ?? index"
              class="diagram-item"
              :class="{ selected: activeIndex === index }"
            >
              <button
                type="button"
                class="diagram-select"
                :aria-current="activeIndex === index ? 'true' : undefined"
                @click="selectFromList(index)"
              >
                <span class="diagram-list-index">{{
                  String(index + 1).padStart(2, "0")
                }}</span
                ><span class="diagram-item-text"
                  ><strong>{{ spec.title }}</strong
                  ><small
                    >{{ labels[spec.type] }} ·
                    {{ themeLabels[spec.theme ?? "modern"]
                    }}<b v-if="sourceDrafts[index] !== json(spec)">
                      JSON 草稿</b
                    ></small
                  ></span
                >
              </button>
              <span class="diagram-item-actions">
                <button
                  type="button"
                  title="复制这张图（保留原图）"
                  aria-label="复制图表"
                  :disabled="loading"
                  @click.stop="appendDiagram(spec, true)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path
                      d="M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  class="danger"
                  title="移除这张图"
                  aria-label="删除图表"
                  :disabled="loading || collection.diagrams.length < 2"
                  @click.stop="removeDiagramAt(index)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18" />
                    <path
                      d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"
                    />
                    <path
                      d="M19 6l-.8 12.4a2 2 0 0 1-2 1.6H7.8a2 2 0 0 1-2-1.6L5 6"
                    />
                    <path d="M10 11v5M14 11v5" />
                  </svg>
                </button>
              </span>
            </div>
            <p v-if="!filteredDiagrams.length" class="diagram-list-empty">
              没有匹配的图表。
            </p>
          </nav>
          <div class="collection-actions">
            <button
              class="button button-outline"
              type="button"
              :disabled="loading"
              title="复制当前已应用数据，保留原图"
              @click="appendDiagram(applied, true)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path
                  d="M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5"
                />
              </svg>
              复制当前图</button
            ><button
              class="button button-outline danger-button"
              type="button"
              :disabled="loading || collection.diagrams.length < 2"
              title="至少保留一张图表"
              @click="removeDiagram"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path
                  d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"
                />
                <path
                  d="M19 6l-.8 12.4a2 2 0 0 1-2 1.6H7.8a2 2 0 0 1-2-1.6L5 6"
                />
                <path d="M10 11v5M14 11v5" />
              </svg>
              移除
            </button>
          </div>
          <label class="field-label" for="diagram-type"
            >从示例新增（不会替换现有图表）</label
          >
          <div class="add-diagram-row">
            <span class="select-wrap"><VSelect
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
              </optgroup></VSelect
            ><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span
            ><button
              class="button button-accent"
              type="button"
              :disabled="loading"
              @click="addExample(addType)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              新增
            </button>
          </div>
          <details class="quick-presets-disclosure mermaid-import"><summary><svg class="summary-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>粘贴 Mermaid 新增</summary><div class="mermaid-import-body">
            <textarea v-model="mermaidSource" class="mermaid-import-input" rows="6" spellcheck="false" placeholder="flowchart / sequenceDiagram / stateDiagram / classDiagram，或含多个 mermaid 代码块的 Markdown"></textarea>
            <button class="button button-accent" type="button" :disabled="loading || !mermaidSource.trim()" @click="addMermaid">转换并新增</button>
          </div></details>
        </div>

        <div v-show="sidebarTab === 'theme'" class="sidebar-section sidebar-theme">
          <div class="section-heading">
            <h2>主题</h2>
            <button
              class="button button-quiet theme-more"
              type="button"
              title="打开完整样式面板"
              @click="styleDialogOpen = true"
            >调整样式…</button>
          </div>
          <div class="theme-grid sidebar-theme-grid" aria-label="主题预设">
            <button
              v-for="name in themeNames"
              :key="name"
              type="button"
              class="theme-option"
              :class="{ selected: (applied.theme ?? 'modern') === name }"
              :aria-pressed="(applied.theme ?? 'modern') === name"
              :title="themeLabels[name]"
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
          <p class="export-tip">主题只影响当前图；配色、字体与布局在“调整样式”中设置。</p>
        </div>

        <div class="sidebar-footnote">
          <span class="live-indicator"></span>数据只留在你的浏览器中
        </div>
      </aside>

      <main class="studio-main">
        <div v-if="error" class="error-banner" role="alert">
          <svg
            class="error-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5" />
            <path d="M12 16.5h.01" />
          </svg>
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="canvas-region" @contextmenu="openCanvasMenu">
          <div class="canvas-title-chip">
            <strong :title="applied.title">{{ applied.title }}</strong>
            <span class="type-badge"
              >{{ activeIndex + 1 }} / {{ collection.diagrams.length }} ·
              {{ labels[applied.type] }}</span
            ><span class="chip-meta">{{ itemCount }}</span>
          </div>
          <DiagramCanvas
            ref="canvas"
            :spec="initialSpec"
            :runtime="runtime"
            :position-editing="true"
            :element-selection="true"
            :interaction-mode="interactionMode"
            :selected-keys="selectedKeys"
            :marquee-keys="marqueeKeys"
            @adjust-element="adjustElement"
            @adjust-waypoints="adjustWaypoints"
            @select-element="onSelectElement"
            @selection-change="onSelectionChange"
            @request-delete="onRequestDelete"
            @connect-nodes="onConnectNodes"
            @loading="loading = $event"
            @error="reportError"
          />
          <div class="canvas-float-tools" role="toolbar" aria-label="画布工具">
            <div class="float-group">
              <button
                class="float-button"
                type="button"
                :aria-pressed="interactionMode === 'select'"
                title="选择模式：点击选中元素，拖动调整位置，空白处长按拖动框选"
                @click="interactionMode = 'select'"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 4.5 6.8 15.2 2-6.4 6.4-2L4.5 4.5Z"/></svg>
                选择
              </button>
              <button
                class="float-button"
                type="button"
                :aria-pressed="interactionMode === 'connect'"
                title="连线模式：依次点击两个节点创建连线，Esc 退出"
                @click="interactionMode = 'connect'"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="5" r="2.2"/></svg>
                连线
              </button>
            </div>
            <span class="float-divider"></span>
            <div class="float-group">
              <button
                class="float-button"
                type="button"
                title="添加元素（节点 / 容器 / 参与者 / 分类）"
                :disabled="loading"
                @click="addDialogOpen = true"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                添加
              </button>
              <button
                class="float-button danger"
                type="button"
                title="删除所选元素（Delete）"
                :disabled="loading || !selectedKeys.length"
                @click="onRequestDelete(selectedKeys)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="M19 6l-.8 12.4a2 2 0 0 1-2 1.6H7.8a2 2 0 0 1-2-1.6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
                删除{{ selectedKeys.length > 1 ? ` ${selectedKeys.length} 项` : "" }}
              </button>
              <button
                class="float-button"
                type="button"
                title="清空全部位置调整，恢复自动布局"
                :disabled="loading || !adjustmentCount"
                @click="clearAdjustments"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"/></svg>
                复位
              </button>
            </div>
          </div>
          <div class="canvas-float-export" role="toolbar" aria-label="导出当前图">
            <span class="export-format"><span class="select-wrap"><VSelect
              v-model="format"
              class="select-input"
              aria-label="导出文件格式"
            >
              <option value="svg">SVG</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></span>
            <span class="export-scale"><span class="select-wrap"><VSelect
              v-model.number="scale"
              class="select-input"
              aria-label="导出倍率"
            >
              <option :value="1">1×</option>
              <option :value="2">2×</option>
              <option :value="3">3×</option>
              <option :value="4">4×</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></span>
            <button
              class="float-button"
              type="button"
              :disabled="loading || exporting"
              title="导出当前图为图片文件"
              @click="downloadImage"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/></svg>
              {{ exporting ? "导出中…" : "导出图片" }}
            </button>
            <button
              class="float-button"
              type="button"
              :disabled="loading || copyingImage"
              title="复制当前图 PNG 到剪贴板"
              @click="copyImage"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2.5" width="8" height="4" rx="1" /><path d="M16 4.5h2.5A1.5 1.5 0 0 1 20 6v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V6a1.5 1.5 0 0 1 1.5-1.5H8" /></svg>
              {{ copyingImage ? "复制中…" : "复制 PNG" }}
            </button>
          </div>
          <div v-if="adjustmentCount" class="canvas-adjust-chip">
            <span title="元素以中心点绝对坐标 {cx, cy} 固定；连线途经点为绝对坐标">已记录 {{ adjustmentCount }} 项位置调整</span>
            <button class="text-button" type="button" :aria-expanded="adjustmentsOpen" @click="adjustmentsOpen = !adjustmentsOpen">{{ adjustmentsOpen ? "收起" : "参数" }}</button>
            <button class="text-button" type="button" :disabled="loading || savingHtml" @click="clearAdjustments">清空</button>
            <div v-if="adjustmentsOpen" class="adjust-pop">
              <p class="adjustment-hint">elements：元素中心点绝对坐标 {cx, cy}（已固定）；edges：连线途经点。</p>
              <pre class="adjustment-json" tabindex="0" aria-label="当前图表位置调整参数（元素中心点坐标与连线途经点）">{{ adjustmentsJson }}</pre>
            </div>
          </div>
          <label
            v-if="format === 'jpeg' || format === 'webp'"
            class="canvas-quality range-control"
            ><span
              >质量<output>{{ Math.round(quality * 100) }}%</output></span
            ><input
              v-model.number="quality"
              type="range"
              min="0.1"
              max="1"
              step="0.01"
          /></label>
        </div>
        <footer class="workspace-footer">
          <span>修改保留在当前页面，保存 HTML 后可继续离线编辑。</span
          ><span
            v-if="runtimeError"
            class="runtime-warning"
            :title="runtimeError"
            >独立 HTML 运行时尚未就绪</span
          ><span v-else
            >{{ themeNames.length }} 套主题 · 多图离线文档 · 右键画布可打开菜单</span
          >
        </footer>
      </main>

      <aside class="studio-inspector" aria-label="元素检查器">
        <ElementInspector
          :spec="applied"
          :selected-keys="selectedKeys"
          :loading="loading"
          :on-update="updateSpec"
          :on-update-debounced="updateSpecDebounced"
          @full-edit="toggleEditor"
          @delete="onRequestDelete"
        />
      </aside>
    </div>

    <Teleport to="body">
      <div v-if="editorOpen" class="editor-scrim" @pointerdown.self="editorOpen = false">
        <section
          id="diagram-editor"
          class="data-panel editor-drawer"
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
            <button class="icon-button drawer-close" type="button" aria-label="收起编辑器" @click="editorOpen = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18 18 6M6 6l12 12"/></svg>
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></svg>格式化
              </button>
            </div>
            <label class="source-scope"
              >编辑范围<span class="select-wrap"><VSelect v-model="sourceScope" class="select-input">
                <option value="diagram">当前图表 · 单图 JSON</option>
                <option value="document">整个文档 · 全部图表 JSON</option>
              </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></label
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
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <span>{{
                  loading
                    ? "正在绘制…"
                    : sourceScope === "document"
                      ? "应用整个文档"
                      : "应用当前图表"
                }}</span><kbd>Ctrl / Cmd + Enter</kbd>
              </button>
              <div>
                <button class="text-button" type="button" @click="copyJson">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5" /></svg>复制草稿</button
                ><span>·</span
                ><button
                  class="text-button"
                  type="button"
                  @click="downloadJson"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>下载草稿</button
                ><span>·</span
                ><button
                  class="text-button"
                  type="button"
                  :disabled="loading"
                  @click="resetSource"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>恢复已应用
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
    </Teleport>

    <StyleDialog
      :open="styleDialogOpen"
      :spec="applied"
      :loading="loading"
      :on-update="updateSpec"
      @close="styleDialogOpen = false"
    />
    <AddElementDialog
      :open="addDialogOpen"
      :spec="applied"
      :marquee-keys="marqueeKeys"
      @close="addDialogOpen = false"
      @submit="onAddElement"
    />
    <ContextMenu
      v-if="menuState"
      :x="menuState.x"
      :y="menuState.y"
      :entries="buildMenu(menuState.canvas)"
      @close="menuState = undefined"
    />
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
  --uml-edit-ink: var(--ink);
  --uml-edit-muted: var(--muted);
  --uml-edit-line: var(--line);
  --uml-edit-accent: var(--accent);
  --uml-edit-soft: var(--accent-soft);
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
  align-content: start;
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
  background: var(--paper);
  border-bottom: 1px solid var(--uml-edit-line);
}
.uml-editor-search {
  position: relative;
  display: block;
}
.uml-form-editor .uml-editor-tools .uml-editor-search input[type="search"] {
  padding-left: 31px;
}
.uml-editor-selected {
  border-radius: var(--r-sm);
  outline: 2px solid var(--uml-edit-accent);
  outline-offset: 3px;
  box-shadow: 0 0 0 7px var(--ring);
}
.uml-form-editor h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.uml-form-editor label,
.uml-color-input > label {
  display: grid;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  font-weight: 550;
  color: var(--uml-edit-muted);
}
.uml-form-editor input:not([type="checkbox"]):not([type="color"]),
.uml-form-editor select,
.uml-form-editor textarea,
.uml-color-input input[type="text"],
.uml-cause-editor input[type="text"] {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  border: 1px solid var(--uml-edit-line);
  border-radius: var(--r-sm);
  background: var(--paper);
  color: var(--uml-edit-ink);
  padding: 7px 10px;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  transition: border-color var(--t) var(--ease), box-shadow var(--t) var(--ease);
}
.uml-form-editor textarea {
  resize: vertical;
}
.uml-form-editor ::placeholder,
.uml-color-input ::placeholder,
.uml-cause-editor ::placeholder {
  color: var(--faint);
  opacity: 1;
}
.uml-form-editor :is(input, select, textarea):hover:not(:focus),
.uml-color-input input[type="text"]:hover:not(:focus),
.uml-cause-editor input[type="text"]:hover:not(:focus) {
  border-color: var(--line-strong);
}
.uml-form-editor :is(input, select, textarea):focus,
.uml-color-input input[type="text"]:focus,
.uml-cause-editor input[type="text"]:focus {
  outline: none;
  border-color: var(--uml-edit-accent);
  box-shadow: 0 0 0 4px var(--ring);
}
.uml-form-editor :is(input, select, textarea):disabled,
.uml-color-input input:disabled,
.uml-cause-editor input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.uml-form-editor button,
.uml-color-input button,
.uml-cause-editor button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  padding: 6px 12px;
  border: 1px solid var(--uml-edit-line);
  border-radius: var(--r-sm);
  background: var(--paper);
  color: var(--uml-edit-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 550;
  line-height: 1.4;
  cursor: pointer;
  transition: background-color var(--t) var(--ease),
    border-color var(--t) var(--ease), box-shadow var(--t) var(--ease),
    transform var(--t) var(--ease);
}
.uml-form-editor button > svg,
.uml-cause-editor button > svg,
.uml-color-input button > svg {
  width: 13px;
  height: 13px;
  flex: none;
}
.uml-form-editor button:hover:not(:disabled),
.uml-color-input button:hover:not(:disabled),
.uml-cause-editor button:hover:not(:disabled) {
  border-color: var(--line-strong);
  background-color: var(--paper-2);
}
.uml-form-editor button:disabled,
.uml-color-input button:disabled,
.uml-cause-editor button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.uml-form-editor :is(button, input, select, textarea, summary):focus-visible,
.uml-color-input :is(button, input):focus-visible,
.uml-cause-editor :is(button, input):focus-visible {
  outline: 2px solid var(--uml-edit-accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--ring);
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
  padding: 3px 8px;
  border: 1px solid var(--accent-line);
  border-radius: var(--r-pill);
  color: var(--accent-deep);
  background: var(--accent-soft);
  font-size: 12px;
  font-weight: 500;
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
  border-radius: var(--r-md);
  background: var(--paper);
}
.uml-editor-card > summary,
.uml-editor-subsection > summary,
.uml-cause-editor > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.uml-editor-card > summary::after,
.uml-editor-subsection > summary::after,
.uml-cause-editor > summary::after {
  content: "";
  flex: none;
  width: 8px;
  height: 8px;
  margin-inline-start: auto;
  border-right: 1.7px solid currentColor;
  border-bottom: 1.7px solid currentColor;
  border-bottom-right-radius: 2px;
  opacity: 0.5;
  transform: rotate(-45deg);
  transition: transform var(--t) var(--ease);
}
.uml-editor-card[open] > summary::after,
.uml-editor-subsection[open] > summary::after,
.uml-cause-editor[open] > summary::after {
  transform: rotate(45deg);
}
.uml-editor-card > summary,
.uml-editor-subsection > summary {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
}
.uml-editor-card > summary {
  background: var(--paper-2);
  border-radius: calc(var(--r-md) - 1px);
}
.uml-editor-card[open] > summary {
  border-bottom: 1px solid var(--uml-edit-line);
  border-radius: calc(var(--r-md) - 1px) calc(var(--r-md) - 1px) 0 0;
}
.uml-form-editor code {
  font: 11px/1.5 ui-monospace, Consolas, monospace;
  color: var(--uml-edit-muted);
  background: var(--paper-2);
  padding: 1px 5px;
  border-radius: 4px;
  overflow-wrap: anywhere;
}
.uml-editor-card summary code {
  display: inline-block;
  margin-inline-start: 4px;
  background: var(--paper);
}
.uml-edge-arrow {
  width: 13px;
  height: 13px;
  margin: 0 2px;
  vertical-align: -0.16em;
  color: var(--uml-edit-muted);
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
  font-size: 13px;
  color: var(--uml-edit-ink);
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
  border: 1px solid var(--uml-edit-line);
  border-radius: var(--r-sm);
}
.uml-editor-subsection[open] {
  padding: 0 9px 10px;
}
.uml-editor-subsection[open] > :not(summary) {
  margin-top: 10px;
}
.uml-editor-subsection > summary {
  padding: 8px 10px;
}
.uml-form-editor button.uml-editor-danger,
.uml-cause-editor button.uml-editor-danger {
  color: var(--danger);
  border-color: var(--danger-line);
}
.uml-form-editor button.uml-editor-danger:hover:not(:disabled),
.uml-cause-editor button.uml-editor-danger:hover:not(:disabled) {
  border-color: var(--danger);
  background: var(--danger-soft);
}
.uml-editor-actions {
  display: grid;
  gap: 8px;
  padding: 0 0 12px;
  border-bottom: 1px solid var(--uml-edit-line);
  background: var(--paper);
}
.uml-editor-actions > .uml-editor-heading {
  justify-content: flex-end;
}
.uml-form-editor button.uml-editor-apply {
  padding-inline: 20px;
  border: 0;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}
.uml-form-editor button.uml-editor-apply:hover:not(:disabled) {
  background: var(--accent-deep);
  color: #fff;
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.uml-form-editor button.uml-editor-apply:active:not(:disabled) {
  transform: translateY(0);
}
.uml-form-editor button.uml-editor-apply:disabled {
  background: color-mix(in srgb, var(--accent), var(--paper) 55%);
  box-shadow: none;
  opacity: 1;
}
.uml-editor-error {
  margin: 0 0 9px;
  color: var(--danger);
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
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgb(33 36 44 / .06);
}
.uml-color-input__sample input[type="color"] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  appearance: none;
  padding: 0;
  border: 0;
  background: transparent;
  opacity: 0;
  cursor: pointer;
}
.uml-color-input__sample input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
.uml-color-input__sample input[type="color"]::-webkit-color-swatch { border: 0; }
.uml-color-input__sample input[type="color"]::-moz-color-swatch { border: 0; }
.uml-color-input__sample:focus-within {
  outline: 2px solid var(--uml-edit-accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--ring);
}
.uml-checker {
  background-color: #fff;
  background-image: conic-gradient(
    #dcd7c9 25%,
    transparent 0 50%,
    #dcd7c9 0 75%,
    transparent 0
  );
  background-size: 12px 12px;
}
.uml-color-input__palette {
  display: grid;
  gap: 10px;
  padding: 11px;
  border: 1px solid var(--uml-edit-line);
  border-radius: var(--r-sm);
  background: var(--paper-2);
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
  border-color: var(--line-strong);
  border-radius: var(--r-xs);
}
.uml-color-input__swatches button:hover:not(:disabled) {
  transform: translateY(-1px);
  background-color: revert;
}
.uml-color-input__swatches button[aria-pressed="true"] {
  outline: 2px solid var(--uml-edit-accent);
  outline-offset: 2px;
}
.uml-color-input__swatches button > span {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  color: var(--accent-deep);
  font-size: 12px;
  box-shadow: 0 0 0 1px var(--line-strong);
}
.uml-color-input__swatches button > span > svg {
  width: 11px;
  height: 11px;
  display: block;
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
  border: 1px solid var(--line-strong);
  border-radius: 3px;
}
.uml-color-input__transparent[aria-pressed="true"] {
  outline: 2px solid var(--uml-edit-accent);
  outline-offset: 1px;
}
.uml-cause-editor {
  min-width: 0;
  border: 1px solid var(--uml-edit-line);
  border-radius: var(--r-sm);
  padding: 10px;
}
.uml-cause-editor > summary {
  font-size: 12px;
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
  border-inline-start: 1px solid var(--accent-line);
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

  /* 字体（仅本机栈，离线） */
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
    system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
:root {
  color-scheme: light;
  color: var(--ink);
  background: var(--bg);
  font-size: 14px;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; background: var(--bg); color: var(--ink); }
button, input, select, textarea { font: inherit; }
button, a { touch-action: manipulation; }
button { color: inherit; cursor: pointer; transition: background-color var(--t) var(--ease), border-color var(--t) var(--ease), box-shadow var(--t) var(--ease), transform var(--t) var(--ease), color var(--t) var(--ease); }
button:disabled { cursor: not-allowed; opacity: .55; }
:is(button,a,summary,input,select,textarea):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; box-shadow: 0 0 0 4px var(--ring); }
input,textarea { caret-color: var(--accent); }
input[type="range"], input[type="checkbox"], input[type="radio"] { accent-color: var(--accent); }
::selection { background: var(--accent-soft); color: var(--ink); }
* { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { border: 3px solid transparent; border-radius: 8px; background: var(--line-strong); background-clip: padding-box; }
::-webkit-scrollbar-thumb:hover { background: var(--faint); background-clip: padding-box; }
::-webkit-scrollbar-track { background: transparent; }
summary { list-style: none; }
summary::-webkit-details-marker { display: none; }
.visually-hidden { position: absolute !important; width: 1px !important; height: 1px !important; margin: -1px !important; padding: 0 !important; overflow: hidden !important; clip: rect(0,0,0,0) !important; white-space: nowrap !important; border: 0 !important; }
.studio-shell { min-height: 100vh; color: var(--ink); }
.studio-header { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; justify-content: space-between; gap: 24px; height: 58px; padding: 0 20px; background: rgb(255 255 255 / .74); -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4); border-bottom: 1px solid var(--line); }
.studio-header::after { content: ""; position: absolute; left: 0; right: 0; bottom: -2px; height: 2px; background: var(--gradient-brand); pointer-events: none; }
.studio-brand { display: flex; align-items: center; gap: 11px; color: var(--ink); text-decoration: none; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.2; white-space: nowrap; }
.brand-light { font-weight: 400; font-size: 15px; }
.studio-brand small { display: block; margin-top: 3px; font-size: 11px; font-weight: 400; color: var(--muted); }
.brand-mark { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: var(--r-sm); background: var(--gradient-brand); color: #fff; box-shadow: 0 1px 3px rgb(10 90 72 / .35); }
.studio-brand:hover .brand-mark { background: var(--gradient-brand-hover); }
.brand-mark svg { width: 16px; height: 16px; }
.header-center { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.live-indicator { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--success); flex: none; box-shadow: 0 0 0 3px rgb(46 125 88 / .16); animation: uml-live-breathe 2s var(--ease) infinite; }
@keyframes uml-live-breathe { 50% { box-shadow: 0 0 0 5px rgb(46 125 88 / .05); } }
.header-slash { margin: 0 4px; color: var(--faint); }
.header-actions, .workspace-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 6px 14px; border: 1px solid transparent; border-radius: var(--r-sm); font-size: 13px; font-weight: 550; line-height: 1.5; white-space: nowrap; }
.button > svg { width: 15px; height: 15px; flex: none; }
.button-dark { background: var(--primary); border-color: transparent; color: #fff; }
.button-dark:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
.button-dark:active:not(:disabled) { transform: none; box-shadow: none; }
.button-accent { background: var(--accent); border-color: transparent; color: #fff; }
.button-accent:hover:not(:disabled) { background: var(--accent-deep); }
.button:disabled { transform: none; box-shadow: none; opacity: 1; }
.button-dark:disabled { background: color-mix(in srgb, var(--primary), var(--paper) 55%); color: rgb(255 255 255 / .85); }
.button-accent:disabled { background: color-mix(in srgb, var(--accent), var(--paper) 55%); color: rgb(255 255 255 / .85); }
.button-outline { background: var(--paper); border-color: var(--line); color: var(--ink); }
.button-outline:hover:not(:disabled) { background: var(--paper-2); border-color: var(--line-strong); }
.button-outline:disabled { color: color-mix(in srgb, var(--ink), var(--paper) 50%); background: var(--paper); }
.button-quiet { background: transparent; color: var(--muted); }
.button-quiet:hover:not(:disabled) { background: var(--paper-2); color: var(--ink); }
.button-quiet:disabled { color: color-mix(in srgb, var(--muted), var(--paper) 50%); }
.danger-button { color: var(--danger); }
.button-outline.danger-button:hover:not(:disabled) { background: var(--danger-soft); border-color: var(--danger-line); }
.mobile-menu-button, .sidebar-scrim { display: none; }
.studio-body { display: flex; align-items: stretch; gap: 16px; min-height: calc(100vh - 60px); padding: 16px 18px 20px; }
.studio-sidebar { position: sticky; top: 74px; align-self: flex-start; width: 270px; flex: none; max-height: calc(100vh - 92px); overflow-y: auto; padding: 2px 14px 16px; background: var(--paper); border-radius: var(--r-lg); box-shadow: var(--shadow-sm); }
.sidebar-section { padding: 16px 0; }
.section-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.section-heading h2 { margin: 0; font-size: 12px; font-weight: 600; color: var(--muted); letter-spacing: .02em; }
.section-meta { margin-left: auto; color: var(--faint); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.field-label { display: block; color: var(--muted); font-size: 12px; font-weight: 500; margin: 14px 0 6px; }
.select-input, .text-input { width: 100%; max-width: 100%; min-height: 34px; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 7px 11px; background: var(--paper); color: var(--ink); font-size: 13px; transition: border-color var(--t) var(--ease), box-shadow var(--t) var(--ease); }
.select-input:hover, .text-input:hover { border-color: var(--line-strong); }
.select-input:focus, .text-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px var(--ring); }
.select-input:disabled, .text-input:disabled { opacity: .55; cursor: not-allowed; background: var(--paper-2); }
.select-input option, .uml-form-editor option { color: var(--ink); background: var(--paper); }
.select-wrap { position: relative; display: block; min-width: 0; }
.select-wrap > select { appearance: none; -webkit-appearance: none; width: 100%; padding-right: 30px; }
.select-chevron { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--faint); pointer-events: none; }
.select-wrap:hover .select-chevron { color: var(--muted); }
.document-title { margin-bottom: 14px; }
.diagram-search { position: relative; margin-bottom: 10px; }
.diagram-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); width: 15px; height: 15px; color: var(--faint); pointer-events: none; }
.diagram-filter { padding-left: 33px; }
.diagram-list { display: grid; gap: 3px; max-height: min(46vh, 480px); overflow-y: auto; margin-bottom: 12px; padding-right: 2px; }
.diagram-item { position: relative; border-radius: var(--r-md); transition: background-color var(--t) var(--ease), box-shadow var(--t) var(--ease); }
.diagram-item:hover { background: var(--paper-2); }
.diagram-item.selected { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent-line); }
.diagram-select { display: flex; gap: 10px; align-items: flex-start; width: 100%; min-width: 0; padding: 9px 56px 9px 10px; text-align: left; background: transparent; border: 0; border-radius: inherit; }
.diagram-list-index { flex: none; display: grid; place-items: center; min-width: 23px; height: 20px; margin-top: 1px; padding: 0 5px; border-radius: var(--r-xs); background: var(--paper-2); color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
.diagram-item:hover .diagram-list-index { background: var(--paper); }
.diagram-item.selected .diagram-list-index { background: rgb(255 255 255 / .7); color: var(--accent); }
.diagram-item-text { min-width: 0; }
.diagram-item strong { display: block; font-size: 13px; font-weight: 600; line-height: 1.6; color: var(--ink); overflow-wrap: anywhere; }
.diagram-item.selected strong { color: var(--accent); }
.diagram-item small { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.diagram-item small b { display: inline-block; margin-left: 5px; padding: 0 7px; border-radius: var(--r-pill); background: var(--warning-soft); color: var(--warning); font-size: 11px; font-weight: 500; line-height: 1.8; }
.diagram-item-actions { position: absolute; top: 7px; right: 7px; display: flex; gap: 4px; opacity: 0; transition: opacity var(--t-fast) var(--ease); }
.diagram-item:hover .diagram-item-actions, .diagram-item:focus-within .diagram-item-actions { opacity: 1; }
.diagram-item-actions button { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: var(--r-xs); background: transparent; color: var(--muted); box-shadow: none; }
.diagram-item-actions button:hover:not(:disabled) { background: var(--paper); box-shadow: var(--shadow-sm); }
.diagram-item-actions button svg { width: 15px; height: 15px; }
.diagram-item-actions button:hover:not(:disabled) { color: var(--accent); }
.diagram-item-actions button.danger:hover:not(:disabled) { color: var(--danger); }
.diagram-item-actions button:disabled { opacity: .45; }
.diagram-list-empty { margin: 8px 2px 4px; color: var(--faint); font-size: 13px; }
.collection-actions { display: flex; gap: 8px; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid var(--line); }
.collection-actions .button { flex: 1; min-height: 32px; padding: 5px 10px; font-size: 12px; }
.add-diagram-row { display: flex; gap: 8px; }
.add-diagram-row .select-wrap { flex: 1; min-width: 0; }
.add-diagram-row .button { flex: none; padding-inline: 11px; font-size: 12px; }
.quick-presets-disclosure { margin-top: 12px; font-size: 12px; color: var(--muted); }
.quick-presets-disclosure > summary { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 5px 0; font-weight: 550; }
.quick-presets { display: grid; grid-template-columns: repeat(2,1fr); gap: 6px; margin-top: 8px; }
.quick-presets button { min-height: 31px; padding: 5px 10px; border: 1px solid var(--line); border-radius: var(--r-pill); background: var(--paper); color: var(--ink); font-size: 12px; }
.quick-presets button:hover:not(:disabled) { background: var(--paper-2); border-color: var(--line-strong); }
.export-tip, .control-hint, .field-hint { margin: 10px 0 0; font-size: 12px; color: var(--muted); line-height: 1.7; }
.sidebar-footnote { display: flex; gap: 7px; align-items: center; margin-top: 4px; color: var(--faint); font-size: 12px; line-height: 1.6; padding-top: 13px; border-top: 1px solid var(--line); }
.studio-main { flex: 1; min-width: 0; padding: 6px 6px 0; }
.workspace-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.workspace-heading > div:first-child { min-width: 0; }
.workspace-heading h1 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.55; color: var(--ink); overflow-wrap: anywhere; }
.workspace-heading p { max-width: 74ch; margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.65; }
.workspace-actions { flex: none; }
.workspace-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; margin: 10px 0 14px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.type-badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: var(--r-pill); background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 600; }
.meta-dot { color: var(--faint); }
.draft-indicator { padding: 3px 10px; border-radius: var(--r-pill); background: var(--warning-soft); color: var(--warning); font-size: 12px; font-weight: 500; }
.save-state { color: var(--muted); margin-left: auto; }
.position-adjustments { padding: 12px 16px; background: var(--paper); border: 1px solid var(--line); border-radius: 9px; margin-top: 12px; }
.position-adjustment-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; color: var(--muted); font-size: 12px; }
.position-adjustment-actions > span { margin-right: auto; }
.adjustment-json { max-height: 260px; overflow: auto; margin: 12px 0 0; padding: 12px; background: var(--paper-2); color: var(--ink); border-radius: 6px; font-size: 12px; line-height: 1.6; white-space: pre; }
.export-toolbar { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px 16px; margin-bottom: 14px; padding: 12px 14px; background: var(--paper); border-radius: var(--r-md); box-shadow: var(--shadow-sm); }
.export-fields { display: flex; gap: 8px; }
.export-fields > label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; font-weight: 500; }
.export-fields .select-input { min-width: 126px; }
.export-image-actions { display: flex; gap: 8px; }
.quality-control { width: 130px; margin: 0 0 3px; }
.range-control > span { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; gap: 8px; }
.range-control output { font-variant-numeric: tabular-nums; }
.range-control input { width: 100%; margin: 9px 0 0; }
.more-export { position: relative; font-size: 12px; }
.more-export > summary { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 6px 14px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--paper); color: var(--ink); font-size: 13px; font-weight: 550; cursor: pointer; transition: background-color var(--t) var(--ease), border-color var(--t) var(--ease), box-shadow var(--t) var(--ease); }
.more-export > summary:hover { background: var(--paper-2); border-color: var(--line-strong); }
.more-export > summary .summary-chevron { transform: none; }
.more-export[open] > summary .summary-chevron { transform: rotate(180deg); }
.more-export-content { position: absolute; z-index: 10; top: calc(100% + 6px); right: 0; width: 290px; padding: 14px; border-radius: var(--r-md); background: var(--paper); box-shadow: var(--shadow-lg); }
.more-export-content .button { width: 100%; }
.workspace-panels { display: grid; grid-template-columns: minmax(0,1fr); align-items: start; gap: 16px; }
.workspace-panels.with-editor { grid-template-columns: minmax(0,1fr) minmax(340px,384px); }
.preview-column { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.preview-style-panel { min-width: 0; background: var(--paper); border-radius: var(--r-lg); box-shadow: var(--shadow-sm); }
.preview-style-panel > summary { display: flex; align-items: center; gap: 9px; padding: 14px 18px; cursor: pointer; color: var(--ink); font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
.preview-style-panel > summary span { margin-left: 2px; font-size: 12px; color: var(--muted); font-weight: 400; letter-spacing: 0; }
.style-panel-content { padding: 0 18px 16px; }
.style-panel-content > .sidebar-section { padding: 12px 0 0; }
.section-heading .text-button { margin-left: auto; }
.text-button { display: inline-flex; align-items: center; gap: 4px; border: 0; background: none; padding: 5px 0; color: var(--accent); font-size: 12px; line-height: 1.6; }
.text-button svg { width: 13px; height: 13px; flex: none; }
.text-button:hover:not(:disabled) { color: var(--accent-deep); text-decoration: underline; text-underline-offset: 3px; }
.summary-chevron { flex: none; width: 15px; height: 15px; color: var(--faint); transform: rotate(-90deg); transition: transform var(--t) var(--ease); }
details[open] > summary .summary-chevron { transform: rotate(0deg); }
.theme-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(68px,1fr)); gap: 10px; }
.theme-option { display: flex; flex-direction: column; align-items: center; gap: 7px; background: transparent; border: 0; border-radius: var(--r-sm); padding: 6px 4px; color: var(--muted); font-size: 12px; }
.theme-option:hover { background: var(--paper-2); }
.theme-option:hover .theme-preview { transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.theme-preview { width: 100%; height: 32px; display: flex; gap: 5px; align-items: center; justify-content: center; border: 1px solid; border-radius: var(--r-xs); transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease); }
.theme-preview i { display: block; width: 10px; height: 12px; border-radius: 2px; }
.theme-preview i + i { height: 9px; }
.theme-preview i.palette-swatch { width: 9px; height: 12px; }
.theme-preview i.palette-swatch.tint { opacity: .55; outline: 1.5px solid currentColor; }
.theme-preview i.palette-swatch.gradient { background-image: linear-gradient(180deg, rgb(255 255 255 / .45), rgb(0 0 0 / .12)) !important; }
.palette-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.palette-controls .field-label { display: grid; gap: 6px; }
.mermaid-import-body { display: grid; gap: 8px; padding-top: 8px; }
.mermaid-import-input { width: 100%; min-height: 110px; resize: vertical; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: var(--r-sm, 9px); font: 12px/1.5 "Cascadia Code", Consolas, monospace; background: var(--paper); color: var(--ink); }
.mermaid-import-input:focus { outline: 2px solid var(--accent); box-shadow: 0 0 0 4px var(--ring); }
.default-directory-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.theme-option.selected .theme-preview { outline: 2px solid var(--accent); outline-offset: 2px; }
.theme-option.selected { color: var(--accent); font-weight: 600; }
.style-subheading { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--muted); font-size: 12px; }
.custom-badge { padding: 2px 8px; border-radius: var(--r-pill); color: var(--warning); background: var(--warning-soft); font-size: 12px; font-weight: 500; }
.studio-colors { display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 14px; }
.advanced-styles { margin-top: 14px; border-top: 1px solid var(--line); }
.advanced-styles > summary { display: flex; align-items: center; gap: 8px; padding: 13px 0; font-size: 13px; font-weight: 600; color: var(--ink); cursor: pointer; }
.advanced-inner { padding: 0 0 4px; }
.advanced-inner > .text-input, .advanced-inner > .select-wrap { margin-bottom: 12px; }
.font-format-row { display: flex; gap: 8px; align-items: flex-end; margin: 16px 0; }
.font-format-row > label { flex: 1; font-size: 12px; color: var(--muted); }
.font-format-row .select-wrap { margin-top: 6px; }
.format-button { display: flex; gap: 5px; align-items: center; justify-content: center; min-height: 34px; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--paper); color: var(--ink); font-size: 12px; }
.format-button:hover:not(:disabled) { border-color: var(--line-strong); background: var(--paper-2); }
.format-button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent-line); color: var(--accent); }
.number-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 14px; }
.number-control { display: grid; align-content: start; gap: 6px; min-width: 0; color: var(--muted); font-size: 12px; }
.number-control > span { display: flex; justify-content: space-between; gap: 4px; }
.number-control small { font-size: 12px; color: var(--faint); line-height: 1.5; }
.number-control input { font-variant-numeric: tabular-nums; }
.number-control input:disabled { opacity: .5; cursor: not-allowed; }
.layout-number-grid { margin-top: 16px; }
.checkbox-control { display: flex; align-items: center; gap: 8px; margin: 16px 0; font-size: 13px; }
.checkbox-control input { accent-color: var(--accent); }
.data-panel { display: flex; flex-direction: column; min-width: 0; height: clamp(560px,calc(100vh - 250px),900px); border-radius: var(--r-lg); background: var(--paper); box-shadow: var(--shadow-sm); overflow: hidden; scroll-margin-top: 16px; }
.editor-mode-tabs { display: flex; flex: none; gap: 4px; margin: 12px 12px 0; padding: 4px; background: var(--paper-2); border-radius: var(--r-pill); }
.editor-mode-tabs > button { flex: 1; min-height: 31px; border: 0; border-radius: var(--r-pill); padding: 5px 8px; background: transparent; color: var(--muted); font-size: 13px; font-weight: 550; }
.editor-mode-tabs > button:hover { color: var(--ink); }
.editor-mode-tabs > button[aria-selected="true"] { background: var(--paper); box-shadow: var(--shadow-sm); color: var(--ink); font-weight: 600; }
.form-panel { flex: 1; min-height: 0; overflow: auto; }
.editor-fields { min-width: 0; margin: 0; padding: 0; border: 0; }
.json-panel { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; background: var(--paper); overflow: hidden; }
.json-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; }
.json-header h2 { margin: 0; font-size: 13px; font-weight: 600; }
.source-scope { display: flex; align-items: center; gap: 8px; padding: 2px 16px 10px; color: var(--muted); font-size: 12px; }
.source-scope .select-wrap { flex: 1; min-width: 0; }
.source-scope select { font-size: 12px; }
.editor-filebar { display: flex; align-items: center; gap: 7px; flex: none; padding: 8px 16px; background: var(--paper-2); border-block: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.file-dot { width: 6px; height: 6px; background: var(--success); border-radius: 50%; }
.file-saved, .file-dirty { margin-left: auto; }
.file-saved { color: var(--success); }
.file-dirty { color: var(--warning); }
.json-editor { flex: 1; min-height: 220px; width: 100%; resize: vertical; border: 0; background: var(--paper); color: var(--ink); font: 13px/1.7 ui-monospace,Consolas,"Microsoft YaHei",monospace; padding: 16px; tab-size: 2; white-space: pre; overflow: auto; }
.json-editor:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent), inset 0 0 0 6px var(--ring); }
.json-actions { border-top: 1px solid var(--line); padding: 12px 16px 0; }
.json-actions > .button { width: 100%; justify-content: space-between; }
.json-actions kbd { font: 11px/1.5 ui-monospace,Consolas,monospace; padding: 1px 6px; border-radius: var(--r-xs); background: rgb(255 255 255 / .18); }
.json-actions > div { display: flex; gap: 10px; justify-content: center; align-items: center; flex-wrap: wrap; margin-top: 8px; color: var(--faint); }
.editor-hint { margin: 0; padding: 8px 16px 14px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.workspace-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 16px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.runtime-warning { color: var(--warning); }
.error-banner { position: fixed; top: 70px; left: 50%; transform: translateX(-50%); z-index: 90; display: flex; align-items: flex-start; gap: 12px; width: min(680px, calc(100vw - 32px)); margin: 0; padding: 14px 16px; background: var(--danger-soft); border: 1px solid var(--danger-line); border-radius: var(--r-md); box-shadow: var(--shadow-lg); color: var(--danger); }
.error-icon { width: 18px; height: 18px; flex: none; margin-top: 1px; color: var(--danger); }
.error-banner strong { font-size: 14px; }
.error-banner p { margin: 6px 0 0; font-size: 13px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.error-banner > div { flex: 1; min-width: 0; }
.icon-button { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--danger); }
.icon-button:hover { background: rgb(191 66 52 / .10); }
.icon-button svg { width: 15px; height: 15px; }
.studio-toast { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); z-index: 100; max-width: calc(100vw - 32px); padding: 11px 18px; background: var(--ink); color: #fff; border-radius: var(--r-md); box-shadow: var(--shadow-lg); font-size: 13px; line-height: 1.6; }
.toast-enter-active, .toast-leave-active { transition: opacity .18s var(--ease), transform .18s var(--ease); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%,-8px); }
/* 画布去框：无卡片外框，状态徽标与缩放控件浮在画布上。 */
.studio-shell .diagram-canvas { position: relative; height: calc(100vh - 92px); min-height: 560px; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: var(--ink); }
.studio-shell .canvas-toolbar { position: absolute; z-index: 7; top: 12px; right: 14px; left: auto; min-height: 0; height: auto; padding: 0; background: transparent; border: 0; flex-wrap: nowrap; gap: 6px; pointer-events: none; }
.studio-shell .canvas-toolbar > * { pointer-events: auto; }
.studio-shell .canvas-status { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; background: rgb(255 255 255 / .85); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); border-radius: var(--r-pill); box-shadow: var(--shadow-md); color: var(--muted); font-size: 11px; white-space: nowrap; }
.studio-shell .canvas-status:not(:has(.busy)):not(:has(.failed)) { display: none; }
.studio-shell .status-dot { background: var(--success); }
.studio-shell .status-dot.busy { background: var(--warning); }
.studio-shell .status-dot.failed { background: var(--danger); }
.studio-shell .canvas-dimensions { color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
.studio-shell .canvas-stage { background-color: var(--paper-2); background-image: radial-gradient(circle, rgb(32 36 44 / .10) 1px, transparent 1.4px); background-size: 24px 24px; }
.studio-shell .zoom-tools { gap: 2px; padding: 3px; background: rgb(255 255 255 / .85); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); border-radius: var(--r-pill); box-shadow: var(--shadow-md); }
.studio-shell .zoom-tools button { width: 28px; min-height: 28px; height: 28px; border-radius: 6px; color: var(--muted); font-size: 15px; }
.studio-shell .zoom-tools .fit-button { width: auto; padding: 0 8px; font-size: 12px; }
.studio-shell .zoom-tools button:hover:not(:disabled) { background: var(--paper); box-shadow: var(--shadow-sm); color: var(--ink); }
.studio-shell .zoom-tools .fit-button.active { background: var(--accent-soft); color: var(--accent); box-shadow: none; }
.studio-shell .zoom-value { font-size: 12px; color: var(--muted); min-width: 40px; font-variant-numeric: tabular-nums; }
.studio-shell .toolbar-divider { background: var(--line); }
.studio-shell .canvas-artboard { box-shadow: 0 2px 8px rgb(33 36 44 / .08), 0 16px 40px -12px rgb(33 36 44 / .16); }
.studio-shell .diagram-canvas button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; box-shadow: 0 0 0 4px var(--ring); }
.studio-shell .canvas-error { background: var(--warning-soft); color: var(--warning); }
@media (max-width: 1200px) {
  .header-center { display: none; }
  .workspace-panels.with-editor { grid-template-columns: minmax(0,1fr); }
  .data-panel { height: 650px; }
}
@media (max-width: 860px) {
  .studio-header { gap: 12px; padding: 0 16px; }
  .mobile-menu-button { display: inline-flex; }
  .studio-body { padding: 14px 14px 18px; }
  .studio-sidebar { position: fixed; inset: 12px auto 12px 12px; width: min(300px, calc(100vw - 24px)); z-index: 40; max-height: none; overflow-y: auto; transform: translateX(-115%); visibility: hidden; background: rgb(255 255 255 / .86); -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4); box-shadow: var(--shadow-lg); transition: transform var(--t) var(--ease), visibility var(--t) var(--ease); }
  .studio-sidebar.is-open { transform: translateX(0); visibility: visible; }
  .sidebar-scrim { display: block; position: fixed; inset: 0; z-index: 35; border: 0; background: rgb(32 36 44 / .42); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
  .studio-main { padding: 4px 0 0; }
  .workspace-heading { flex-wrap: wrap; gap: 14px; }
  .workspace-actions { width: 100%; }
  .save-state { margin-left: 0; }
}
@media (max-width: 540px) {
  .studio-header { flex-wrap: wrap; gap: 12px; height: auto; padding: 12px 16px; }
  .studio-brand { font-size: 16px; }
  .header-actions { width: 100%; }
  .header-actions .button { flex: 1; padding-inline: 8px; font-size: 12px; }
  .hide-small { display: none; }
  .workspace-actions .button { flex: 1; }
  .export-toolbar { gap: 12px; }
  .export-fields { width: 100%; }
  .export-fields > label { flex: 1; min-width: 0; }
  .export-fields .select-input { min-width: 0; }
  .export-image-actions { width: 100%; }
  .export-image-actions .button { flex: 1; font-size: 12px; padding-inline: 8px; }
  .more-export-content { position: static; width: min(290px,calc(100vw - 32px)); margin-top: 6px; }
  .preview-style-panel > summary { flex-wrap: wrap; }
  .preview-style-panel > summary span { flex-basis: 100%; margin: 2px 0 0; }
  .style-panel-content { padding-inline: 14px; }
  .theme-grid { grid-template-columns: repeat(5,minmax(0,1fr)); gap: 8px 4px; }
  .theme-option { padding: 2px; }
  .studio-colors { grid-template-columns: 1fr; }
  .number-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
  .data-panel { height: 650px; }
  .studio-shell .diagram-canvas { min-height: 520px; }
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
  .studio-body { padding: 0; }
}
/* Persistent preview instructions remain legible at every viewport. */
.studio-shell .canvas-footer { height: auto; min-height: 38px; color: var(--faint); font-size: 12px; line-height: 1.6; padding: 10px 14px; background: var(--paper); border-color: var(--line); flex-wrap: wrap; gap: 6px; }
.studio-shell .canvas-empty { color: var(--muted); }
.studio-shell .canvas-empty p { font-size: 13px; }
.studio-shell .loading-ring circle { stroke: var(--line); }
.studio-shell .loading-ring path { stroke: var(--accent); }
.sidebar-close { margin-top: 12px; }

/* ---------- 工作台新布局：左栏 / 大画布 / 右栏检查器 ---------- */
.header-doc-name { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: 13px; font-weight: 600; }
.menu-trigger { padding-inline: 10px; }
.studio-body { align-items: stretch; }
.studio-main { display: flex; flex-direction: column; }
.workspace-title { font-size: 14px; font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
.workspace-meta { margin: 2px 0 12px; }
.canvas-region { position: relative; flex: 1; min-height: 0; }
.studio-inspector { position: sticky; top: 74px; align-self: flex-start; width: 288px; flex: none; max-height: calc(100vh - 92px); overflow-y: auto; background: var(--paper); border-radius: var(--r-lg); box-shadow: var(--shadow-sm); }
.sidebar-tabs { position: sticky; top: 0; z-index: 2; display: flex; gap: 4px; margin: 12px 0 0; padding: 4px; background: var(--paper-2); border-radius: var(--r-pill); }
.sidebar-tabs > button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 30px; border: 0; border-radius: var(--r-pill); padding: 4px 8px; background: transparent; color: var(--muted); font-size: 13px; font-weight: 550; }
.sidebar-tabs > button:hover { color: var(--ink); }
.sidebar-tabs > button[aria-selected="true"] { background: var(--paper); box-shadow: var(--shadow-sm); color: var(--ink); font-weight: 600; }
.sidebar-tabs .tab-count { padding: 0 7px; border-radius: var(--r-pill); background: var(--paper-2); color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
.sidebar-tabs > button[aria-selected="true"] .tab-count { background: var(--accent-soft); color: var(--accent); }
.sidebar-theme { border-top: 1px solid var(--line); }
.sidebar-theme .theme-more { margin-left: auto; padding: 4px 8px; font-size: 12px; min-height: 26px; }
.sidebar-theme-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 4px; }
.sidebar-theme-grid .theme-option { padding: 4px 2px; font-size: 11px; }
.sidebar-theme-grid .theme-preview { height: 26px; }

/* 画布浮动元素：标题徽标 / 工具条 / 导出条（absolute，半透明，不占布局） */
.canvas-title-chip { position: absolute; z-index: 6; top: 12px; left: 14px; display: flex; align-items: center; gap: 8px; max-width: min(62%, 620px); padding: 6px 12px; background: rgb(255 255 255 / .85); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); border-radius: var(--r-pill); box-shadow: var(--shadow-md); }
.canvas-title-chip strong { font-size: 12px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.canvas-title-chip .type-badge { flex: none; padding: 2px 9px; font-size: 11px; }
.canvas-title-chip .chip-meta { flex: none; color: var(--faint); font-size: 11px; white-space: nowrap; }
.canvas-float-tools, .canvas-float-export { position: absolute; z-index: 6; top: 56px; display: flex; align-items: center; gap: 4px; padding: 4px; background: rgb(255 255 255 / .85); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); border-radius: var(--r-md); box-shadow: var(--shadow-md); }
.canvas-float-tools { left: 14px; }
.canvas-float-export { right: 14px; }
.float-group { display: flex; align-items: center; gap: 2px; }
.float-divider { width: 1px; height: 20px; margin: 0 3px; background: var(--line); }
.float-button { display: inline-flex; align-items: center; gap: 5px; min-height: 30px; padding: 5px 10px; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--ink); font-size: 12px; font-weight: 550; white-space: nowrap; }
.float-button > svg { width: 14px; height: 14px; flex: none; }
.float-button:hover:not(:disabled) { background: var(--paper-2); }
.float-button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent-line); }
.float-button.danger:hover:not(:disabled) { background: var(--danger-soft); color: var(--danger); }
.float-button:disabled { opacity: .5; }
.canvas-float-export .select-input { min-height: 30px; min-width: 78px; padding: 4px 24px 4px 9px; font-size: 12px; border-color: var(--line); }
.export-scale .select-input { min-width: 58px; }
.canvas-float-export .select-chevron { right: 7px; width: 12px; height: 12px; }
.canvas-adjust-chip { position: absolute; z-index: 6; left: 14px; bottom: 52px; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--paper); border-radius: var(--r-pill); box-shadow: var(--shadow-md); color: var(--muted); font-size: 12px; }
.canvas-adjust-chip .text-button { padding: 0; }
.adjust-pop { position: absolute; left: 0; bottom: calc(100% + 8px); width: 320px; padding: 10px; background: var(--paper); border-radius: var(--r-md); box-shadow: var(--shadow-lg); }
.adjust-pop .adjustment-json { margin: 0; max-height: 220px; }
.adjust-pop .adjustment-hint { margin: 0 0 6px; font-size: 11px; color: var(--muted); line-height: 1.5; }
.canvas-quality { position: absolute; z-index: 6; right: 14px; bottom: 52px; width: 150px; padding: 8px 12px; background: var(--paper); border-radius: var(--r-md); box-shadow: var(--shadow-md); }
.canvas-quality input { margin-top: 4px; }

/* 完整编辑抽屉（表单 / JSON） */
.editor-scrim { position: fixed; inset: 0; z-index: 60; background: rgb(32 36 44 / .32); }
.editor-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; width: min(560px, 100vw); height: auto; max-height: none; border-radius: var(--r-lg) 0 0 var(--r-lg); box-shadow: var(--shadow-lg); }
.drawer-close { margin-left: auto; color: var(--muted); }
.drawer-close:hover { background: var(--paper-2); color: var(--ink); }

@media (max-width: 1100px) {
  .studio-inspector { display: none; }
}
@media (max-width: 860px) {
  .canvas-title-chip { top: 10px; left: 10px; max-width: calc(100% - 170px); }
  .studio-shell .canvas-toolbar { top: 10px; right: 10px; }
  .canvas-float-tools { top: 52px; left: 10px; }
  .canvas-float-export { top: auto; bottom: 52px; right: 10px; }
  .canvas-adjust-chip { bottom: auto; top: 96px; }
  .canvas-quality { display: none; }
}
</style>
