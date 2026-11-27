<script lang="ts">
export interface AddElementPayload {
  label: string;
  /** node:xxx | group | lane | participant:xxx | category */
  element: string;
  group: string;
  /** 框选中的节点 key（nodes/<i>），选择容器类型时归入新分组。 */
  memberKeys: string[];
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import VSelect from "./VSelect.vue";
import type { DiagramSpec } from "./types";

const props = defineProps<{
  open: boolean;
  spec: DiagramSpec;
  /** 当前框选集合 */
  marqueeKeys: string[];
}>();
const emit = defineEmits<{
  close: [];
  submit: [payload: AddElementPayload];
}>();

const label = ref("");
const element = ref("");
const group = ref("");

const isGraph = computed(
  () => props.spec.type !== "sequence" && props.spec.type !== "fishbone",
);
const nodeKindGroups: { label: string; types: DiagramSpec["type"][]; kinds: [string, string][] }[] = [
  {
    label: "流程元素",
    types: ["activity", "flowchart", "swimlane"],
    kinds: [
      ["action", "动作"], ["decision", "判断"], ["start", "开始"], ["end", "结束"],
      ["fork", "分叉"], ["join", "汇合"], ["terminal", "起止胶囊"], ["subroutine", "子流程"],
      ["io", "输入输出"], ["note", "注释"],
    ],
  },
  { label: "用例元素", types: ["usecase"], kinds: [["actor", "角色"], ["usecase", "用例"], ["note", "注释"]] },
  { label: "类图元素", types: ["class"], kinds: [["class", "类"], ["interface", "接口"], ["note", "注释"]] },
  { label: "状态元素", types: ["state"], kinds: [["state", "状态"], ["start", "开始"], ["end", "结束"], ["note", "注释"]] },
  {
    label: "架构元素",
    types: ["component", "package", "deployment", "architecture", "module", "logical", "development", "process", "physical", "scenario"],
    kinds: [["component", "组件"], ["package", "包"], ["database", "数据库"], ["server", "服务器"], ["queue", "队列"], ["node", "部署节点"], ["note", "注释"]],
  },
];
const nodeKinds = computed(
  () =>
    nodeKindGroups.find((group) => group.types.includes(props.spec.type))?.kinds ??
    nodeKindGroups[0]!.kinds,
);
const participantKinds: [string, string][] = [
  ["participant", "参与者"], ["actor", "角色"], ["database", "数据库"],
  ["boundary", "边界"], ["control", "控制"], ["entity", "实体"],
  ["collections", "集合"], ["queue", "队列"],
];
const memberNodes = computed(() =>
  props.marqueeKeys.filter((key) => key.startsWith("nodes/")),
);
const isContainer = computed(
  () => element.value === "group" || element.value === "lane",
);
const groups = computed(() => props.spec.groups ?? []);

function defaultElement(): string {
  if (props.spec.type === "sequence") return "participant:participant";
  if (props.spec.type === "fishbone") return "category";
  return "node:action";
}
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    label.value = "";
    group.value = "";
    element.value = defaultElement();
  },
);
function confirm(): void {
  emit("submit", {
    label: label.value.trim(),
    element: element.value,
    group: group.value,
    memberKeys: isContainer.value ? memberNodes.value : [],
  });
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-scrim" @pointerdown.self="emit('close')">
      <section class="add-dialog" role="dialog" aria-modal="true" aria-label="添加元素">
        <header class="dialog-head">
          <h2>添加元素</h2>
          <button class="icon-button dialog-close" type="button" aria-label="关闭" @click="emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18 18 6M6 6l12 12"/></svg>
          </button>
        </header>
        <div class="dialog-body add-dialog-body">
          <label class="inspector-field">
            <span>名称</span>
            <input
              v-model="label"
              class="text-input"
              type="text"
              placeholder="元素显示名称"
              autofocus
              @keydown.enter="confirm"
            />
          </label>
          <label class="inspector-field">
            <span>类型</span>
            <span class="select-wrap"><VSelect v-model="element" class="select-input">
              <template v-if="isGraph">
                <optgroup label="元素">
                  <option v-for="[kind, text] in nodeKinds" :key="kind" :value="`node:${kind}`">{{ text }}</option>
                </optgroup>
                <optgroup label="容器">
                  <option value="group">分组容器</option>
                  <option v-if="spec.type === 'swimlane'" value="lane">泳道</option>
                </optgroup>
              </template>
              <template v-else-if="spec.type === 'sequence'">
                <option v-for="[kind, text] in participantKinds" :key="kind" :value="`participant:${kind}`">{{ text }}</option>
              </template>
              <option v-else value="category">鱼骨分类</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
          </label>
          <label v-if="!isContainer && isGraph && groups.length" class="inspector-field">
            <span>所属分组</span>
            <span class="select-wrap"><VSelect v-model="group" class="select-input">
              <option value="">无分组</option>
              <option v-for="item in groups" :key="item.id" :value="item.id">{{ item.label }}</option>
            </VSelect><svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
          </label>
          <p v-if="isContainer && memberNodes.length" class="inspector-hint">
            将把当前框选的 {{ memberNodes.length }} 个节点放入新建的{{ element === 'group' ? '分组' : '泳道' }}。
          </p>
          <p v-else-if="isContainer" class="inspector-hint">
            框选若干节点后再打开此弹框，可直接把它们归入新容器。
          </p>
        </div>
        <footer class="dialog-foot">
          <button class="button button-quiet" type="button" @click="emit('close')">取消</button>
          <button class="button button-accent" type="button" @click="confirm">添加</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style>
.add-dialog {
  display: flex;
  flex-direction: column;
  width: min(400px, 100%);
  background: var(--paper, #fff);
  border-radius: var(--r-lg, 16px);
  box-shadow: var(--shadow-lg, 0 20px 60px rgb(0 0 0 / 0.25));
  overflow: hidden;
  animation: dialog-pop-in 0.18s var(--ease, ease-out);
}
.add-dialog-body {
  display: grid;
  gap: 12px;
}
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex: none;
  padding: 12px 18px;
  border-top: 1px solid var(--line, #e4e2db);
}
@media (prefers-reduced-motion: reduce) {
  .add-dialog { animation: none; }
}
</style>
