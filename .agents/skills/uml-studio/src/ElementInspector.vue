<script setup lang="ts">
import { computed } from "vue";
import ColorInput from "./ColorInput.vue";
import VSelect from "./VSelect.vue";
import type {
  DiagramEdge,
  DiagramNode,
  DiagramSpec,
  EdgeArrow,
  FishboneCause,
  Fragment,
  Message,
  Participant,
  Theme,
} from "./types";

const props = defineProps<{
  spec: DiagramSpec;
  selectedKeys: string[];
  loading?: boolean;
  /** 即时写回：检查器字段的每次修改都通过它应用到画布。 */
  onUpdate: (change: (spec: DiagramSpec) => void) => void;
  /** 可选的合并提交通道：文本输入等高频修改走这里，由宿主防抖合并。 */
  onUpdateDebounced?: (change: (spec: DiagramSpec) => void) => void;
}>();
const emit = defineEmits<{ "full-edit": []; delete: [keys: string[]] }>();

const key = computed(() =>
  props.selectedKeys.length === 1 ? props.selectedKeys[0]! : "",
);
const segments = computed(() => key.value.split("/"));
const family = computed(() => segments.value[0] ?? "");
const index = computed(() => Number(segments.value[1] ?? -1));

/* ---------- 元素寻址：与画布 data-editor-key 一致 ---------- */
type Resolved = { kind: string; label: string; get(spec: DiagramSpec): unknown };
function resolveTarget(spec: DiagramSpec): Resolved | undefined {
  const [field, raw] = segments.value;
  const i = index.value;
  switch (field) {
    case "nodes":
      return spec.nodes?.[i]
        ? { kind: "node", label: "节点", get: (s) => s.nodes?.[i] }
        : undefined;
    case "edges":
      return spec.edges?.[i]
        ? { kind: "edge", label: "连线", get: (s) => s.edges?.[i] }
        : undefined;
    case "groups":
      return spec.groups?.[i]
        ? { kind: "group", label: "分组", get: (s) => s.groups?.[i] }
        : undefined;
    case "lanes":
      return spec.lanes?.[i]
        ? { kind: "lane", label: "泳道", get: (s) => s.lanes?.[i] }
        : undefined;
    case "participants":
      return spec.participants?.[i]
        ? {
            kind: "participant",
            label: "参与者",
            get: (s) => s.participants?.[i],
          }
        : undefined;
    case "messages":
      return spec.messages?.[i]
        ? { kind: "message", label: "消息", get: (s) => s.messages?.[i] }
        : undefined;
    case "fragments":
      return spec.fragments?.[i]
        ? { kind: "fragment", label: "组合片段", get: (s) => s.fragments?.[i] }
        : undefined;
    case "boxes":
      return spec.boxes?.[i]
        ? { kind: "box", label: "参与者分组框", get: (s) => s.boxes?.[i] }
        : undefined;
    case "effect":
      return spec.fishbone
        ? { kind: "effect", label: "鱼骨结果", get: (s) => s.fishbone }
        : undefined;
    case "categories": {
      // categories/<i> 是分类；categories/<i>/causes/<j>/children/<k>… 是原因与子原因
      if (!spec.fishbone?.categories[i]) return undefined;
      const walk = (s: DiagramSpec): unknown => {
        let cursor: any = s.fishbone?.categories[i];
        for (let d = 2; cursor && d + 1 < segments.value.length; d += 2)
          cursor = cursor[segments.value[d] === "children" ? "children" : "causes"]?.[
            Number(segments.value[d + 1])
          ];
        return cursor;
      };
      if (!walk(spec)) return undefined;
      return segments.value.length <= 2
        ? { kind: "category", label: "鱼骨分类", get: (s) => s.fishbone?.categories[i] }
        : { kind: "cause", label: "鱼骨原因", get: walk };
    }
    default:
      return undefined;
  }
}
const target = computed(() => resolveTarget(props.spec));
const item = computed(() => target.value?.get(props.spec));

function patch(mutate: (item: any) => void): void {
  const found = target.value;
  if (!found) return;
  props.onUpdate((spec) => {
    const draft = found.get(spec);
    if (draft) mutate(draft);
  });
}
/** 文本输入的防抖提交：选中目标在提交时重新解析，避免引用过期。 */
function dpatch(mutate: (item: any) => void): void {
  const found = target.value;
  if (!found) return;
  const commit = props.onUpdateDebounced ?? props.onUpdate;
  commit((spec) => {
    const draft = found.get(spec);
    if (draft) mutate(draft);
  });
}
function text<K extends string>(field: K) {
  return (event: Event) =>
    patch((item: Record<K, unknown>) => {
      const value = (event.target as HTMLInputElement).value;
      if (value === "") delete item[field];
      else item[field] = value;
    });
}
function dtext<K extends string>(field: K) {
  return (event: Event) => {
    const value = (event.target as HTMLInputElement).value;
    dpatch((item: Record<K, unknown>) => {
      if (value === "") delete item[field];
      else item[field] = value;
    });
  };
}
function check<K extends string>(field: K) {
  return (event: Event) =>
    patch((item: Record<K, unknown>) => {
      const value = (event.target as HTMLInputElement).checked;
      if (value) (item[field] as boolean) = true;
      else delete item[field];
    });
}
function nodeStyle(key: keyof Theme, value: string | number | undefined): void {
  patch((node: DiagramNode) => {
    const style = { ...node.style };
    if (value === undefined || value === "") delete style[key];
    else (style as Record<string, unknown>)[key] = value;
    if (Object.keys(style).length) node.style = style;
    else delete node.style;
  });
}

/* ---------- 类型候选 ---------- */
const nodeKindGroups: { label: string; types: DiagramSpec["type"][]; kinds: string[] }[] = [
  {
    label: "流程",
    types: ["activity", "flowchart", "swimlane"],
    kinds: ["action", "decision", "start", "end", "fork", "join", "terminal", "subroutine", "io", "hexagon", "circle", "trapezoid", "note", "image"],
  },
  { label: "用例", types: ["usecase"], kinds: ["actor", "usecase", "note", "image"] },
  { label: "类图", types: ["class"], kinds: ["class", "interface", "note", "image"] },
  { label: "状态", types: ["state"], kinds: ["state", "start", "end", "note", "image"] },
  {
    label: "架构",
    types: ["component", "package", "deployment", "architecture", "module", "logical", "development", "process", "physical", "scenario"],
    kinds: ["component", "package", "database", "server", "queue", "node", "note", "image"],
  },
];
const kindLabels: Record<string, string> = {
  action: "动作", decision: "判断", start: "开始", end: "结束", fork: "分叉", join: "汇合",
  actor: "角色", usecase: "用例", class: "类", interface: "接口", component: "组件",
  package: "包", database: "数据库", server: "服务器", queue: "队列", state: "状态",
  note: "注释", terminal: "起止胶囊", subroutine: "子流程", io: "输入输出",
  hexagon: "六边形", circle: "圆形", trapezoid: "梯形", node: "部署节点",
  image: "图片",
  flow: "流程", association: "关联", dependency: "依赖", include: "包含", extend: "扩展",
  inheritance: "继承", realization: "实现", aggregation: "聚合", composition: "组合",
  sync: "同步", async: "异步", return: "返回", create: "创建", destroy: "销毁",
  divider: "分割线", participant: "参与者", boundary: "边界", control: "控制",
  entity: "实体", collections: "集合",
  filled: "实心箭头", open: "空心箭头", none: "无箭头", cross: "叉号",
  arrow: "箭头", triangle: "三角", left: "左侧", right: "右侧", over: "覆盖",
  alt: "alt 分支", opt: "opt 可选", loop: "loop 循环", par: "par 并行",
  critical: "critical 关键", break: "break 中断", rect: "rect 区域",
};
const nodeKinds = computed(() => {
  const group = nodeKindGroups.find((g) => g.types.includes(props.spec.type));
  return group?.kinds ?? nodeKindGroups[0]!.kinds;
});
const edgeKinds = ["flow", "association", "dependency", "include", "extend", "inheritance", "realization", "aggregation", "composition"];
const arrowKinds: EdgeArrow[] = ["none", "arrow", "open", "triangle", "circle", "cross"];
const messageKinds = ["sync", "async", "return", "create", "destroy", "note", "divider"];
const messageArrows = ["filled", "open", "none", "cross"];
const participantKinds = ["participant", "actor", "database", "boundary", "control", "entity", "collections", "queue"];
const fragmentKinds = ["alt", "opt", "loop", "par", "critical", "break", "rect"];
const groupKinds = ["boundary", "package", "node"];

const groups = computed(() => props.spec.groups ?? []);
const lanes = computed(() => props.spec.lanes ?? []);
const node = computed(() => (target.value?.kind === "node" ? (item.value as DiagramNode) : undefined));
const edge = computed(() => (target.value?.kind === "edge" ? (item.value as DiagramEdge) : undefined));
const message = computed(() => (target.value?.kind === "message" ? (item.value as Message) : undefined));
const participant = computed(() => (target.value?.kind === "participant" ? (item.value as Participant) : undefined));
const fragment = computed(() => (target.value?.kind === "fragment" ? (item.value as Fragment) : undefined));

const imageSrcSummary = computed(() => {
  const src = node.value?.src;
  if (!src) return "";
  const mime = /^data:image\/[^;,]+/.exec(src)?.[0] ?? "data:image/…";
  return `${mime.replace("data:", "")} · 约 ${Math.round((src.length * 3) / 4 / 1024)} KB`;
});
function numberField<K extends string>(field: K) {
  return (event: Event) => {
    const raw = (event.target as HTMLInputElement).value;
    const value = Number(raw);
    dpatch((item: Record<K, unknown>) => {
      if (raw === "" || !Number.isFinite(value)) delete item[field];
      else item[field] = Math.min(10000, Math.max(8, Math.round(value)));
    });
  };
}
function setTitle(event: Event): void {
  const value = (event.target as HTMLInputElement).value.trim();
  if (value)
    (props.onUpdateDebounced ?? props.onUpdate)(
      (spec) => void (spec.title = value),
    );
}
function setDescription(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  (props.onUpdateDebounced ?? props.onUpdate)((spec) => {
    if (value === "") delete spec.description;
    else spec.description = value;
  });
}
function removeSelection(): void {
  emit("delete", [...props.selectedKeys]);
}
</script>

<template>
  <div class="element-inspector">
    <template v-if="selectedKeys.length > 1">
      <div class="inspector-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" stroke-dasharray="2.5 2.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" stroke-dasharray="2.5 2.5"/></svg>
        <strong>已选中 {{ selectedKeys.length }} 个元素</strong>
        <p>多选状态不支持逐字段编辑。可拖动任一元素整体移动，或按 Delete 删除全部所选。</p>
        <button class="button button-outline danger-button" type="button" :disabled="loading" @click="removeSelection">删除所选</button>
      </div>
    </template>

    <template v-else-if="!target || !item">
      <div class="inspector-section">
        <div class="inspector-heading"><h3>图表属性</h3></div>
        <label class="inspector-field">
          <span>标题</span>
          <input class="text-input" type="text" :value="spec.title" :disabled="loading" @input="setTitle" />
        </label>
        <label class="inspector-field">
          <span>说明</span>
          <textarea class="text-input" rows="3" :value="spec.description ?? ''" :disabled="loading" placeholder="为这张图补充一句说明" @input="setDescription" />
        </label>
      </div>
      <div class="inspector-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 4 7.5 16 2-6.5 6.5-2L4 4Z"/></svg>
        <strong>点击画布中的元素进行编辑</strong>
        <p>选中节点、连线、分组、泳道或时序元素后，这里会直接显示它的字段；空白处按住拖动可框选多个元素。</p>
      </div>
    </template>

    <template v-else>
      <div class="inspector-section">
        <div class="inspector-heading">
          <h3>{{ target.label }}</h3>
          <span class="inspector-key">{{ key }}</span>
        </div>

        <!-- 节点 -->
        <template v-if="target.kind === 'node' && node">
          <label class="inspector-field"><span>名称</span
            ><input class="text-input" type="text" :value="node.label" :disabled="loading" @input="dpatch((n: DiagramNode) => (n.label = ($event.target as HTMLInputElement).value))" /></label>
          <label class="inspector-field"><span>类型</span
            ><span class="select-wrap"><VSelect class="select-input" :value="node.kind ?? ''" :disabled="loading" @change="text('kind')($event)">
              <option value="">默认</option>
              <option v-for="kind in nodeKinds" :key="kind" :value="kind">{{ kindLabels[kind] ?? kind }} · {{ kind }}</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
          <label class="inspector-field"><span>详情</span
            ><textarea class="text-input" rows="2" :value="node.detail ?? ''" :disabled="loading" @input="dtext('detail')($event)" /></label>
          <template v-if="node.kind === 'image'">
            <div class="inspector-row">
              <label class="inspector-field"><span>图片宽度</span
                ><input class="text-input" type="number" min="8" max="10000" :value="node.width ?? 240" :disabled="loading" @input="numberField('width')($event)" /></label>
              <label class="inspector-field"><span>图片高度</span
                ><input class="text-input" type="number" min="8" max="10000" :value="node.height ?? 160" :disabled="loading" @input="numberField('height')($event)" /></label>
            </div>
            <p class="inspector-hint">内嵌图片：{{ imageSrcSummary || '未设置 src' }}。在画布中 Ctrl+V 可粘贴新图片。</p>
          </template>
          <label v-if="groups.length" class="inspector-field"><span>所属分组</span
            ><span class="select-wrap"><VSelect class="select-input" :value="node.group ?? ''" :disabled="loading" @change="patch((n: DiagramNode) => { const v = ($event.target as HTMLSelectElement).value; if (v) { n.group = v; delete n.lane; } else delete n.group; })">
              <option value="">无分组</option>
              <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.label }}</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
          <label v-if="lanes.length" class="inspector-field"><span>所属泳道</span
            ><span class="select-wrap"><VSelect class="select-input" :value="node.lane ?? ''" :disabled="loading" @change="patch((n: DiagramNode) => { const v = ($event.target as HTMLSelectElement).value; if (v) { n.lane = v; delete n.group; } else delete n.lane; })">
              <option value="">无泳道</option>
              <option v-for="lane in lanes" :key="lane.id" :value="lane.id">{{ lane.label }}</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
          <div class="inspector-subheading">单节点配色</div>
          <div class="inspector-colors">
            <ColorInput :model-value="node.style?.surface ?? ''" label="填充" allow-transparent @update:model-value="nodeStyle('surface', $event)" />
            <ColorInput :model-value="node.style?.text ?? ''" label="文字" @update:model-value="nodeStyle('text', $event)" />
            <ColorInput :model-value="node.style?.border ?? ''" label="边框" @update:model-value="nodeStyle('border', $event)" />
          </div>
        </template>

        <!-- 连线 -->
        <template v-else-if="target.kind === 'edge' && edge">
          <p class="inspector-route">{{ edge.from }} → {{ edge.to }}</p>
          <label class="inspector-field"><span>标签</span
            ><input class="text-input" type="text" :value="edge.label ?? ''" :disabled="loading" @input="dtext('label')($event)" /></label>
          <label class="inspector-field"><span>关系类型</span
            ><span class="select-wrap"><VSelect class="select-input" :value="edge.kind ?? ''" :disabled="loading" @change="text('kind')($event)">
              <option value="">默认 · 流程</option>
              <option v-for="kind in edgeKinds" :key="kind" :value="kind">{{ kindLabels[kind] ?? kind }} · {{ kind }}</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
          <div class="inspector-row">
            <label class="inspector-field"><span>终点箭头</span
              ><span class="select-wrap"><VSelect class="select-input" :value="edge.arrow ?? ''" :disabled="loading" @change="text('arrow')($event)">
                <option value="">默认</option>
                <option v-for="arrow in arrowKinds" :key="arrow" :value="arrow">{{ kindLabels[arrow] ?? arrow }}</option>
              </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
            <label class="inspector-field"><span>起点箭头</span
              ><span class="select-wrap"><VSelect class="select-input" :value="edge.startArrow ?? ''" :disabled="loading" @change="text('startArrow')($event)">
                <option value="">默认</option>
                <option v-for="arrow in arrowKinds" :key="arrow" :value="arrow">{{ kindLabels[arrow] ?? arrow }}</option>
              </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
          </div>
          <div class="inspector-row">
            <label class="inspector-field"><span>起点标签</span
              ><input class="text-input" type="text" :value="edge.fromLabel ?? ''" :disabled="loading" @input="dtext('fromLabel')($event)" /></label>
            <label class="inspector-field"><span>终点标签</span
              ><input class="text-input" type="text" :value="edge.toLabel ?? ''" :disabled="loading" @input="dtext('toLabel')($event)" /></label>
          </div>
          <label class="inspector-check"><input type="checkbox" :checked="edge.dashed === true" :disabled="loading" @change="check('dashed')($event)" /><span>虚线</span></label>
          <label class="inspector-check"><input type="checkbox" :checked="edge.thick === true" :disabled="loading" @change="check('thick')($event)" /><span>粗线</span></label>
          <p class="inspector-hint">在画布上选中连线可拖动途经点、双击添加途经点，Esc 取消。</p>
        </template>

        <!-- 分组 / 泳道 -->
        <template v-else-if="target.kind === 'group'">
          <label class="inspector-field"><span>名称</span
            ><input class="text-input" type="text" :value="(item as { label: string }).label" :disabled="loading" @input="dpatch((g: { label: string }) => (g.label = ($event.target as HTMLInputElement).value))" /></label>
          <label class="inspector-field"><span>容器类型</span
            ><span class="select-wrap"><VSelect class="select-input" :value="(item as { kind?: string }).kind ?? ''" :disabled="loading" @change="text('kind')($event)">
              <option value="">默认边界</option>
              <option v-for="kind in groupKinds" :key="kind" :value="kind">{{ kindLabels[kind] ?? kind }}</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
        </template>
        <template v-else-if="target.kind === 'lane'">
          <label class="inspector-field"><span>泳道名称</span
            ><input class="text-input" type="text" :value="(item as { label: string }).label" :disabled="loading" @input="dpatch((g: { label: string }) => (g.label = ($event.target as HTMLInputElement).value))" /></label>
        </template>

        <!-- 参与者 -->
        <template v-else-if="target.kind === 'participant' && participant">
          <label class="inspector-field"><span>名称</span
            ><input class="text-input" type="text" :value="participant.label" :disabled="loading" @input="dpatch((p: Participant) => (p.label = ($event.target as HTMLInputElement).value))" /></label>
          <label class="inspector-field"><span>类型</span
            ><span class="select-wrap"><VSelect class="select-input" :value="participant.kind ?? ''" :disabled="loading" @change="text('kind')($event)">
              <option value="">默认参与者</option>
              <option v-for="kind in participantKinds" :key="kind" :value="kind">{{ kindLabels[kind] ?? kind }}</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
        </template>

        <!-- 消息 -->
        <template v-else-if="target.kind === 'message' && message">
          <p v-if="message.from || message.to" class="inspector-route">{{ message.from }} → {{ message.to }}</p>
          <label class="inspector-field"><span>标签</span
            ><input class="text-input" type="text" :value="message.label" :disabled="loading" @input="dpatch((m: Message) => (m.label = ($event.target as HTMLInputElement).value))" /></label>
          <label class="inspector-field"><span>消息类型</span
            ><span class="select-wrap"><VSelect class="select-input" :value="message.kind ?? ''" :disabled="loading" @change="text('kind')($event)">
              <option value="">默认 · 同步</option>
              <option v-for="kind in messageKinds" :key="kind" :value="kind">{{ kindLabels[kind] ?? kind }} · {{ kind }}</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
          <div class="inspector-row">
            <label class="inspector-field"><span>箭头</span
              ><span class="select-wrap"><VSelect class="select-input" :value="message.arrow ?? ''" :disabled="loading" @change="text('arrow')($event)">
                <option value="">默认</option>
                <option v-for="arrow in messageArrows" :key="arrow" :value="arrow">{{ kindLabels[arrow] ?? arrow }}</option>
              </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
            <label class="inspector-field"><span>标签位置</span
              ><span class="select-wrap"><VSelect class="select-input" :value="message.position ?? ''" :disabled="loading" @change="text('position')($event)">
                <option value="">默认</option>
                <option value="left">左侧</option>
                <option value="right">右侧</option>
                <option value="over">覆盖</option>
              </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
          </div>
          <label class="inspector-check"><input type="checkbox" :checked="message.dashed === true" :disabled="loading" @change="check('dashed')($event)" /><span>虚线</span></label>
          <label class="inspector-check"><input type="checkbox" :checked="message.bidirectional === true" :disabled="loading" @change="check('bidirectional')($event)" /><span>双向箭头</span></label>
          <label class="inspector-check"><input type="checkbox" :checked="message.activate === true" :disabled="loading" @change="check('activate')($event)" /><span>激活接收方</span></label>
          <label class="inspector-check"><input type="checkbox" :checked="message.deactivate === true" :disabled="loading" @change="check('deactivate')($event)" /><span>结束激活</span></label>
        </template>

        <!-- 组合片段 -->
        <template v-else-if="target.kind === 'fragment' && fragment">
          <label class="inspector-field"><span>类型</span
            ><span class="select-wrap"><VSelect class="select-input" :value="fragment.kind" :disabled="loading" @change="patch((f: Fragment) => (f.kind = ($event.target as HTMLSelectElement).value as Fragment['kind']))">
              <option v-for="kind in fragmentKinds" :key="kind" :value="kind">{{ kindLabels[kind] ?? kind }}</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></label>
          <label class="inspector-field"><span>标签</span
            ><input class="text-input" type="text" :value="fragment.label" :disabled="loading" @input="dpatch((f: Fragment) => (f.label = ($event.target as HTMLInputElement).value))" /></label>
          <p class="inspector-hint">片段范围（覆盖第 {{ fragment.from + 1 }}–{{ fragment.to + 1 }} 条消息）请在“完整编辑”中调整。</p>
        </template>

        <!-- 参与者分组框 -->
        <template v-else-if="target.kind === 'box'">
          <label class="inspector-field"><span>名称</span
            ><input class="text-input" type="text" :value="(item as { label: string }).label" :disabled="loading" @input="dpatch((b: { label: string }) => (b.label = ($event.target as HTMLInputElement).value))" /></label>
          <div class="inspector-colors">
            <ColorInput :model-value="(item as { color?: string }).color ?? ''" label="框颜色" allow-transparent @update:model-value="patch((b: { color?: string }) => { if ($event) b.color = $event; else delete b.color; })" />
          </div>
        </template>

        <!-- 鱼骨图 -->
        <template v-else-if="target.kind === 'category' || target.kind === 'cause'">
          <label class="inspector-field"><span>{{ target.kind === 'category' ? '分类名称' : '原因' }}</span
            ><input class="text-input" type="text" :value="(item as { label: string }).label" :disabled="loading" @input="dpatch((c: { label: string }) => (c.label = ($event.target as HTMLInputElement).value))" /></label>
          <p v-if="target.kind === 'cause'" class="inspector-hint">子原因（分叉分支）请在“完整编辑”中调整。</p>
        </template>
        <template v-else-if="target.kind === 'effect'">
          <label class="inspector-field"><span>鱼头结果</span
            ><input class="text-input" type="text" :value="(item as { effect: string }).effect" :disabled="loading" @input="dpatch((f: { effect: string }) => (f.effect = ($event.target as HTMLInputElement).value))" /></label>
        </template>

        <div class="inspector-actions">
          <button class="button button-outline danger-button" type="button" :disabled="loading" @click="removeSelection">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="M19 6l-.8 12.4a2 2 0 0 1-2 1.6H7.8a2 2 0 0 1-2-1.6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
            删除此{{ target.label }}
          </button>
        </div>
      </div>
    </template>

    <div class="inspector-footer">
      <button class="text-button" type="button" @click="emit('full-edit')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/></svg>
        完整编辑（表单 / JSON）
      </button>
    </div>
  </div>
</template>

<style>
.element-inspector {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  font-size: 13px;
  color: var(--ink);
}
.inspector-section {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  min-width: 0;
}
.inspector-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}
.inspector-heading h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.inspector-key {
  color: var(--faint);
  font-size: 11px;
  font-family: ui-monospace, Consolas, monospace;
}
.inspector-field {
  display: grid;
  gap: 5px;
  min-width: 0;
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}
.inspector-field textarea {
  resize: vertical;
}
.inspector-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  min-width: 0;
}
.inspector-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink);
}
.inspector-check input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--accent);
}
.inspector-subheading {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.inspector-colors {
  display: grid;
  gap: 10px;
}
.inspector-route {
  margin: 0;
  padding: 6px 9px;
  border-radius: var(--r-xs);
  background: var(--paper-2);
  color: var(--muted);
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
  overflow-wrap: anywhere;
}
.inspector-hint {
  margin: 0;
  color: var(--faint);
  font-size: 12px;
  line-height: 1.7;
}
.inspector-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.inspector-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 26px 20px;
  text-align: center;
  color: var(--muted);
}
.inspector-empty svg {
  width: 30px;
  height: 30px;
  color: var(--faint);
}
.inspector-empty strong {
  font-size: 13px;
  color: var(--ink);
}
.inspector-empty p {
  margin: 0;
  font-size: 12px;
  line-height: 1.8;
}
.inspector-footer {
  margin-top: auto;
  padding: 10px 16px;
  border-top: 1px solid var(--line);
}
.inspector-footer .text-button {
  padding: 6px 0;
}
</style>
