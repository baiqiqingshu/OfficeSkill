<script setup lang="ts">
import { useId } from "vue";
import type { FishboneCause } from "./types";
import "./editor.css";

const props = withDefaults(
  defineProps<{ modelValue: FishboneCause; path?: string }>(),
  { path: "原因" },
);
const emit = defineEmits<{
  "update:modelValue": [value: FishboneCause];
  remove: [];
}>();
const inputId = `uml-cause-${useId()}`;
function rename(label: string): void {
  emit("update:modelValue", { ...props.modelValue, label });
}
function addChild(): void {
  emit("update:modelValue", {
    ...props.modelValue,
    children: [...(props.modelValue.children ?? []), { label: "新子原因" }],
  });
}
function updateChild(index: number, value: FishboneCause): void {
  const children = [...(props.modelValue.children ?? [])];
  children[index] = value;
  emit("update:modelValue", { ...props.modelValue, children });
}
function removeChild(index: number): void {
  const children = [...(props.modelValue.children ?? [])];
  children.splice(index, 1);
  emit("update:modelValue", { ...props.modelValue, children });
}
</script>

<template>
  <div class="uml-cause-editor">
    <div class="uml-cause-editor__row">
      <label :for="inputId">{{ path }}</label>
      <input
        :id="inputId"
        type="text"
        :value="modelValue.label"
        @input="rename(($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        :aria-label="`${path}：添加子原因`"
        @click="addChild"
      >
        ＋ 子原因
      </button>
      <button
        type="button"
        class="uml-editor-danger"
        :aria-label="`${path}：删除原因及其子原因`"
        @click="emit('remove')"
      >
        删除
      </button>
    </div>
    <div v-if="modelValue.children?.length" class="uml-cause-editor__children">
      <CauseEditor
        v-for="(child, index) in modelValue.children"
        :key="index"
        :model-value="child"
        :path="`${path}.${index + 1}`"
        @update:model-value="updateChild(index, $event)"
        @remove="removeChild(index)"
      />
    </div>
  </div>
</template>
