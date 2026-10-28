<script setup lang="ts">
import {
  cloneVNode,
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useAttrs,
  useId,
} from "vue";
import type { VNode, VNodeChild } from "vue";

defineOptions({ inheritAttrs: false });
const props = defineProps<{
  modelValue?: unknown;
  value?: unknown;
  disabled?: boolean;
  modelModifiers?: Record<string, boolean | undefined>;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: unknown];
  change: [event: Event];
}>();
const slots = defineSlots<{ default?: () => VNode[] }>();
const attrs = useAttrs();
const instance = getCurrentInstance();

interface Opt {
  key: number;
  value: unknown;
  label: unknown;
  text: string;
  disabled: boolean;
  group?: string;
}
interface OptGroup {
  label?: string;
  items: Opt[];
}

function textOf(children: unknown): string {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children))
    return children.map(item => textOf(item && typeof item === "object" ? (item as VNode).children : item)).join("");
  return "";
}
function flatOptions(): Opt[] {
  const out: Opt[] = [];
  const walk = (nodes: VNode[] | undefined, group?: string): void => {
    for (const node of nodes ?? []) {
      if (!node || typeof node !== "object") continue;
      if (node.type === "option") {
        const props = (node.props ?? {}) as Record<string, unknown>;
        const text = textOf(node.children);
        out.push({
          key: out.length,
          value: "value" in props ? props.value : text,
          label: node.children,
          text,
          disabled: props.disabled !== undefined && props.disabled !== false,
          group,
        });
      } else if (node.type === "optgroup") {
        walk(node.children as VNode[], String(((node.props ?? {}) as Record<string, unknown>).label ?? ""));
      } else if (Array.isArray(node.children)) {
        walk(node.children as VNode[], group);
      }
    }
  };
  walk(slots.default?.());
  return out;
}
function groups(): OptGroup[] {
  const result: OptGroup[] = [];
  for (const option of flatOptions()) {
    const last = result[result.length - 1];
    if (last && last.label === option.group) last.items.push(option);
    else result.push({ label: option.group, items: [option] });
  }
  return result;
}
function currentValue(): unknown {
  const bound = instance?.vnode.props as Record<string, unknown> | null;
  return bound && "modelValue" in bound ? props.modelValue : props.value;
}
function selectedOption(): Opt | undefined {
  const current = currentValue();
  return flatOptions().find(option => option.value === current);
}
function display(): unknown {
  const selected = selectedOption();
  if (selected) return selected.label;
  const current = currentValue();
  if (current != null && current !== "") return String(current);
  return flatOptions()[0]?.label ?? "";
}

const VNodes = (props: { nodes?: unknown }): VNodeChild => {
  const nodes = props.nodes;
  if (Array.isArray(nodes)) return nodes.map(node => cloneVNode(node as VNode));
  if (nodes && typeof nodes === "object") return cloneVNode(nodes as VNode);
  return (nodes ?? "") as VNodeChild;
};

const rootEl = ref<HTMLElement>();
const selectEl = ref<HTMLSelectElement>();
const triggerEl = ref<HTMLButtonElement>();
const popEl = ref<HTMLElement>();
const popupHost = ref<HTMLElement>();
const open = ref(false);
const active = ref(-1);
const suppress = ref(false);
const uid = useId();
const popId = `${uid}-pop`;
const optId = (index: number): string => `${uid}-opt-${index}`;

const derivedLabel = ref("");
const ariaLabel = computed(() => ((attrs["aria-label"] as string | undefined) ?? derivedLabel.value) || undefined);
const nativeAttrs = computed(() => {
  const out: Record<string, unknown> = {};
  for (const key of ["id", "name", "form", "required"]) if (key in attrs) out[key] = attrs[key];
  return out;
});
const triggerAttrs = computed(() => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (["id", "name", "form", "required"].includes(key)) continue;
    out[key] = value;
  }
  return out;
});

function place(): void {
  const trigger = triggerEl.value;
  const pop = popEl.value;
  if (!trigger || !pop) return;
  const rect = trigger.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    hide(false);
    return;
  }
  pop.style.minWidth = `${rect.width}px`;
  const below = innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  const flip = below < Math.min(160, pop.offsetHeight) && above > below;
  pop.style.maxHeight = `${Math.max(96, Math.min(256, (flip ? above : below) - 4))}px`;
  const height = pop.offsetHeight;
  const top = Math.min(
    Math.max(8, flip ? rect.top - height - 4 : rect.bottom + 4),
    Math.max(8, innerHeight - height - 8),
  );
  const left = Math.min(Math.max(8, rect.left), Math.max(8, innerWidth - pop.offsetWidth - 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}
function outside(event: Event): void {
  const target = event.target as Node;
  if (rootEl.value?.contains(target) || popEl.value?.contains(target)) return;
  hide(false);
}
async function show(): Promise<void> {
  if (props.disabled || open.value) return;
  open.value = true;
  const options = flatOptions();
  const selected = options.findIndex(option => option.value === currentValue());
  active.value = selected >= 0 ? selected : options.findIndex(option => !option.disabled);
  await nextTick();
  place();
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
  popEl.value?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
}
function hide(focus: boolean): void {
  if (!open.value) return;
  open.value = false;
  document.removeEventListener("pointerdown", outside, true);
  window.removeEventListener("scroll", place, true);
  window.removeEventListener("resize", place);
  if (focus) triggerEl.value?.focus();
}
function toggle(): void {
  if (suppress.value) {
    suppress.value = false;
    return;
  }
  if (open.value) hide(true);
  else void show();
}
function scrollActive(): void {
  nextTick(() => popEl.value?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" }));
}
function step(delta: number): void {
  const options = flatOptions();
  if (!options.length) return;
  let index = active.value;
  for (let n = 0; n < options.length; n++) {
    index = (index + delta + options.length) % options.length;
    if (!options[index]!.disabled) {
      active.value = index;
      scrollActive();
      break;
    }
  }
}
function commit(option: Opt | undefined, focus = true): void {
  if (!option || option.disabled) return;
  const select = selectEl.value;
  if (select) {
    select.value = String(option.value ?? "");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  hide(focus);
}
let typed = "";
let typedTimer: ReturnType<typeof setTimeout> | undefined;
function typeahead(char: string): void {
  const options = flatOptions();
  clearTimeout(typedTimer);
  typed += char.toLocaleLowerCase();
  typedTimer = setTimeout(() => (typed = ""), 600);
  for (let n = 1; n <= options.length; n++) {
    const index = (active.value + n) % options.length;
    if (!options[index]!.disabled && options[index]!.text.trim().toLocaleLowerCase().startsWith(typed)) {
      active.value = index;
      scrollActive();
      break;
    }
  }
}
function onKey(event: KeyboardEvent): void {
  if (!open.value) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      suppress.value = true;
      void show();
    }
    return;
  }
  const options = flatOptions();
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      step(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      step(-1);
      break;
    case "Home":
      event.preventDefault();
      active.value = 0;
      scrollActive();
      break;
    case "End":
      event.preventDefault();
      active.value = options.length - 1;
      scrollActive();
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      suppress.value = true;
      commit(options[active.value]);
      break;
    case "Escape":
      event.preventDefault();
      event.stopPropagation();
      hide(true);
      break;
    case "Tab":
      commit(options[active.value], false);
      break;
    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) typeahead(event.key);
  }
}
function forward(event: Event): void {
  const select = selectEl.value;
  if (!select) return;
  const options = flatOptions();
  const index = select.selectedIndex;
  const raw = index >= 0 && index < options.length ? options[index]!.value : select.value;
  emit("update:modelValue", props.modelModifiers?.number ? Number(raw) : raw);
  emit("change", event);
}
function refocus(): void {
  if (document.activeElement === selectEl.value) triggerEl.value?.focus();
}

const labelCleanups: Array<() => void> = [];
onMounted(() => {
  popupHost.value = (rootEl.value?.closest(".diagram-canvas") as HTMLElement | null) ?? document.body;
  const select = selectEl.value;
  const label = select?.labels?.[0];
  if (!label) return;
  const onClick = (event: MouseEvent): void => {
    const target = event.target as Node;
    if (target === triggerEl.value || triggerEl.value?.contains(target)) return;
    event.preventDefault();
    triggerEl.value?.focus();
  };
  label.addEventListener("click", onClick);
  labelCleanups.push(() => label.removeEventListener("click", onClick));
  if (!ariaLabel.value) {
    const clone = label.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".select-wrap, .v-select, [aria-hidden='true'], .field-help").forEach(node => node.remove());
    const name = clone.textContent?.trim() ?? "";
    if (name) derivedLabel.value = name;
  }
});
onBeforeUnmount(() => {
  hide(false);
  labelCleanups.forEach(cleanup => cleanup());
});
</script>

<template>
  <span ref="rootEl" class="v-select">
    <select
      ref="selectEl"
      class="v-select-native"
      v-bind="nativeAttrs"
      :value="String(currentValue() ?? '')"
      :disabled="disabled"
      aria-hidden="true"
      tabindex="-1"
      @change="forward"
      @mousedown.prevent
      @click.prevent
      @keydown.prevent
      @focus="refocus"
      ><slot /></select
    ><button
      ref="triggerEl"
      type="button"
      class="v-select-trigger"
      v-bind="triggerAttrs"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      :aria-controls="open ? popId : undefined"
      :aria-activedescendant="open && active >= 0 ? optId(active) : undefined"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="onKey"
      ><span class="v-select-value"><VNodes :nodes="display()" /></span></button
    ><Teleport v-if="open && popupHost" :to="popupHost"
      ><div :id="popId" ref="popEl" class="v-select-pop" role="listbox" :aria-label="ariaLabel" tabindex="-1"
        ><template v-for="(group, groupIndex) in groups()" :key="groupIndex"
          ><div v-if="group.label !== undefined" class="v-select-group">{{ group.label }}</div
          ><div
            v-for="option in group.items"
            :id="optId(option.key)"
            :key="option.key"
            class="v-select-opt"
            role="option"
            :aria-selected="option.value === currentValue()"
            :aria-disabled="option.disabled || undefined"
            :data-active="option.key === active || undefined"
            @pointerenter="active = option.key"
            @click="commit(option)"
            ><span class="v-select-opt-label"><VNodes :nodes="option.label" /></span
            ><svg class="v-select-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div
        ></template
      ></div
    ></Teleport>
  </span>
</template>

<style>
.v-select {
  position: relative;
  display: block;
  min-width: 0;
}
.v-select-native {
  position: absolute;
  inset: 0;
  width: 100%;
  min-height: 0;
  padding: 0;
  border: 0;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}
.v-select .v-select-trigger {
  display: block;
  width: 100%;
  min-width: 0;
  padding-right: 30px;
  text-align: left;
  cursor: pointer;
}
.v-select .v-select-value {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.v-select-pop {
  position: fixed;
  z-index: 80;
  min-width: 120px;
  max-height: 256px;
  overflow: auto;
  padding: 4px;
  background: var(--paper, #fff);
  border: 1px solid var(--line, #e4e2db);
  border-radius: var(--r-sm, 9px);
  box-shadow: var(--shadow-md, 0 4px 16px rgb(0 0 0 / 0.12));
  font-size: 13px;
  color: var(--ink, #20242c);
  animation: v-select-pop-in 0.12s var(--ease, ease-out);
}
@keyframes v-select-pop-in {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
}
.v-select-group {
  padding: 6px 10px 3px;
  font-size: 11px;
  color: var(--faint, #969da9);
  letter-spacing: 0.03em;
}
.v-select-opt {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 5px 28px 5px 10px;
  border-radius: var(--r-xs, 6px);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.v-select-opt:hover,
.v-select-opt[data-active] {
  background: var(--paper-2, #f6f5f1);
}
.v-select-opt[aria-selected="true"] {
  background: var(--accent-soft, #e9f4f0);
  color: var(--accent, #0d6e55);
  font-weight: 600;
}
.v-select-opt[aria-disabled="true"] {
  color: var(--faint, #969da9);
  cursor: default;
}
.v-select-opt-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.v-select-check {
  position: absolute;
  right: 8px;
  width: 14px;
  height: 14px;
  color: var(--accent, #0d6e55);
  opacity: 0;
  flex-shrink: 0;
}
.v-select-opt[aria-selected="true"] .v-select-check {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .v-select-pop {
    animation: none;
  }
}
</style>
