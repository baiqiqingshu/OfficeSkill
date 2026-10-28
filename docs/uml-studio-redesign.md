# UML Studio 工作台前端设计规范（现行）

> uml-studio（`.agents/skills/uml-studio`）生成式工作台 UI 的权威设计文档。
> 当前视觉世界：**「砚松」（Inkstone Pine）**——暖纸底 + 石墨墨黑主按钮 + 松绿实色强调。
> 历史轮次与演进见 `frontend-redesign-history.md`；本轮实施契约见 `frontend-redesign-r5.md`。

## 1. 设计方向

- 模式：**Operate**（工具台，用户完成任务）。克制中性色 + 墨黑主按钮 + 单一松绿强调。
- 反 AI 感：不使用紫粉渐变、渐变文字、emoji、大面积玻璃；**按钮一律实色**。
- 品牌语义：松（精确、稳定、工具感），产品名/标语不变「UML Studio · 把复杂，画清楚。」。

### 硬性规则

1. 柔和弥散阴影；交互卡片 hover `translateY(-2px)` + 阴影加深。
2. **渐变只允许**：`.brand-mark` logo 方块（135° 松绿双色）、`:focus-visible` 光环、
   顶栏底部 2px 品牌渐变发丝线（`.studio-header::after`）。其它元素禁渐变。
3. 磨砂玻璃只允许：`.studio-header`（sticky）与窄屏抽屉 `.studio-sidebar`。
4. 全部中文文案；图标一律内联 SVG（24 viewBox、stroke 1.6–1.7、currentColor、
   round caps、aria-hidden）；禁 emoji/Unicode 图标。
5. 圆角卡片、圆角按钮；现代配色。
6. 离线约束：禁远程字体/图片/CDN；**CSS 禁 `url(`**；select 箭头用 `.select-wrap`
   包裹 + `.select-chevron` 内联 SVG + `appearance:none`；纹理只用 `radial-gradient`
   点阵、`conic-gradient` 棋盘/加载弧等非 url 手段。

## 2. 设计令牌（逐字使用）

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

`.uml-form-editor / .uml-color-input / .uml-cause-editor` 的 `--uml-edit-*` 变量映射到
上述同名令牌（ink/muted/line/accent/soft）。`DiagramCanvas.vue` 在 `.diagram-canvas`
上以同名同值重声明（自包含令牌，兼容 `dist/diagram.css` 独立使用）。

## 3. 组件规则（实现快照）

### 3.1 顶部导航（磨砂玻璃）

- `sticky` 顶栏：`background: rgb(255 255 255 / .74)` + `backdrop-filter: blur(14px) saturate(1.4)`；
  底部 1px `--line` + `::after` 2px `--gradient-brand` 发丝线。
- 品牌：28px `--r-sm` 松绿渐变方块 + 白 SVG +「UML STUDIO」文字标 + 小字标语。
- 中部 `.header-center`：`.live-indicator` 绿点（`--success` 呼吸）+ muted 面包屑。
- 右侧 `.header-actions`：移动图表列表 quiet 按钮 + 导入 outline + 保存 HTML `.button-dark`。

### 3.2 按钮体系（全实色）

| 变体 | 样式 |
|---|---|
| `.button-dark`（主按钮） | `--primary` 底白字；hover `--primary-hover` + `translateY(-1px)` + `--shadow-sm`；active 回落 |
| `.button-accent` / `.uml-editor-apply` | `--accent` 底白字；hover `--accent-deep` |
| `.button-outline` | `--paper` 底 1px `--line`；hover `--line-strong` + `--paper-2` |
| `.button-quiet` | 透明 `--muted`；hover `--paper-2` |
| `.danger-button` | outline + `--danger` 字；hover `--danger-soft` |

- 公共：`min-height: 34px`、`--r-sm`、13px/550、SVG 图标 15px gap 6px；
  disabled `color-mix` 淡化、无投影无位移。

### 3.3 卡片与浮层

- 面板/卡片：`--paper` + `--r-lg` + `--shadow-sm`（展示卡）/ `--shadow-md`（交互卡 hover 加深）。
- 浮层（`.more-export-content`、`.studio-toast`、窄屏抽屉）：`--shadow-lg` + `--r-md`、不描边。
- 平面元素（输入、列表行、分隔、details）：1px `--line`、无阴影。二选一。

### 3.4 侧栏

- **浮卡**：与主区间 12px 缝、`--paper` + `--r-lg` + `--shadow-sm`（不再通栏平面）。
- 搜索框 `.diagram-search`（role="searchbox" + SVG 放大镜左图标）。
- `.diagram-item` 圆角行：序号 index + 标题 + 类型·主题 12px muted + type-badge 小章；
  hover `--paper-2`；选中 `--accent-soft` 底 + `--accent` 字；hover/focus-within 浮出
  `.diagram-item-actions` ghost 图标按钮（hover 才显示白底+shadow-sm）。
- 「JSON 草稿」徽标 warning 色 pill；脚注 success 点 + 数据留存文案。
- 窄屏：fixed 抽屉 `rgb(255 255 255 / .86)` + blur + `--r-lg` + 提升阴影 + `.sidebar-scrim`。

### 3.5 工作区与画布

- `.studio-main` `--bg`；H1 22px/650/`-0.01em`；meta 行 type-badge pill + 草稿 warning pill + 保存态。
- 导出工具条：白卡 `--r-md` `--shadow-sm` 成组（格式/倍率 `.select-wrap`、质量 range、
  下载/复制按钮、「更多导出」details 浮层）。
- `.canvas-stage`：`--paper-2` 凹陷井 + 点阵 `radial-gradient(circle, rgb(33 36 44/.13) 1px, transparent 1px)` 24px；
  `--r-lg` + `--shadow-sm`；拖拽 grab/grabbing；`focus-visible` 2px accent + 4px ring。
- `.canvas-artboard`（图内白卡）：`--paper` + `--r-md` + `overflow:hidden` + `--shadow-sm`，
  hover 加深至 `--shadow-md`（不平移，避免拖拽跳动）；`.canvas-svg` 承载 scale 变换不背样式。
- 元素选取态：`.can-select-elements` 下 `[data-editor-key]`/`.uml-container` hover/focus
  `outline: 2px dashed var(--accent)`；`.canvas-artboard.is-transparent` 暖色棋盘格。
- 工具条 zoom-tools：`--paper-2` pill 井；`.fit-button.active` 白 pill + accent 字。
- 加载：`uml-canvas-spin` accent 弧；`uml-canvas-pulse` accent-soft 呼吸（`.status-dot.busy`）。
- 页脚/尺寸 12px `--muted`（对比度 ≥4.5）；`.canvas-error` warning-soft 浮卡。

### 3.6 编辑器面板

- `.data-panel`：右侧白卡 `--r-lg` `--shadow-sm`，`v-show="editorOpen"`；
  `.editor-mode-tabs` 分段控件（`--paper-2` 井底 + 选中 `--paper` pill `--shadow-sm`）。
- `.uml-form-editor` 控件统一 34px 高、`--r-sm`、1px `--line`；focus `--accent` 边 + 4px `--ring`；
  搜索框 `.uml-editor-search` 带 SVG 图标。
- `.uml-editor-card`：`--r-md` + 1px `--line`；`> summary` `--paper-2` + chevron 旋转；
  `.uml-editor-selected` 用 `--accent` 光环。
- `.uml-color-input__sample`：34px 方、`--r-sm`、1px `--line`、内阴影；
  `input[type="color"]` 全透明覆盖（appearance:none 去 UA 默认）。
- JSON 面板：filebar `--paper-2`；`.file-dirty` warning / `.file-saved` success；
  textarea 白底等宽 13px/1.7 + focus 光环。

### 3.7 反馈件与隐藏组件

- Toast：`--ink` 底白字 `--r-md` `--shadow-lg`，底部居中进出 180ms。
- `.error-banner`：`--danger-soft` + `--danger-line` + danger 图标；`.runtime-warning` warning 系。
- 空态居中 muted 文案；`::selection` `--accent-soft`；`caret-color: var(--accent)`；
  滚动条 thin `--line-strong`；`:focus-visible` 2px accent + 4px ring。
- 打印：隐藏 chrome 仅留画布；`prefers-reduced-motion` 去动效。

## 4. 保留契约（不可破坏）

- `window.UmlStudio` API；全部功能入口；`.uml-*` 类名族；`data-editor-key`、
  `data-group-id`、`data-lane-id`；`.canvas-svg`、`.uml-container`、`.uml-edge-label`；
  `role="searchbox"`/`role="status"`（「没有匹配的元素。」）；按钮文案
  「全部折叠」「全部展开」「重置表单」「删除」等；`details/summary` 折叠语义。
- 断点：Studio.vue 420/540/860/1200px；DiagramCanvas.vue 480/760/1050/1250/1600px；
  `@media print`、`prefers-reduced-motion`。
- 图表主题（ocean 等 11 套）与图内布局是数据特性，独立演进不动。
- 每 skill git 跟踪文件 ≤100；`assets/viewer.*`、`dist/*`、`demo-dist/*` 为
  `npm run build` 产物，不手改。

## 5. 本轮实施记录（砚松，2026-10-28）

- `Studio.vue`：全量 `<style>` 重写为砚松令牌（`:root` ×2 同步）；模板——9 处 `<select>`
  包 `.select-wrap`+`.select-chevron`；顶栏发丝线 `::after`；侧栏浮卡；`.button` 体系实色化
  （`.button-dark`=`--primary` 墨黑）。新增类 `.select-wrap` `.select-chevron` `.uml-editor-search`。
- `FormEditor.vue`：21 处 select 包 wrap+chevron；11 处 `＋` 文本换内联 SVG。
- `CauseEditor.vue`：`＋ 子原因` 换内联 SVG。`ColorInput.vue` 未改（已是 SVG）。
- `DiagramCanvas.vue`：自包含令牌块同步砚松；舞台凹陷井+暖墨点阵 24px；`.canvas-artboard`
  白卡承载样式（`.canvas-svg` 只留 transform）；选取态 accent 虚线；加载器/棋盘格重校；
  `.status-dot.busy` warning→accent。
- `demo/index.html`：`theme-color #f3f2ee` + description 微调。
- `tests/editor.browser.mjs`：补「编辑图表」开启步骤（修复 244dd0f 起默认关闭编辑器
  导致的存量失败，非本轮回归）。
- 验证：build/typecheck/98 单测/浏览器回归全绿；Playwright 逐项核实（玻璃顶栏+发丝线、
  墨黑实色主按钮、浮卡侧栏、点阵画布、绿聚焦环、无渐变按钮/无紫粉/无 url(/无横向滚动）。
- 文件数：uml-studio 94 跟踪文件（净增 0），全部 skill ≤100。
