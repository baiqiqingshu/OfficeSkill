# 前端重设计第五轮：uml-studio 工作台 + demo「砚松」视觉世界（推翻重来）

> 前四轮见 `frontend-redesign*.md`、`uml-studio-redesign.md`。本轮用户反馈"当前模板页面
> 太丑了，推翻重来"，范围 = **uml-studio**（生成式工作台单页 + demo 场景册页，二者同一套
> Vue 组件）。旧「澄海工作台」视觉整体作废，替换为 **「砚松」（Inkstone Pine）**：暖纸底 +
> 石墨墨黑主按钮 + 松绿实色强调。管线、DOM 钩子、离线约束全部保留。
> 本轮不再征询用户意见；实施者可在令牌内微调色值，不得另起色系。

## 0. 范围与文件地图

样式权威仅两处，其余 Vue 组件无 `<style>`（样式来自 Studio.vue 全局样式）：

| 文件 | 内容 | 子代理 |
|---|---|---|
| `src/Studio.vue` | `:root` 令牌 ×2（约 2420/2464 行）、全部 chrome 与 `uml-editor-* / uml-color-* / uml-cause-*` 编辑器样式、模板重排打磨 | A |
| `src/DiagramCanvas.vue` | 自包含令牌块 + 画布舞台 / SVG 卡片 / 加载器 / 元素选取态 / 画布断点 | B |
| `src/FormEditor.vue`、`ColorInput.vue`、`CauseEditor.vue` | 仅模板（检查无非 SVG 图标残留，需要时微调），样式归 A | A |
| `demo/index.html` | title/meta 微调 | A |
| `assets/viewer.js|css`、`dist/*`、`demo-dist/*`、`schemas/*`、`THIRD_PARTY_NOTICES.txt` | **构建产物，禁手改**；由 `npm run build` 再生 | — |

## 1. 保留契约（不可破坏）

- **DOM 钩子全保留**：`.studio-*`、`.button/.button-accent/.button-dark/.button-outline/.button-quiet`、
  `.diagram-*`、`.editor-*`、`.export-*`、`.more-export`、`.studio-toast`、`.error-banner`、
  `.runtime-warning`、`.save-state`、`.file-dot`、`.dirty/.file-saved/.file-dirty`、`.live-indicator`、
  `.draft-indicator`、`.mobile-menu-button`、`.hide-small`、`.visually-hidden`、`.is-open`、`.selected`、
  `.with-editor`、`.danger`、`.canvas-stage`（含 `.is-dragging`/`.can-select-elements`）、`.canvas-svg`、
  `.uml-form-editor`、`.uml-editor-card`、`.uml-editor-selected`、`.uml-cause-editor`、
  `.uml-cause-editor__row`、`.uml-container[data-group-id|data-lane-id]`、`.uml-edge-label`、
  `.uml-checker`、`.uml-canvas-pulse`、`.uml-canvas-spin`、`[data-editor-key]`、`details[open]`。
- **可访问性钩子**：`role="searchbox"`、`role="status"`（文案"没有匹配的元素。"）、按钮名
  `全部折叠`/`全部展开`/`重置表单`/`删除`、aria-label、`:focus-visible`。可新增类名与 aria。
- **行为**：`npm test`（node --test）全绿；`tests/editor.browser.mjs` 依赖上列钩子；
  390px 宽无横向滚动；`details` 折叠语义不变；`window.UmlStudio` API 不变。
- **离线**：禁远程字体/图片/CDN；**CSS 禁 `url(`**（select 下拉箭头用包裹 div + 内联 SVG，
  不用背景图）；纹理仅 `radial-gradient` 点阵、`conic-gradient` 加载弧；`color-scheme: light`。
- **媒体查询**：保留各断点语义（Studio.vue 420/540/860/1200px；DiagramCanvas.vue
  480/760/1050/1250/1600px）、`prefers-reduced-motion`、`@media print`。
- **图表主题**（ocean 等 11 套）与图内布局是数据特性，**不动**。
- 模板可重排（如头部动作分组、卡片化侧栏），但全部钩子、按钮文案、aria 必须保留。

## 2. 新视觉世界：「砚松」（Inkstone Pine）

模式 Operate（任务型工具）。暖纸底 + 墨黑主按钮 + 松绿实色强调 + 磨砂玻璃顶栏。
反 AI 感：无紫粉、无渐变文字、无 emoji、无大面积玻璃、**按钮一律实色**。

### 2.1 令牌（两文件的 `:root`/自包含令牌块必须逐字同值）

```css
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
```

`.uml-form-editor / .uml-color-input / .uml-cause-editor` 的 `--uml-edit-*` 变量继续映射到
新令牌同名变量（ink/muted/line/accent/soft）。

### 2.2 硬性规则

1. 渐变只允许：`.brand-mark` logo 方块（135° 松绿双色 + hover 变体）、`:focus-visible`
   光环、顶栏底部 1–2px 品牌渐变发丝线。**一切按钮/控件/卡片/文字禁渐变**。
2. 磨砂玻璃只允许：`studio-header`（sticky，`blur(14px) saturate(1.4)` + `rgb(255 255 255/.74)`
   底 + 底部 1px `--line`）与窄屏抽屉 `.studio-sidebar.is-open` / `.sidebar-scrim`。
   面板、卡片一律实色。
3. 卡片 hover `translateY(-2px)` + `--shadow-md`；可交互行（`.diagram-item` 等）hover
   `--paper-2` 底 + 描边加深。纯展示卡可不浮。
4. 按钮全实色：`.button-dark`=`--primary` 底白字（hover `--primary-hover` + `translateY(-1px)`
   + `--shadow-sm`）；`.button-accent`=`--accent` 底白字（hover `--accent-deep`）；
   `.button-outline`=纸底 `--line` 描边（hover `--line-strong` + `--paper-2`）；
   `.button-quiet`=透明（hover `--paper-2`）；disabled=`color-mix` 淡化 + 无投影无位移。
   控件高 32–34px、`--r-sm`/`--r-md` 圆角、字重 500–600。
5. 图标全内联 SVG（24 viewBox、stroke 1.6–1.7、currentColor、round caps、aria-hidden）。
   禁 emoji / Unicode 符号当图标（检查 `✓ → ← ▸` 等残留）。select 下拉箭头用
   `appearance:none` + 相对定位包裹层的内联 SVG，不用 `url(` 背景图。
6. 浮层（`details.more-export` 浮层、下拉、toast、弹层）只用 `--shadow-lg` 不描边，
   `--r-md` 圆角；浮层内 hover `--paper-2`。
7. 隐藏组件同等设计：`<select>`/`option`、`<details>/<summary>` 浮层、`.studio-toast`、
   `.error-banner`、`.runtime-warning`、禁用态、空态（`.diagram-list-empty`）、骨架/加载
   （`uml-canvas-pulse`/`uml-canvas-spin`）、滚动条（细、thumb `--line-strong`）、
   `::selection`=`--accent-soft`、focus-visible=`outline 2px var(--accent)` +
   `0 0 0 4px var(--ring)`。
8. 排版：页面/面板标题 14–16px、600、`-0.01em`；正文 13–14px/1.6；辅助 12px `--muted`；
   数字 `font-variant-numeric: tabular-nums`（尺寸/倍率/序号）。
9. `.live-indicator` 绿点呼吸、`uml-live-breathe` keyframe 用 `--success` 色系重校。
10. 禁：`url(`、远程资源、紫粉系、渐变文字、>1px 彩色边条、emoji 图标、装饰性玻璃。

### 2.3 布局打磨方向（模板可重排，钩子保留）

- 顶栏：56–60px，logo 方块 28px `--r-sm` 松绿渐变 + 白 SVG；品牌名 + 小字标语；
  `.header-center` 面包屑 muted；右侧动作组（移动图表列表按钮 + 导入 outline + 保存 HTML dark）。
- 侧栏：与主区间留 12px 缝的**浮卡**（`--paper` + `--r-lg` + `--shadow-sm`），不再是通栏平面；
  搜索框带 SVG 图标；`.diagram-item` 圆角行（序号 index chip + 标题 + type-badge 小章 +
  hover 浮出操作）；选中项 `--accent-soft` 底 + `--accent` 字色；`.sidebar-footnote` 12px faint。
- 画布区：`.canvas-stage` 纸面卡 + 点阵底（`radial-gradient` 1px 点、22–24px 网）；
  SVG 图在白卡上带 `--shadow-sm`；拖拽 `is-dragging` 抓取光标；选取态 `--accent` 虚线框。
- 编辑/样式面板：卡片化分节，`.section-heading` 12px/600 muted；`.editor-mode-tabs`
  分段控件（`--paper-2` 井底 + `--r-pill` 选中白卡 `--shadow-sm`）；输入控件统一高/圆角；
  `uml-editor-card` 白卡 `--r-md`，`.uml-editor-selected` 用 `--accent` 光环。
- 导出工具条：控件成组（格式 select + 倍率 select + 质量 range + 下载/复制按钮 +
  「更多导出」details 浮层），对齐、间距 8px 网格。
- `demo/index.html`：title/description 可微调（保持"UML Studio"与 zh-CN）。

## 3. 文件数约束

- 每个 `.agents/skills/<skill>` git 跟踪文件 ≤100；当前 uml-studio 94。**本轮不新增文件**
  （DESIGN.md 已存在，直接改）；可删不可加，净增量 ≤0。
- `.agents/skills/temp/` 的浏览器残留（非 git 跟踪）移出 skills 树至仓库根 `temp/`。

## 4. 构建与验证

```bash
cd .agents/skills/uml-studio
npm run build        # 再生 assets/viewer.*、dist/*、demo-dist/index.html、schemas、notices
npm run typecheck    # vue-tsc --noEmit
npm test             # node --test tests/*.test.mjs
npm run test:editor  # playwright 编辑器回归（浏览器可用时）
```

视觉验证：playwright 打开 `demo-dist/index.html` 桌面/窄屏截图，检查顶栏玻璃、
侧栏浮卡、画布点阵、实色按钮、select/浮层/toast/选中态；再用 `scripts/diagram.mjs`
生成单图 HTML 验证生成物同新皮肤。

## 5. 文档同步（收尾）

- `uml-studio/DESIGN.md` 改为「砚松」令牌摘要。
- `docs/uml-studio-redesign.md` 更新为 §2.1 新令牌；docs 下历轮契约合并精简。
