<script lang="ts">
export interface MenuEntry {
  type?: "item" | "separator" | "heading";
  label?: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  children?: MenuEntry[];
  action?: () => void;
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{ x: number; y: number; entries: MenuEntry[] }>();
const emit = defineEmits<{ close: [] }>();

const root = ref<HTMLElement>();
const openChild = ref(-1);
const flipped = ref(false);
const pos = ref({ left: 0, top: 0 });

const style = computed(() => ({ left: `${pos.value.left}px`, top: `${pos.value.top}px` }));

function clamp(): void {
  const menu = root.value;
  if (!menu) return;
  const rect = menu.getBoundingClientRect();
  pos.value = {
    left: Math.max(8, Math.min(props.x, innerWidth - rect.width - 8)),
    top: Math.max(8, Math.min(props.y, innerHeight - rect.height - 8)),
  };
  flipped.value = props.x + rect.width + 240 > innerWidth - 8;
}

function outside(event: Event): void {
  if (root.value?.contains(event.target as Node)) return;
  emit("close");
}
function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.stopPropagation();
    emit("close");
  }
}
function run(entry: MenuEntry): void {
  if (entry.disabled || entry.children) return;
  entry.action?.();
  emit("close");
}
watch(
  () => [props.x, props.y],
  async () => {
    openChild.value = -1;
    pos.value = { left: props.x, top: props.y };
    await nextTick();
    clamp();
  },
  { immediate: true },
);
watch(
  () => props.entries,
  async () => {
    await nextTick();
    clamp();
  },
);

nextTick(() => {
  clamp();
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", clamp);
  window.addEventListener("blur", () => emit("close"), { once: true });
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside, true);
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("resize", clamp);
});
</script>

<template>
  <div
    ref="root"
    class="context-menu"
    :class="{ 'is-flipped': flipped }"
    :style="style"
    role="menu"
    @contextmenu.prevent
  >
    <template v-for="(entry, index) in entries" :key="index">
      <div v-if="entry.type === 'separator'" class="menu-separator" role="separator" />
      <div v-else-if="entry.type === 'heading'" class="menu-heading">{{ entry.label }}</div>
      <div
        v-else
        class="menu-item"
        :class="{ danger: entry.danger, 'has-children': !!entry.children }"
        role="menuitem"
        :aria-disabled="entry.disabled || undefined"
        :aria-haspopup="entry.children ? 'menu' : undefined"
        tabindex="-1"
        @pointerenter="openChild = entry.children ? index : -1"
        @click="entry.children ? (openChild = openChild === index ? -1 : index) : run(entry)"
      >
        <span class="menu-item-label">{{ entry.label }}</span>
        <span v-if="entry.hint" class="menu-item-hint">{{ entry.hint }}</span>
        <svg
          v-if="entry.children"
          class="menu-item-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        <div
          v-if="entry.children && openChild === index"
          class="context-submenu"
          role="menu"
          @pointerenter.stop
        >
          <template v-for="(child, childIndex) in entry.children" :key="childIndex">
            <div v-if="child.type === 'separator'" class="menu-separator" role="separator" />
            <div v-else-if="child.type === 'heading'" class="menu-heading">{{ child.label }}</div>
            <div
              v-else
              class="menu-item"
              :class="{ danger: child.danger }"
              role="menuitem"
              :aria-disabled="child.disabled || undefined"
              tabindex="-1"
              @click.stop="run(child)"
            >
              <span class="menu-item-label">{{ child.label }}</span>
              <span v-if="child.hint" class="menu-item-hint">{{ child.hint }}</span>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style>
.context-menu {
  position: fixed;
  z-index: 90;
  min-width: 208px;
  max-width: 320px;
  max-height: min(480px, calc(100vh - 16px));
  overflow-y: auto;
  padding: 5px;
  background: var(--paper, #fff);
  border-radius: var(--r-md, 12px);
  box-shadow: var(--shadow-lg, 0 8px 30px rgb(0 0 0 / 0.16));
  color: var(--ink, #20242c);
  font-size: 13px;
  animation: context-menu-in 0.12s var(--ease, ease-out);
}
@keyframes context-menu-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
}
.context-submenu {
  position: absolute;
  top: -6px;
  left: calc(100% - 2px);
  z-index: 91;
  min-width: 180px;
  max-height: min(440px, calc(100vh - 16px));
  overflow-y: auto;
  padding: 5px;
  background: var(--paper, #fff);
  border-radius: var(--r-md, 12px);
  box-shadow: var(--shadow-lg, 0 8px 30px rgb(0 0 0 / 0.16));
}
.context-menu.is-flipped .context-submenu {
  left: auto;
  right: calc(100% - 2px);
}
.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 6px 10px;
  border-radius: var(--r-xs, 6px);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.menu-item:hover,
.menu-item.has-children:hover {
  background: var(--paper-2, #f6f5f1);
}
.menu-item[aria-disabled="true"] {
  color: var(--faint, #969da9);
  cursor: default;
}
.menu-item[aria-disabled="true"]:hover {
  background: transparent;
}
.menu-item.danger {
  color: var(--danger, #bf4234);
}
.menu-item.danger:hover {
  background: var(--danger-soft, #fdf0ed);
}
.menu-item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.menu-item-hint {
  margin-left: auto;
  color: var(--faint, #969da9);
  font-size: 11px;
}
.menu-item-chevron {
  margin-left: auto;
  width: 13px;
  height: 13px;
  color: var(--faint, #969da9);
  flex: none;
}
.menu-separator {
  height: 1px;
  margin: 5px 8px;
  background: var(--line, #e4e2db);
}
.menu-heading {
  padding: 7px 10px 3px;
  font-size: 11px;
  color: var(--faint, #969da9);
  letter-spacing: 0.03em;
}
@media (prefers-reduced-motion: reduce) {
  .context-menu { animation: none; }
}
</style>
