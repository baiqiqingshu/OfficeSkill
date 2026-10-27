<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch } from "vue";
import { matchesContent } from "./editor-search";
import CauseEditor from "./CauseEditor.vue";
import ColorInput from "./ColorInput.vue";
import { resolveTheme } from "./themes";
import { validateSpec } from "./validate";
import type {
  DiagramGroup,
  DiagramNode,
  DiagramSpec,
  FishboneCause,
  Fragment,
  Theme,
} from "./types";

const props = defineProps<{ modelValue: DiagramSpec }>();
const emit = defineEmits<{ "update:modelValue": [value: DiagramSpec] }>();
// Diagram data is JSON; serialization also unwraps nested reactive cause drafts.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
const draft = ref<DiagramSpec>(clone(props.modelValue));
const error = ref("");
const root = ref<HTMLElement>();
const query = ref("");
const expanded = ref<boolean>();
let elementKeys = new WeakMap<object, string>();
function indexElements(): void {
  elementKeys = new WeakMap();
  for (const field of ["nodes", "edges", "groups", "lanes", "participants", "messages", "fragments"] as const)
    draft.value[field]?.forEach((item, index) => elementKeys.set(toRaw(item), `${field}/${index}`));
  function visit(cause: FishboneCause, key: string): void {
    elementKeys.set(toRaw(cause), key);
    cause.children?.forEach((child, index) => visit(child, `${key}/children/${index}`));
  }
  draft.value.fishbone?.categories.forEach((category, index) => {
    elementKeys.set(toRaw(category), `categories/${index}`);
    category.causes.forEach((cause, i) => visit(cause, `categories/${index}/causes/${i}`));
  });
}
indexElements();
function elementKey(item: object): string | undefined { return elementKeys.get(toRaw(item)); }
function matches(item: unknown): boolean {
  return matchesContent(item, query.value, kindLabels);
}
function sectionMatches(items: unknown[] | undefined): boolean { return !query.value.trim() || !!items?.some(matches); }
const hasResults = computed(() => matches({ title: draft.value.title, description: draft.value.description }) ||
  [draft.value.nodes, draft.value.edges, draft.value.groups, draft.value.lanes, draft.value.participants, draft.value.messages, draft.value.fragments].some(sectionMatches) ||
  matches(draft.value.fishbone ?? {}));
function setExpanded(open: boolean): void {
  expanded.value = open;
  root.value?.querySelectorAll<HTMLDetailsElement>("details").forEach(item => { item.open = open; });
}
watch(query, async () => {
  await nextTick();
  if (query.value.trim()) root.value?.querySelectorAll<HTMLDetailsElement>("details").forEach(item => { item.open = true; });
});
async function focusElement(key: string): Promise<void> {
  // Compare attribute values directly: IDs/content never become CSS selectors.
  const find = () => [...(root.value?.querySelectorAll<HTMLElement>("[data-editor-key]") ?? [])].find(item => item.dataset.editorKey === key);
  if (!find()) return; // The applied element may have been removed in this draft.
  query.value = "";
  await nextTick();
  const target = find();
  if (!target) return;
  root.value?.querySelectorAll(".uml-editor-selected").forEach(item => item.classList.remove("uml-editor-selected"));
  target.classList.add("uml-editor-selected");
  for (let item: HTMLElement | null = target; item && item !== root.value; item = item.parentElement)
    if (item instanceof HTMLDetailsElement) item.open = true;
  const viewport = root.value?.closest<HTMLElement>(".form-panel");
  if (viewport) {
    const toolbar = root.value?.querySelector<HTMLElement>(".uml-editor-tools");
    const top = target.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - (toolbar?.offsetHeight ?? 0) - 16;
    viewport.scrollTo({ top: Math.max(0, top), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  } else target.scrollIntoView({ block: "nearest" });
  (target.querySelector("summary") ?? target).focus({ preventScroll: true });
}
const appliedSource = computed(() => JSON.stringify(props.modelValue));
watch(appliedSource, () => resetDraft());
const inheritedTheme = computed(() => resolveTheme(draft.value));
const isGraph = computed(
  () => draft.value.type !== "sequence" && draft.value.type !== "fishbone",
);
const nodeKinds = [
  "action",
  "decision",
  "start",
  "end",
  "fork",
  "join",
  "actor",
  "usecase",
  "class",
  "interface",
  "component",
  "package",
  "database",
  "server",
  "queue",
  "state",
  "note",
] as const;
const edgeKinds = [
  "flow",
  "association",
  "dependency",
  "include",
  "extend",
  "inheritance",
  "realization",
  "aggregation",
  "composition",
] as const;
const colorFields = [
  { key: "surface", label: "节点填充" },
  { key: "text", label: "文字" },
  { key: "primary", label: "主色" },
  { key: "secondary", label: "辅助色" },
  { key: "border", label: "边框" },
  { key: "muted", label: "次要文字" },
  { key: "background", label: "背景" },
] as const;
const numericFields = [
  { key: "fontSize", label: "字号", min: 8, max: 48, step: 1 },
  { key: "fontWeight", label: "字重", min: 100, max: 900, step: 100 },
  { key: "lineWidth", label: "线宽", min: 0.5, max: 8, step: 0.5 },
  { key: "radius", label: "圆角", min: 0, max: 32, step: 1 },
  { key: "nodeWidth", label: "宽度", min: 80, max: 600, step: 10 },
  { key: "nodeHeight", label: "高度", min: 32, max: 300, step: 2 },
  { key: "gap", label: "间距", min: 24, max: 240, step: 4 },
] as const;
const kindLabels: Record<string, string> = {
  action: "动作",
  decision: "判断",
  start: "开始",
  end: "结束",
  fork: "分叉",
  join: "汇合",
  actor: "角色",
  usecase: "用例",
  class: "类",
  interface: "接口",
  component: "组件",
  package: "包",
  database: "数据库",
  server: "服务器",
  queue: "队列",
  state: "状态",
  note: "注释",
  flow: "流程",
  association: "关联",
  dependency: "依赖",
  include: "包含",
  extend: "扩展",
  inheritance: "继承",
  realization: "实现",
  aggregation: "聚合",
  composition: "组合",
  participant: "参与者",
  sync: "同步",
  async: "异步",
  return: "返回",
  create: "创建",
  destroy: "销毁",
  boundary: "边界",
  node: "部署节点",
};
function hasChanges(): boolean {
  return JSON.stringify(draft.value) !== appliedSource.value;
}
function resetDraft(): void {
  draft.value = clone(props.modelValue);
  indexElements();
  query.value = "";
  root.value?.querySelectorAll(".uml-editor-selected").forEach(item => item.classList.remove("uml-editor-selected"));
  error.value = "";
}
defineExpose({ hasChanges, resetDraft, focusElement });
function apply(): void {
  error.value = "";
  try {
    emit("update:modelValue", validateSpec(clone(draft.value)));
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
}
function fail(message: string): void {
  error.value = message;
}
function optionalText<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: string,
): void {
  if (value === "") delete target[key];
  else target[key] = value as T[K];
}
function valueOf(event: Event): string {
  return (event.target as HTMLInputElement).value;
}
function uniqueId(prefix: string): string {
  const spec = draft.value;
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
function addNode(): void {
  error.value = "";
  if (draft.value.type === "swimlane" && !draft.value.lanes?.length) addLane();
  const kinds: Partial<Record<DiagramSpec["type"], DiagramNode["kind"]>> = {
    class: "class",
    usecase: "usecase",
    state: "state",
    component: "component",
    package: "package",
    deployment: "server",
    physical: "server",
  };
  const node: DiagramNode = {
    id: uniqueId("node"),
    label: "新节点",
    kind: kinds[draft.value.type] ?? "action",
  };
  if (draft.value.type === "swimlane") node.lane = draft.value.lanes![0].id;
  (draft.value.nodes ??= []).push(node);
}
function removeNode(index: number): void {
  error.value = "";
  const node = draft.value.nodes![index];
  if (draft.value.nodes!.length <= 1) return fail("至少保留一个节点。");
  if (
    draft.value.edges?.some(
      (edge) => edge.from === node.id || edge.to === node.id,
    )
  )
    return fail(`节点「${node.label}」仍被连线引用；请先删除或修改相关连线。`);
  draft.value.nodes!.splice(index, 1);
}
function addEdge(): void {
  error.value = "";
  const nodes = draft.value.nodes ?? [];
  if (!nodes.length) return fail("请先添加节点，再添加连线。");
  (draft.value.edges ??= []).push({
    id: uniqueId("edge"),
    from: nodes[0].id,
    to: (nodes[1] ?? nodes[0]).id,
    label: "",
    kind: "flow",
  });
}
function addGroup(): void {
  error.value = "";
  (draft.value.groups ??= []).push({
    id: uniqueId("group"),
    label: "新分组",
    kind: "boundary",
  });
}
function removeGroup(index: number): void {
  error.value = "";
  const group = draft.value.groups![index];
  if (
    draft.value.nodes?.some((node) => node.group === group.id) ||
    draft.value.groups?.some((child) => child.parent === group.id)
  )
    return fail(
      `分组「${group.label}」仍包含节点或子分组；请先更改它们的归属。`,
    );
  draft.value.groups!.splice(index, 1);
}
function parentGroups(group: DiagramGroup): DiagramGroup[] {
  return (draft.value.groups ?? []).filter((candidate) => {
    const visited = new Set([group.id]);
    let current: DiagramGroup | undefined = candidate;
    while (current) {
      if (visited.has(current.id)) return false;
      visited.add(current.id);
      current = draft.value.groups?.find((item) => item.id === current!.parent);
    }
    return true;
  });
}
function addLane(): void {
  error.value = "";
  (draft.value.lanes ??= []).push({ id: uniqueId("lane"), label: "新泳道" });
}
function removeLane(index: number): void {
  error.value = "";
  const lane = draft.value.lanes![index];
  if (draft.value.nodes?.some((node) => node.lane === lane.id))
    return fail(`泳道「${lane.label}」仍包含节点；请先将节点移到其他泳道。`);
  if (draft.value.type === "swimlane" && draft.value.lanes!.length <= 1)
    return fail("泳道图至少保留一条泳道。");
  draft.value.lanes!.splice(index, 1);
}
function membership(
  node: DiagramNode,
  key: "group" | "lane",
  value: string,
): void {
  optionalText(node, key, value);
  if (value) delete node[key === "group" ? "lane" : "group"];
}
function styleValue<K extends keyof Theme>(
  node: DiagramNode,
  key: K,
): Theme[K] {
  return node.style?.[key] ?? inheritedTheme.value[key];
}
function setStyle<K extends keyof Theme>(
  node: DiagramNode,
  key: K,
  value: Theme[K],
): void {
  node.style = { ...node.style, [key]: value };
}
function optionalStyle(
  node: DiagramNode,
  key: "fontFamily" | "fontStyle" | "textDecoration",
  value: string,
): void {
  if (value === "") {
    if (node.style) delete node.style[key];
    return;
  }
  node.style = { ...node.style, [key]: value };
}
function numericStyle(
  node: DiagramNode,
  key: (typeof numericFields)[number]["key"],
  event: Event,
): void {
  const raw = valueOf(event);
  if (!raw) {
    if (node.style) delete node.style[key];
    return;
  }
  const number = Number(raw);
  if (Number.isFinite(number)) setStyle(node, key, number);
}
function addMember(node: DiagramNode, key: "attributes" | "operations"): void {
  (node[key] ??= []).push(
    key === "attributes" ? "+ attribute: string" : "+ operation(): void",
  );
}
function addParticipant(): void {
  error.value = "";
  (draft.value.participants ??= []).push({
    id: uniqueId("participant"),
    label: "新参与者",
    kind: "participant",
  });
}
function removeParticipant(index: number): void {
  error.value = "";
  const participant = draft.value.participants![index];
  if (draft.value.participants!.length <= 1)
    return fail("至少保留一个参与者。");
  if (
    draft.value.messages?.some(
      (message) =>
        message.from === participant.id || message.to === participant.id,
    )
  )
    return fail(
      `参与者「${participant.label}」仍被消息引用；请先删除或修改相关消息。`,
    );
  draft.value.participants!.splice(index, 1);
}
function addMessage(): void {
  error.value = "";
  const participants = draft.value.participants ?? [];
  if (!participants.length) return fail("请先添加参与者。");
  (draft.value.messages ??= []).push({
    from: participants[0].id,
    to: (participants[1] ?? participants[0]).id,
    label: "新消息",
    kind: "sync",
  });
}
function removeMessage(index: number): void {
  error.value = "";
  if (draft.value.messages!.length <= 1)
    return fail("时序图至少保留一条消息。");
  if (
    draft.value.fragments?.some(
      (fragment) => fragment.from <= index && fragment.to >= index,
    )
  )
    return fail(
      `第 ${index + 1} 条消息属于组合片段；请先调整片段范围或删除相关片段。`,
    );
  draft.value.messages!.splice(index, 1);
  for (const fragment of draft.value.fragments ?? []) {
    if (fragment.from > index) fragment.from--;
    if (fragment.to > index) fragment.to--;
    if (fragment.elseAt !== undefined && fragment.elseAt > index)
      fragment.elseAt--;
  }
}
function addFragment(): void {
  error.value = "";
  const length = draft.value.messages?.length ?? 0;
  if (!length) return fail("请先添加消息，再添加组合片段。");
  (draft.value.fragments ??= []).push({
    kind: "loop",
    label: "循环条件",
    from: 0,
    to: length - 1,
  });
}
function fragmentKind(fragment: Fragment, value: string): void {
  fragment.kind = value as Fragment["kind"];
  if (value !== "alt" && value !== "par") {
    delete fragment.elseAt;
    delete fragment.elseLabel;
  }
}
function fragmentElse(fragment: Fragment, value: string): void {
  if (value === "") delete fragment.elseAt;
  else fragment.elseAt = Number(value);
}
function addCategory(): void {
  error.value = "";
  draft.value.fishbone ??= { effect: "待分析结果", categories: [] };
  draft.value.fishbone.categories.push({
    id: uniqueId("category"),
    label: "新分类",
    causes: [{ label: "新原因" }],
  });
}
function removeCategory(index: number): void {
  error.value = "";
  if (draft.value.fishbone!.categories.length <= 1)
    return fail("鱼骨图至少保留一个分类。");
  draft.value.fishbone!.categories.splice(index, 1);
}
function removeCause(categoryIndex: number, causeIndex: number): void {
  error.value = "";
  const causes = draft.value.fishbone!.categories[categoryIndex].causes;
  if (causes.length <= 1)
    return fail(
      "每个鱼骨分类至少保留一个原因；如需删除分类，请使用分类的删除按钮。",
    );
  causes.splice(causeIndex, 1);
}
function updateCause(
  categoryIndex: number,
  index: number,
  cause: FishboneCause,
): void {
  // Immutable recursive edits keep the identity of the last applied element.
  // Deleting an earlier sibling must not redirect clicks to a different cause.
  function retainKeys(previous: FishboneCause, next: FishboneCause): void {
    const key = elementKeys.get(toRaw(previous));
    if (key && !elementKeys.has(toRaw(next))) elementKeys.set(toRaw(next), key);
    next.children?.forEach((child, i) => {
      if (!elementKeys.has(toRaw(child)) && previous.children?.[i]) retainKeys(previous.children[i], child);
    });
  }
  retainKeys(draft.value.fishbone!.categories[categoryIndex].causes[index], cause);
  draft.value.fishbone!.categories[categoryIndex].causes[index] = cause;
}
</script>

<template>
  <div ref="root" class="uml-form-editor">
    <header class="uml-editor-heading">
      <strong>图表数据表单</strong
      ><span class="uml-editor-badge">{{
        hasChanges() ? "未应用" : "已同步"
      }}</span>
    </header>
    <p class="uml-editor-hint">
      修改仅保留在表单草稿中。点击“应用表单”后更新图表；ID
      固定，避免破坏引用。其他可选数据会完整保留。
    </p>
    <div class="uml-editor-tools">
      <label>检索元素<input v-model="query" type="search" placeholder="名称、ID、详情或其他内容" /></label>
      <div class="uml-editor-heading">
        <button type="button" @click="setExpanded(true)">全部展开</button>
        <button type="button" @click="setExpanded(false)">全部折叠</button>
        <button v-if="query" type="button" @click="query = ''">清空检索</button>
      </div>
      <p v-if="query" class="uml-editor-hint" role="status">{{ hasResults ? "仅展示内容匹配的元素及其上级。" : "没有匹配的元素。" }}</p>
    </div>
    <section v-show="matches({ title: draft.title, description: draft.description })" class="uml-editor-section" aria-label="图表基本信息">
      <h3>基本信息</h3>
      <label>标题<input v-model="draft.title" type="text" /></label>
      <label
        >说明<textarea
          :value="draft.description ?? ''"
          rows="2"
          @input="optionalText(draft, 'description', valueOf($event))"
        />
      </label>
      <label v-if="isGraph"
        >排列方向<select
          :value="draft.direction ?? ''"
          @change="optionalText(draft, 'direction', valueOf($event))"
        >
          <option value="">默认</option>
          <option value="TB">从上到下</option>
          <option value="LR">从左到右</option>
        </select></label
      >
      <p v-if="draft.id" class="uml-editor-hint">
        图表 ID：<code>{{ draft.id }}</code>
      </p>
    </section>

    <template v-if="isGraph">
      <section v-show="sectionMatches(draft.nodes)" class="uml-editor-section" aria-label="节点编辑">
        <div class="uml-editor-heading">
          <h3>节点（{{ draft.nodes?.length ?? 0 }}）</h3>
          <button type="button" @click="addNode">＋ 节点</button>
        </div>
        <details
          v-for="(node, index) in draft.nodes"
          v-show="matches(node)"
          :data-editor-key="elementKey(node)"
          :key="node.id"
          class="uml-editor-card"
          :open="expanded ?? false"
        >
          <summary>
            {{ index + 1 }}. {{ node.label || "未命名节点" }}
            <code>{{ node.id }}</code>
          </summary>
          <div class="uml-editor-card__body">
            <label>名称<input v-model="node.label" type="text" /></label>
            <label
              >节点类型<select
                :value="node.kind ?? ''"
                @change="optionalText(node, 'kind', valueOf($event))"
              >
                <option value="">默认</option>
                <option v-for="kind in nodeKinds" :key="kind" :value="kind">
                  {{ kindLabels[kind] }} · {{ kind }}
                </option>
              </select></label
            >
            <label
              >详情<textarea
                :value="node.detail ?? ''"
                rows="2"
                @input="optionalText(node, 'detail', valueOf($event))"
              />
            </label>
            <label
              >构造型<input
                :value="node.stereotype ?? ''"
                type="text"
                placeholder="例如 service"
                @input="optionalText(node, 'stereotype', valueOf($event))"
            /></label>
            <div class="uml-editor-grid">
              <label v-if="draft.type !== 'swimlane'"
                >所属分组<select
                  :value="node.group ?? ''"
                  @change="membership(node, 'group', valueOf($event))"
                >
                  <option value="">不分组</option>
                  <option
                    v-for="group in draft.groups"
                    :key="group.id"
                    :value="group.id"
                  >
                    {{ group.label }} ({{ group.id }})
                  </option>
                </select></label
              >
              <label
                >所属泳道<select
                  :value="node.lane ?? ''"
                  @change="membership(node, 'lane', valueOf($event))"
                >
                  <option v-if="draft.type !== 'swimlane'" value="">
                    无泳道
                  </option>
                  <option
                    v-for="lane in draft.lanes"
                    :key="lane.id"
                    :value="lane.id"
                  >
                    {{ lane.label }} ({{ lane.id }})
                  </option>
                </select></label
              >
            </div>
            <details
              class="uml-editor-subsection"
              :open="
                expanded ?? (node.kind === 'class' ||
                node.kind === 'interface' ||
                draft.type === 'class')
              "
            >
              <summary>属性与操作</summary>
              <div class="uml-editor-heading">
                <strong>属性</strong
                ><button type="button" @click="addMember(node, 'attributes')">
                  ＋ 属性
                </button>
              </div>
              <div
                v-for="(_attribute, memberIndex) in node.attributes"
                :key="memberIndex"
                class="uml-editor-inline"
              >
                <input
                  v-model="node.attributes![memberIndex]"
                  type="text"
                  :aria-label="`${node.label} 属性 ${memberIndex + 1}`"
                /><button
                  type="button"
                  class="uml-editor-danger"
                  :aria-label="`删除属性 ${memberIndex + 1}`"
                  @click="node.attributes!.splice(memberIndex, 1)"
                >
                  删除
                </button>
              </div>
              <div class="uml-editor-heading">
                <strong>操作 / 方法</strong
                ><button type="button" @click="addMember(node, 'operations')">
                  ＋ 操作
                </button>
              </div>
              <div
                v-for="(_operation, memberIndex) in node.operations"
                :key="memberIndex"
                class="uml-editor-inline"
              >
                <input
                  v-model="node.operations![memberIndex]"
                  type="text"
                  :aria-label="`${node.label} 操作 ${memberIndex + 1}`"
                /><button
                  type="button"
                  class="uml-editor-danger"
                  :aria-label="`删除操作 ${memberIndex + 1}`"
                  @click="node.operations!.splice(memberIndex, 1)"
                >
                  删除
                </button>
              </div>
            </details>
            <details class="uml-editor-subsection" :open="expanded ?? false">
              <summary>单节点样式覆盖</summary>
              <p class="uml-editor-hint">
                未设置的值继承图表主题。清空数值可恢复继承。
              </p>
              <div class="uml-editor-grid">
                <ColorInput
                  v-for="field in colorFields"
                  :key="field.key"
                  :label="field.label"
                  :model-value="styleValue(node, field.key)"
                  allow-transparent
                  @update:model-value="setStyle(node, field.key, $event)"
                />
              </div>
              <div class="uml-editor-grid">
                <label v-for="field in numericFields" :key="field.key"
                  >{{ field.label
                  }}<input
                    type="number"
                    :min="field.min"
                    :max="field.max"
                    :step="field.step"
                    :value="node.style?.[field.key] ?? ''"
                    :placeholder="String(styleValue(node, field.key))"
                    @input="numericStyle(node, field.key, $event)"
                /></label>
              </div>
              <label
                >字体<input
                  :value="node.style?.fontFamily ?? ''"
                  :placeholder="styleValue(node, 'fontFamily')"
                  type="text"
                  @input="optionalStyle(node, 'fontFamily', valueOf($event))"
              /></label>
              <div class="uml-editor-grid">
                <label
                  >字形<select
                    :value="node.style?.fontStyle ?? ''"
                    @change="optionalStyle(node, 'fontStyle', valueOf($event))"
                  >
                    <option value="">继承主题</option>
                    <option value="normal">常规</option>
                    <option value="italic">斜体</option>
                  </select></label
                ><label
                  >文字装饰<select
                    :value="node.style?.textDecoration ?? ''"
                    @change="
                      optionalStyle(node, 'textDecoration', valueOf($event))
                    "
                  >
                    <option value="">继承主题</option>
                    <option value="none">无</option>
                    <option value="underline">下划线</option>
                  </select></label
                >
              </div>
              <button type="button" @click="delete node.style">
                清除该节点全部样式覆盖
              </button>
            </details>
            <button
              type="button"
              class="uml-editor-danger"
              @click="removeNode(index)"
            >
              删除节点
            </button>
          </div>
        </details>
      </section>
      <section v-show="sectionMatches(draft.edges)" class="uml-editor-section" aria-label="连线编辑">
        <div class="uml-editor-heading">
          <h3>连线（{{ draft.edges?.length ?? 0 }}）</h3>
          <button type="button" @click="addEdge">＋ 连线</button>
        </div>
        <label>连线交叉表示（当前图）
          <select
            :value="draft.layout?.edgeCrossing ?? 'bridge'"
            @change="draft.layout = { ...draft.layout, edgeCrossing: ($event.target as HTMLSelectElement).value as 'bridge' | 'plain' }"
          >
            <option value="bridge">拱桥形跳线（默认）</option>
            <option value="plain">直接交叉（无圆点）</option>
          </select>
        </label>
        <p class="uml-editor-hint">拱桥或无圆点交叉均表示不相连。</p>
        <details
          v-for="(edge, index) in draft.edges"
          v-show="matches(edge)"
          :data-editor-key="elementKey(edge)"
          :key="edge.id ?? index"
          class="uml-editor-card"
          :open="expanded ?? false"
        >
          <summary>
            <span
              >{{ index + 1 }}. <template v-if="edge.label">{{ edge.label }}</template
              ><template v-else
                >{{ edge.from }}&#32;<svg
                  class="uml-edge-arrow"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                  ><path d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg
                >&#32;{{ edge.to }}</template
              ></span
            >
            <code v-if="edge.id">{{ edge.id }}</code>
          </summary>
          <div class="uml-editor-card__body">
            <div class="uml-editor-grid">
              <label
                >起点<select v-model="edge.from">
                  <option
                    v-for="node in draft.nodes"
                    :key="node.id"
                    :value="node.id"
                  >
                    {{ node.label }} ({{ node.id }})
                  </option>
                </select></label
              ><label
                >终点<select v-model="edge.to">
                  <option
                    v-for="node in draft.nodes"
                    :key="node.id"
                    :value="node.id"
                  >
                    {{ node.label }} ({{ node.id }})
                  </option>
                </select></label
              >
            </div>
            <label
              >连线文字<input
                :value="edge.label ?? ''"
                type="text"
                @input="optionalText(edge, 'label', valueOf($event))"
            /></label>
            <label
              >关系类型<select
                :value="edge.kind ?? ''"
                @change="optionalText(edge, 'kind', valueOf($event))"
              >
                <option value="">默认</option>
                <option v-for="kind in edgeKinds" :key="kind" :value="kind">
                  {{ kindLabels[kind] }} · {{ kind }}
                </option>
              </select></label
            >
            <div class="uml-editor-grid">
              <label
                >起点标注<input
                  :value="edge.fromLabel ?? ''"
                  type="text"
                  placeholder="如 1"
                  @input="
                    optionalText(edge, 'fromLabel', valueOf($event))
                  " /></label
              ><label
                >终点标注<input
                  :value="edge.toLabel ?? ''"
                  type="text"
                  placeholder="如 0..*"
                  @input="optionalText(edge, 'toLabel', valueOf($event))"
              /></label>
            </div>
            <label class="uml-editor-checkbox"
              ><input v-model="edge.dashed" type="checkbox" />虚线</label
            >
            <button
              type="button"
              class="uml-editor-danger"
              @click="
                draft.edges!.splice(index, 1);
                error = '';
              "
            >
              删除连线
            </button>
          </div>
        </details>
      </section>
      <section v-show="sectionMatches(draft.groups)" class="uml-editor-section" aria-label="分组编辑">
        <div class="uml-editor-heading">
          <h3>分组（{{ draft.groups?.length ?? 0 }}）</h3>
          <button type="button" @click="addGroup">＋ 分组</button>
        </div>
        <details
          v-for="(group, index) in draft.groups"
          v-show="matches(group)"
          :data-editor-key="elementKey(group)"
          :key="group.id"
          class="uml-editor-card"
          :open="expanded ?? false"
        >
          <summary>{{ index + 1 }}. {{ group.label || "未命名分组" }}</summary>
          <div class="uml-editor-card__body">
            <code>{{ group.id }}</code
            ><label>分组名称<input v-model="group.label" type="text" /></label>
            <label
              >分组类型<select
                :value="group.kind ?? ''"
                @change="optionalText(group, 'kind', valueOf($event))"
              >
                <option value="">默认</option>
                <option
                  v-for="kind in ['boundary', 'package', 'node']"
                  :key="kind"
                  :value="kind"
                >
                  {{ kindLabels[kind] }} · {{ kind }}
                </option>
              </select></label
            >
            <label
              >父分组<select
                :value="group.parent ?? ''"
                @change="optionalText(group, 'parent', valueOf($event))"
              >
                <option value="">顶层分组</option>
                <option
                  v-for="parent in parentGroups(group)"
                  :key="parent.id"
                  :value="parent.id"
                >
                  {{ parent.label }} ({{ parent.id }})
                </option>
              </select></label
            >
            <button
              type="button"
              class="uml-editor-danger"
              @click="removeGroup(index)"
            >
              删除分组
            </button>
          </div>
        </details>
      </section>
      <section v-show="sectionMatches(draft.lanes)" class="uml-editor-section" aria-label="泳道编辑">
        <div class="uml-editor-heading">
          <h3>泳道（{{ draft.lanes?.length ?? 0 }}）</h3>
          <button type="button" @click="addLane">＋ 泳道</button>
        </div>
        <details
          v-for="(lane, index) in draft.lanes"
          v-show="matches(lane)"
          :data-editor-key="elementKey(lane)"
          :key="lane.id"
          class="uml-editor-card"
          :open="expanded ?? false"
        >
          <summary>{{ index + 1 }}. {{ lane.label || "未命名泳道" }}</summary>
          <div class="uml-editor-card__body">
            <code>{{ lane.id }}</code
            ><label>泳道名称<input v-model="lane.label" type="text" /></label
            ><button
              type="button"
              class="uml-editor-danger"
              @click="removeLane(index)"
            >
              删除泳道
            </button>
          </div>
        </details>
      </section>
    </template>

    <template v-else-if="draft.type === 'sequence'">
      <section v-show="sectionMatches(draft.participants)" class="uml-editor-section" aria-label="参与者编辑">
        <div class="uml-editor-heading">
          <h3>参与者（{{ draft.participants?.length ?? 0 }}）</h3>
          <button type="button" @click="addParticipant">＋ 参与者</button>
        </div>
        <details
          v-for="(participant, index) in draft.participants"
          v-show="matches(participant)"
          :data-editor-key="elementKey(participant)"
          :key="participant.id"
          class="uml-editor-card"
          :open="expanded ?? false"
        >
          <summary>{{ index + 1 }}. {{ participant.label || "未命名参与者" }}</summary>
          <div class="uml-editor-card__body">
            <code>{{ participant.id }}</code
            ><label>名称<input v-model="participant.label" type="text" /></label
            ><label
              >类型<select
                :value="participant.kind ?? ''"
                @change="optionalText(participant, 'kind', valueOf($event))"
              >
                <option value="">默认</option>
                <option
                  v-for="kind in ['participant', 'actor', 'database']"
                  :key="kind"
                  :value="kind"
                >
                  {{ kindLabels[kind] }} · {{ kind }}
                </option>
              </select></label
            ><button
              type="button"
              class="uml-editor-danger"
              @click="removeParticipant(index)"
            >
              删除参与者
            </button>
          </div>
        </details>
      </section>
      <section v-show="sectionMatches(draft.messages)" class="uml-editor-section" aria-label="消息编辑">
        <div class="uml-editor-heading">
          <h3>消息（{{ draft.messages?.length ?? 0 }}）</h3>
          <button type="button" @click="addMessage">＋ 消息</button>
        </div>
        <details
          v-for="(message, index) in draft.messages"
          v-show="matches(message)"
          :data-editor-key="elementKey(message)"
          :key="index"
          class="uml-editor-card"
          :open="expanded ?? false"
        >
          <summary>
            第 {{ index + 1 }} 条 · {{ message.label || "未命名消息" }}
          </summary>
          <div class="uml-editor-card__body">
            <div class="uml-editor-grid">
              <label
                >发送者<select v-model="message.from">
                  <option
                    v-for="participant in draft.participants"
                    :key="participant.id"
                    :value="participant.id"
                  >
                    {{ participant.label }} ({{ participant.id }})
                  </option>
                </select></label
              ><label
                >接收者<select v-model="message.to">
                  <option
                    v-for="participant in draft.participants"
                    :key="participant.id"
                    :value="participant.id"
                  >
                    {{ participant.label }} ({{ participant.id }})
                  </option>
                </select></label
              >
            </div>
            <label>消息文字<input v-model="message.label" type="text" /></label
            ><label
              >消息类型<select
                :value="message.kind ?? ''"
                @change="optionalText(message, 'kind', valueOf($event))"
              >
                <option value="">默认</option>
                <option
                  v-for="kind in [
                    'sync',
                    'async',
                    'return',
                    'create',
                    'destroy',
                  ]"
                  :key="kind"
                  :value="kind"
                >
                  {{ kindLabels[kind] }} · {{ kind }}
                </option>
              </select></label
            >
            <div class="uml-editor-grid">
              <label class="uml-editor-checkbox"
                ><input
                  v-model="message.activate"
                  type="checkbox"
                />激活接收者</label
              ><label class="uml-editor-checkbox"
                ><input
                  v-model="message.deactivate"
                  type="checkbox"
                />结束激活</label
              >
            </div>
            <button
              type="button"
              class="uml-editor-danger"
              @click="removeMessage(index)"
            >
              删除消息
            </button>
          </div>
        </details>
      </section>
      <section v-show="sectionMatches(draft.fragments)" class="uml-editor-section" aria-label="组合片段编辑">
        <div class="uml-editor-heading">
          <h3>组合片段（{{ draft.fragments?.length ?? 0 }}）</h3>
          <button type="button" @click="addFragment">＋ 片段</button>
        </div>
        <p class="uml-editor-hint">
          范围包含首尾消息。删除范围内消息前需先调整片段；删除范围前消息会自动平移片段索引。
        </p>
        <details
          v-for="(fragment, index) in draft.fragments"
          v-show="matches(fragment)"
          :data-editor-key="elementKey(fragment)"
          :key="index"
          class="uml-editor-card"
          :open="expanded ?? false"
        >
          <summary>{{ index + 1 }}. {{ fragment.label || "未命名片段" }}</summary>
          <div class="uml-editor-card__body">
            <label
              >片段类型<select
                :value="fragment.kind"
                @change="fragmentKind(fragment, valueOf($event))"
              >
                <option value="alt">alt · 条件分支</option>
                <option value="opt">opt · 可选</option>
                <option value="loop">loop · 循环</option>
                <option value="par">par · 并行</option>
              </select></label
            >
            <label
              >条件 / 标题<input v-model="fragment.label" type="text"
            /></label>
            <div class="uml-editor-grid">
              <label
                >起始消息<select v-model.number="fragment.from">
                  <option
                    v-for="(message, messageIndex) in draft.messages"
                    :key="messageIndex"
                    :value="messageIndex"
                  >
                    {{ messageIndex + 1 }} · {{ message.label }}
                  </option>
                </select></label
              ><label
                >结束消息<select v-model.number="fragment.to">
                  <option
                    v-for="(message, messageIndex) in draft.messages"
                    :key="messageIndex"
                    :value="messageIndex"
                  >
                    {{ messageIndex + 1 }} · {{ message.label }}
                  </option>
                </select></label
              >
            </div>
            <template v-if="fragment.kind === 'alt' || fragment.kind === 'par'"
              ><label
                >第二分支起始消息<select
                  :value="fragment.elseAt ?? ''"
                  @change="fragmentElse(fragment, valueOf($event))"
                >
                  <option value="">不划分第二分支</option>
                  <template
                    v-for="(message, messageIndex) in draft.messages"
                    :key="messageIndex"
                    ><option
                      v-if="
                        messageIndex > fragment.from &&
                        messageIndex <= fragment.to
                      "
                      :value="messageIndex"
                    >
                      {{ messageIndex + 1 }} · {{ message.label }}
                    </option></template
                  >
                </select></label
              ><label
                >第二分支条件<input
                  :value="fragment.elseLabel ?? ''"
                  type="text"
                  @input="
                    optionalText(fragment, 'elseLabel', valueOf($event))
                  " /></label
            ></template>
            <button
              type="button"
              class="uml-editor-danger"
              @click="
                draft.fragments!.splice(index, 1);
                error = '';
              "
            >
              删除片段
            </button>
          </div>
        </details>
      </section>
    </template>

    <template v-else-if="draft.type === 'fishbone'">
      <section v-show="matches(draft.fishbone)" class="uml-editor-section" aria-label="鱼骨分析">
        <label v-show="matches(draft.fishbone?.effect)" data-editor-key="effect" tabindex="-1"
          >结果 / 问题<input
            v-if="draft.fishbone"
            v-model="draft.fishbone.effect"
            type="text"
        /></label>
        <label v-if="draft.fishbone">鱼头样式
          <select :value="draft.fishbone.headStyle ?? 'classic'" @change="draft.fishbone.headStyle = valueOf($event) as NonNullable<DiagramSpec['fishbone']>['headStyle']">
            <option value="classic">原版鱼头（默认）</option>
            <option value="fish">弧面鱼头</option><option value="slim">细长鱼头</option>
            <option value="shark">开口鱼头</option><option value="roundfish">高身圆角</option>
            <option value="carp">水滴鱼头</option><option value="sunfish">扇面鱼头</option>
            <option value="triangle">极简三角</option><option value="rounded">胶囊标签</option>
            <option value="label">方框标签</option>
          </select>
        </label>
        <div class="uml-editor-heading">
          <h3>分析分类（{{ draft.fishbone?.categories.length ?? 0 }}）</h3>
          <button type="button" @click="addCategory">＋ 分类</button>
        </div>
        <details
          v-for="(category, categoryIndex) in draft.fishbone?.categories"
          v-show="matches(category)"
          :data-editor-key="elementKey(category)"
          :key="category.id"
          class="uml-editor-card"
          :open="expanded ?? false"
        >
          <summary>
            {{ categoryIndex + 1 }}. {{ category.label || "未命名分类" }}
            <code>{{ category.id }}</code>
          </summary>
          <div class="uml-editor-card__body">
            <label
              >分类名称<input v-model="category.label" type="text"
            /></label>
            <CauseEditor
              v-for="(cause, causeIndex) in category.causes"
              :key="causeIndex"
              :model-value="cause"
              :query="query"
              :expanded="expanded"
              :editor-key="elementKey(cause)"
              :key-for="elementKey"
              :path="`原因 ${categoryIndex + 1}.${causeIndex + 1}`"
              @update:model-value="
                updateCause(categoryIndex, causeIndex, $event)
              "
              @remove="removeCause(categoryIndex, causeIndex)"
            />
            <div class="uml-editor-heading">
              <button
                type="button"
                @click="category.causes.push({ label: '新原因' })"
              >
                ＋ 原因</button
              ><button
                type="button"
                class="uml-editor-danger"
                @click="removeCategory(categoryIndex)"
              >
                删除分类及其原因
              </button>
            </div>
          </div>
        </details>
      </section>
    </template>
    <footer class="uml-editor-actions">
      <p v-if="error" class="uml-editor-error" role="alert">{{ error }}</p>
      <div class="uml-editor-heading">
        <button type="button" :disabled="!hasChanges()" @click="resetDraft">
          重置表单</button
        ><button type="button" class="uml-editor-apply" @click="apply">
          应用表单
        </button>
      </div>
    </footer>
  </div>
</template>
