# UML Studio 工作台前端重设计规范

> 本文件是 uml-studio（`.agents/skills/uml-studio`）生成式 UML 工作台 UI 的重设计契约。
> 所有实现子代理必须逐字使用本文的令牌值，不得另起色系或圆角/阴影体系。

## 1. 设计方向：「澄海工作台」

- 模式：**Operate**（工具台，用户完成任务）。克制的中性色 + 单一品牌色族，现代 SaaS 工具质感。
- 品牌语义：延续产品「海（ocean）」基因——深海洋蓝流入青碧；把复杂画清楚 = 干净、精确、透气。
- 反 AI 感：不使用紫粉渐变、不滥用磨砂玻璃、无 emoji、无渐变文字、无装饰性插画。

### 硬性规则（brief 固定）

1. 柔和弥散阴影；卡片悬停上浮（`translateY(-2px)` + 阴影加深）。
2. **渐变只允许**：品牌区（logo 方块）、主按钮、聚焦态光环、玻璃高光。其它任何元素禁渐变。
3. 磨砂玻璃（`backdrop-filter`）只允许：顶部导航栏、移动端侧栏抽屉。面板、卡片一律实色。
4. 全部中文文案；图标一律内联 SVG（stroke 风格，禁 emoji、禁 Unicode 符号当图标）。
5. 圆角卡片、圆角按钮；配色现代。
6. 离线约束：生成的 HTML 断网可用——禁远程字体/图片/CDN，字体只用系统栈。

## 2. 设计令牌（逐字使用）

```css
:root {
  /* 中性底（冷灰偏蓝纸感） */
  --bg: #eef2f6;            /* 应用背景 */
  --paper: #ffffff;         /* 卡片/面板 */
  --paper-2: #f4f8fb;       /* 凹陷面（画布底、井区、分段控件底） */
  --ink: #1b2b3a;           /* 主文字 */
  --muted: #54697d;         /* 次要文字 */
  --faint: #8ba0b3;         /* 三级文字/占位 */
  --line: #dbe4ec;          /* 平面元素描边 */
  --line-strong: #b9c9d6;   /* 悬停描边 */

  /* 品牌：海洋蓝→青碧（渐变仅用于品牌/主按钮/聚焦） */
  --brand-from: #1668b0;
  --brand-mid:  #0e93ad;
  --brand-to:   #0fa79e;
  --gradient-brand: linear-gradient(135deg, var(--brand-from) 0%, var(--brand-mid) 55%, var(--brand-to) 100%);
  --gradient-brand-hover: linear-gradient(135deg, #135a9b 0%, #0b8299 55%, #0d948f 100%);
  --accent: #0f6fa3;        /* 链接/强调实色，白底对比度 ≥4.5:1 */
  --accent-deep: #0b5b87;
  --accent-soft: #e9f4fa;   /* 选中态淡底 */
  --accent-line: #b8d9ea;   /* 淡描边 */
  --ring: rgb(14 159 180 / .30); /* 聚焦光环 */

  /* 状态 */
  --danger: #c2404f;  --danger-soft: #fdf0f2;  --danger-line: #eec4ca;
  --warning: #96650f; --warning-soft: #fbf3df;
  --success: #2e7d5b;

  /* 柔和弥散阴影（浮层只用阴影不描边） */
  --shadow-sm: 0 1px 2px rgb(20 45 66 / .05), 0 2px 6px -1px rgb(20 45 66 / .06);
  --shadow-md: 0 2px 6px -2px rgb(20 45 66 / .07), 0 10px 24px -8px rgb(20 45 66 / .10);
  --shadow-lg: 0 4px 12px -4px rgb(20 45 66 / .08), 0 24px 48px -14px rgb(20 45 66 / .18);

  /* 圆角 */
  --r-xs: 6px; --r-sm: 9px; --r-md: 12px; --r-lg: 16px; --r-pill: 999px;

  /* 动效 */
  --ease: cubic-bezier(.22, .8, .32, 1);
  --t-fast: .14s; --t: .2s;

  /* 字体（仅本机栈） */
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
    system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
```

`.uml-form-editor / .uml-color-input / .uml-cause-editor` 的 `--uml-edit-*` 变量同步映射到新令牌：

```css
--uml-edit-ink: var(--ink);      --uml-edit-muted: var(--muted);
--uml-edit-line: var(--line);    --uml-edit-accent: var(--accent);
--uml-edit-soft: var(--accent-soft);
```

## 3. 组件规则

### 3.1 顶部导航（磨砂玻璃）

- `position: sticky; top: 0; z-index: 30`，高 60px，padding `0 20px`。
- `background: rgb(255 255 255 / .72); backdrop-filter: blur(16px) saturate(1.5); -webkit-backdrop-filter: 同;` 底部分隔用 1px `rgb(219 228 236 / .8)`，不用阴影压线。
- 品牌：32px 圆角方块（`--r-sm`，`--gradient-brand` 填充，内嵌白色节点连线 SVG）+ 文字标 `UML`（700）`STUDIO`（400）+ 小号标语「把复杂，画清楚。」（保留现有文案）。
- 中间状态：`live-indicator`（8px 圆点 `--success`，可加 2s 呼吸）+「本地工作台 / 一个文件，多张图表」。
- 右侧操作：`图表列表`（移动）`导入 JSON/HTML`（outline + SVG）`保存 HTML`（渐变主按钮 + SVG）。

### 3.2 按钮体系

| 变体 | 样式 |
|---|---|
| `.button-accent` / `.button-dark`（主按钮，统一为渐变主按钮） | `--gradient-brand`，白字 600，`box-shadow: 0 1px 2px rgb(11 91 135/.30), 0 6px 16px -6px rgb(11 91 135/.45)`；hover → `--gradient-brand-hover` + `translateY(-1px)` + 阴影加深；active → `translateY(0)` |
| `.button-outline` | `--paper` 底，1px `--line`，`--ink` 字；hover → `--accent-soft` 底 + `--accent-line` 边 |
| `.button-quiet` | 透明，`--muted`；hover → `rgb(20 45 66 / .06)` 底 |
| `.danger-button`（outline 内） | `--danger` 字；hover → `--danger-soft` 底 + `--danger-line` 边 |

- 公共：`border-radius: 10px; min-height: 36px; padding: 7px 14px; font-size: 13px; font-weight: 500;` 过渡 `background-color, border-color, box-shadow, transform` 用 `--t`/`--ease`。
- 按钮内 SVG 图标 15px、`stroke-width 1.7`、与文字 gap 6px、`aria-hidden="true"`。

### 3.3 卡片与浮层

- 面板/卡片：`--paper` 底 + `--r-lg` + `--shadow-md`，**不描边**（阴影已声明高度）。交互卡 hover → `translateY(-2px)` + `--shadow-lg`，`--t` `--ease`。
- 平面元素（输入框、列表行、分隔、details）用 1px `--line` 描边、无阴影。二选一，不做「描边+大阴影」的幽灵卡。
- 弹出浮层（更多导出、toast）：`--shadow-lg` + `--r-md`。

### 3.4 侧栏

- 宽 264px，`--paper` 底，右侧 1px `--line` 分隔（分隔线不是高度声明）。
- 图表列表项：`--r-md` 行卡；hover → `--paper-2` 底；选中 → `--accent-soft` 底 + `box-shadow: inset 0 0 0 1.5px var(--accent-line)` + 标题 `--accent`。**禁 >1px 彩色边条**。
- 序号 `tabular-nums` 淡色；类型·主题一行 12px muted；`JSON 草稿`徽标用 warning 色系 pill。
- **新增**：列表项 hover/focus-within 浮出两个小图标按钮（复制、删除），`opacity 0→1`。逻辑复用 `appendDiagram(spec, true)` 与新增的 `removeDiagramAt(index)`（由 `removeDiagram` 抽取，保留原确认文案；不足 2 张禁用）。点击不触发选中（`@click.stop`）。
- **新增**：列表上方放搜索过滤框（role="searchbox"，SVG 放大镜左图标），`computed` 按标题/类型过滤，`v-model="diagramFilter"`。
- 「文档中的图表」等小节标题：12px/600/`--muted`，字距 `.04em`。
- 快捷新增 chip：`--r-pill` 小按钮，`--line` 边；hover → `--accent-soft`。
- 脚注：`success` 圆点 +「数据只留在你的浏览器中」。

### 3.5 工作区

- `.studio-main` 背景 `--bg`，padding 24px。
- H1：22-24px/650/`--ink`，描述 13px `--muted` max-width 74ch。
- meta 行：类型徽标 pill（`--accent-soft` 底 `--accent` 字）；草稿指示 warning pill；保存态 muted。
- 导出工具条：做成一张 `--r-md` 白卡（`--shadow-sm`）包住格式/倍率 select、质量滑杆、导出/复制按钮；「更多导出」summary 下拉浮层 `--shadow-lg` `--r-md`。
- 画布卡 + 样式面板 + 编辑器面板均 `--r-lg` `--shadow-md`。
- `.workspace-panels.with-editor` 双列布局保留。

### 3.6 编辑器面板

- 模式切换：分段控件——`--paper-2` 底 pill 容器 padding 4px，选中页 `--paper` pill + `--shadow-sm` + `--ink` 600。
- JSON 面板：filebar `--paper-2`，`.file-dirty` warning 色、`.file-saved` success 色；textarea 白底等宽 `13px/1.7`，focus 光环。
- `.uml-editor-card`：`--r-md`、1px `--line` 描边（平面元素）；`> summary` `--paper-2` 底 + chevron SVG 旋转（details[open] 时 90°）；展开时 summary 底部分隔线。
- 表单主按钮 `.uml-editor-apply`：同渐变主按钮规则。
- `.uml-editor-selected`：`outline: 3px solid var(--ring)`。
- 危险按钮 `.uml-editor-danger`：`--danger` 字 `--danger-line` 边，hover `--danger-soft`。

### 3.7 图表画布（DiagramCanvas）

- 外层卡片 `--r-lg` `--shadow-md` 白底。
- 工具条：状态点（success/busy warning 脉动/failed danger）+「实时预览/正在排版/保留上次成功结果」+ 尺寸 `tabular-nums` muted。
- 缩放控件：分段小控件——`--paper-2` 容器圆角 8px，按钮 28px 方块圆角 6px，hover 白底 `--shadow-sm`；`-`/`+`/fit 均用 SVG 或保留字符，统一描边风格；`.fit-button.active` → `--accent` 字 + `--accent-soft` 底。
- 舞台：`--paper-2` 底 + 点阵 `radial-gradient(circle, #c3d2de 1px, transparent 1px)` size 20px（可用，画布即“绘图纸”，符合 world-consistent 纹理例外）。
- 画板（artboard）：白底 + `0 2px 8px rgb(20 45 66/.08), 0 16px 40px -12px rgb(20 45 66/.16)`，无描边；透明底棋盘格保留。
- 页脚提示 12px `--faint`；`.canvas-error` warning-soft 底 warning 字。
- loading 环：`--line` 底 + `--accent` 顶弧。

### 3.8 反馈件

- Toast：`--ink` 底白字 `--r-md` `--shadow-lg`，底部居中，`translateY(8px)+opacity` 进出 180ms。
- 错误横幅：`--danger-soft` 底 `--r-md`，左侧 SVG `exclamation-circle`（`--danger`），关闭按钮 SVG `x-mark`。
- 空态/加载：居中，SVG/转环 + 13px muted 文案。
- `::selection`：`rgb(14 159 180 / .22)`；`caret-color: var(--accent)`；滚动条 thin、`--line-strong` on 透明。
- 全局 `:focus-visible`：`outline: 2px solid var(--accent); outline-offset: 2px;` + `box-shadow: 0 0 0 5px var(--ring)`（聚焦态渐变光环的落点）。
- 输入框 hover `--line-strong`；focus 上边 `--accent` + 光环。

### 3.9 SVG 图标规范

- `viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`、`stroke-width="1.7"`、`stroke-linecap="round"`、`stroke-linejoin="round"`、`aria-hidden="true"`、尺寸 15-16px（导航品牌方块内 18px 白）。
- 所需图标（Heroicons/Lucide 风格自绘）：import（`arrow-down-tray`）、save（`arrow-down-on-square` 或 `document-arrow-down`）、list（`rectangle-stack`/`bars-3`）、edit（`pencil-square`）、style（`swatch`）、export（`photo`/`arrow-up-tray`）、copy（`clipboard-document`/`square-2-stack`）、plus、trash、x-mark、magnifying-glass、chevron-down、exclamation-circle、check、document/code-bracket、arrows-pointing-out（fit）。

## 4. 实现分工与边界

| 文件 | 代理 | 范围 |
|---|---|---|
| `src/Studio.vue` | A | `<template>` 结构微调 + 全量 `<style>` 重写 + `<script>` 最小新增（`removeDiagramAt`、`diagramFilter`） |
| `src/DiagramCanvas.vue` | B | `<template>` 图标化 + `<style>` 重写（用本文令牌字面量） |
| `demo/index.html` | B | meta/标题微调（如需） |
| `src/FormEditor.vue` `ColorInput.vue` `CauseEditor.vue` | A（仅样式经由 Studio.vue 全局 `.uml-*`；模板原则上不动） | — |

**保留契约（违反即返工）：**

- 不删功能：保留全部现有按钮与入口（允许新增）。不改 `window.UmlStudio` API。
- DOM 钩子保留：`.uml-*` 类名、`data-editor-key`、`data-group-id`、`data-lane-id`、`.canvas-svg`、`.uml-container`、`.uml-edge-label`、`.form-panel`、`details/summary` 语义、按钮可见文字（「全部折叠」「全部展开」「重置表单」「删除」等）、`role="searchbox"`、`role="status"` 与文案「没有匹配的元素。」。
- 既有类名（`.studio-*`、`.button-*`、`.diagram-list`、`.canvas-*` 等）默认保留；新类可增，删类须全局无引用。
- `<script>` 逻辑最小改动；图标注入走模板内联 SVG。
- 打印媒体查询、窄屏断点（1200/860/540px 与画布侧 1250/1050/760/480px）、`prefers-reduced-motion` 全部保留并适配新令牌。
- 图表主题 `themes.ts` 不动（图内配色是数据特性，非本次范围）。

## 5. 验收

1. `npm run typecheck`、`npm run build`（uml-studio 目录）零错误；产物含 `assets/viewer.js/css`、新 `demo-dist/index.html`。
2. `node --test tests/*.test.mjs` 通过（browser 测试可不跑）。
3. 视觉：玻璃导航、渐变主按钮/品牌块、卡片悬停上浮、SVG 图标、圆角、聚焦光环、无 emoji/渐变文字/紫色系。
4. `.agents/skills/impeccable/scripts/impeccable.cmd detect --json` 对改动文件运行一次，处理其结论。
5. 中文文案无 AI 感套话；交互均有 hover/focus/active/disabled 态。

## 6. 实施结果（2026-10-28）

已按本契约完成全部改造并通过验收：

- `src/Studio.vue`：全量样式重写为令牌体系；模板加入 19 个内联 SVG 图标；新增侧栏搜索过滤（`diagramFilter`/`filteredDiagrams`）与列表项悬停「复制/删除」按钮（`removeDiagramAt(index)`，由 `removeDiagram` 抽取）；列表项根元素因不允许按钮嵌套改为 `<div>`（选中语义/aria-current 不变）。
- `src/DiagramCanvas.vue`：`.diagram-canvas` 上以同名 CSS 变量重声明令牌字面量（兼容库构建独立使用）；缩放 `−`/`+` 换 SVG，loading 环改双色 SVG 环；高度/断点/交互逻辑零改动。
- `demo/index.html`：meta description 微调。
- 验证：`npm run build` exit 0（产物 `assets/viewer.js/css`、`dist/*`、`demo-dist/index.html` 同步更新）；`node --test tests/*.test.mjs` 98/98 通过；Playwright 实测计算样式逐项吻合（玻璃导航、渐变主按钮、卡片上浮、聚焦光环、SVG 图标、无 emoji/渐变文字/紫粉）；`impeccable detect` 对改动文件 0 发现（`demo-dist/index.html` 一条 `pulsing-dot` warning 为 §3.1 允许的呼吸指示点，保留）。
- 遗留可选项：`ColorInput.vue` 的 `✓`、`FormEditor.vue` 的 `→` 为存量文本符号（模板未动范围），后续可换 SVG。
- 另附 `.agents/skills/uml-studio/PRODUCT.md`、`DESIGN.md` 持久记录产品事实与视觉系统。
