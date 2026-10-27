# 前端重设计实施契约（uml-studio + ucd-studio）

> 本轮在 `b9b8844`「澄海工作台」基础上继续。**硬性变化：按钮一律实色，不用渐变**；
> 渐变只保留在品牌区（logo 方块）、聚焦态光环、导航栏点缀。文档同时覆盖 ucd-studio
> 的全量重设计与两个 skill 的文件数收敛（各 ≤100 文件）。

## 0. 统一语言（两 skill 共用方向）

- 柔和弥散阴影（多层、低透明度、负扩散）；交互卡片 hover `translateY(-2px)` + 阴影加深。
- **渐变**：只允许 logo 方块（135° 品牌渐变）、`:focus-visible` 光环、导航栏局部点缀。
  **按钮（含主按钮）一律实色**，hover 加深不用渐变——减少 AI 感。
- 磨砂玻璃（`backdrop-filter`）只允许顶部导航 / 窄屏抽屉；面板、卡片实色。
- 全中文文案；图标全部内联 SVG（stroke 风格，禁 emoji、禁 Unicode 符号当图标）。
- 圆角卡片与按钮（面板 10–16px，控件 8–10px）；现代配色、克制中性色 + 单一品牌色。
- 隐藏组件同等设计：`<select>` 下拉、`option`、`<dialog>`、`details/summary` 浮层、
  toast、骨架屏、空/错误态、禁用态、滚动条。
- 离线约束：禁远程字体/图片/CDN；**CSS 中禁 `url(`**（ucd-studio `audit()` 会拒绝，
  uml-studio 保持一致）；纹理只用 `radial-gradient` 点阵等非 url 手段。
- `prefers-reduced-motion`、既有断点、全部 DOM 钩子与功能入口保留。

## 1. uml-studio（修正性迭代，非重做）

范围：`.agents/skills/uml-studio`。上一提交已完成令牌化重设计，本轮做差量修正。

### 1.1 按钮去渐变（必须）

- `src/Studio.vue`：`.button-dark`、`.button-accent`、`.uml-editor-apply`
  （约 2222、2482 行）`background: var(--gradient-brand)` → **`background: var(--accent)`**；
  hover → `var(--accent-deep)`，保留 `translateY(-1px)` 与彩色投影 `rgb(11 91 135/.30-.50)`；
  active 回落 `translateY(0)`；disabled 用 `color-mix(in srgb, var(--accent), var(--paper) 55%)`
  或既有禁用规则实色化。
- `--gradient-brand` 仅保留于 `.brand-mark`（logo 方块可保留渐变与 hover 微变体）；
  `--gradient-brand-hover` 若仅按钮引用则删除或改供 brand-mark hover。
- 若画布外其它按钮残留渐变一并实色化；`radial-gradient` 点阵（`.canvas-stage`）与
  `conic-gradient`（色轮/loading 弧）属数据特性，保留。
- `DESIGN.md` 的「主按钮=品牌渐变」规则同步改为「主按钮=实色 accent」。

### 1.2 隐藏组件与遗留项

- 检查并完善 `<select>`（格式/倍率）、「更多导出」`details` 浮层、toast、错误横幅、
  禁用与 focus 态在令牌下的一致性；select 统一圆角、hover/focus 描边与光环。
- `ColorInput.vue` 的 `✓`、`FormEditor.vue` 的 `→` 文本符号改为内联 SVG
  （24 viewBox、stroke 1.7、currentColor、aria-hidden）。
- 其余遵守 `docs/uml-studio-redesign.md` §3 既有组件规则，不推翻已完成设计。

### 1.3 文件数 101 → ≤99

- `PRODUCT.md` 并入 `DESIGN.md`（DESIGN.md 头部加 "Product" 节收录其产品事实，随后删除 PRODUCT.md）。
- `tests/fixtures/login-activity.json` 与 `login-usecase.json` 合并为单个
  `tests/fixtures/login.json`（形如 `{"activity":{...},"usecase":{...}}`），
  并更新 `tests/edge-labels.test.mjs`、`tests/usecase-layout.test.mjs` 读取路径与取值。

### 1.4 构建与验证

```bash
npm run typecheck        # 仓库根目录
npm run build            # 重新生成 dist/、assets/viewer.*、demo-dist/、THIRD_PARTY_NOTICES、schemas
cd .agents/skills/uml-studio && node --test tests/*.test.mjs
```

- 构建产物全部提交；文件总数 `find .agents/skills/uml-studio -type f | wc -l` ≤ 99。

## 2. ucd-studio（全量重设计）

范围：`.agents/skills/ucd-studio`。渲染管线：`scripts/ucd.py` / `render.py` 将
`assets/base.css`（按 `/* component: X */` 注释切分）、`assets/shell.html`、
`assets/runtime.js`、`data/styles.json` 令牌内联成离线单文件 HTML。

### 2.1 设计令牌（写入 `data/styles.json` 每个主题）

- `radius`：6px → **10px**（面板圆角）；base.css 中 `--control-radius: 8px`。
- 新增每主题令牌（`validate()` 只允许 styles.json 已定义键；design-system.md 中自动标注"主题扩展"）：
  - `surface-2`：凹陷面（表头、井区、选中骨架底）——浅色主题 `#f4f7fa` 系，midnight 用 `#131c2a`。
  - `line-strong`：hover 描边——浅色 `#b9c9d6` 系，midnight `#43536d`。
  - `shadow`：卡片/面板弥散阴影——浅色主题统一
    `0 1px 2px rgb(20 45 66/.05),0 8px 24px -10px rgb(20 45 66/.10)`；
    midnight `0 1px 2px rgb(0 0 0/.4),0 10px 28px -10px rgb(0 0 0/.55)`。
  - `shadow-pop`：浮层（dialog/toast/details 浮层）——浅色
    `0 4px 12px -4px rgb(20 45 66/.10),0 24px 48px -14px rgb(20 45 66/.20)`；
    midnight `0 4px 14px -4px rgb(0 0 0/.5),0 26px 54px -14px rgb(0 0 0/.65)`。
  - `ring`：聚焦光环 `rgb(.../.28)`，取各主题 primary 的透明化；midnight 可 `rgb(138 180 255/.35)`。
- 中性令牌色值不动（8 主题现有 primary/ink/muted/border 等保持），仅按上表追加。

### 2.2 `assets/base.css` 全量重写（保留 `/* component: X */` 标记与顺序）

硬性规则：

- `.app` 侧栏、`.topbar`：topbar 改 `position:sticky;top:0;z-index:20`，
  `background:color-mix(in srgb,var(--surface),transparent 25%)` +
  `backdrop-filter:blur(14px) saturate(1.4)` + `-webkit-` 前缀，底部分隔仍 1px `var(--border)`。
- `.brand-mark`：允许 `linear-gradient(135deg,color-mix(in srgb,var(--primary),#fff 8%),var(--primary))`
  （唯一渐变元素）。
- `.panel`/卡片：`var(--surface)` + `var(--radius)` + **`box-shadow:var(--shadow)`，不描边**；
  平面元素（输入、行分隔、details）用 1px `var(--border)` 无阴影——二选一。
- 交互卡 hover 上浮：`.task`、`.item-card`、看板卡、`stats-grid` 可整体不动（分隔网格），
  `.stat` 不做逐格上浮；`.item-card .btn` 保持。
- `.btn`：outline 实色（surface 底 + border 描边），hover `--bg` 底 + `line-strong` 边；
  `.btn-primary` **实色 `var(--primary)`**，hover `color-mix(in srgb,var(--primary),var(--ink) 16%)`
  + `translateY(-1px)` + `0 6px 16px -6px color-mix(in srgb,var(--primary),transparent 55%)`；
  圆角 `var(--control-radius)`。
- `input/select/textarea`：1px `var(--border)`（现状为 `--muted`，改细），hover `line-strong`，
  focus `border-color:var(--primary)` + `box-shadow:0 0 0 4px var(--ring)`，仍保 `outline` 兼容。
- **select 定制**：`render.py` 输出 `<span class="select-wrap">` 包裹 select +
  内联 chevron SVG（stroke 1.6，右置 pointer-events:none）；select `appearance:none` +
  `padding-right:30px`。改造点：`fields()`、`table-toolbar` 的 `data-filter`、
  `kanban` 的 `data-task-move`、`state-tools` 的 `data-state`、`shell.html` dialog 内 select、
  `components/select.html`；`option{color:var(--ink);background:var(--surface)}`。
- `.badge` → `--r-pill`；`.stats-grid` 整卡阴影；`dialog` `var(--radius)` + `var(--shadow-pop)`；
  `.toast` ink 底 + `var(--shadow-pop)`；`.nav-list a.active` soft 底 +
  `inset 0 0 0 1.5px color-mix(in srgb,var(--primary),transparent 70%)`。
- 表格 `.data-table th` 底用 `var(--surface-2)`；行 hover `var(--bg)`；
  `.table-skeleton i` 用 `surface-2` 渐变扫光可保留（`linear-gradient` 作 loading 动效允许）。
- 滚动条 thin、`::selection` 用 `soft`；`details/summary` 加 chevron 旋转过渡；
  `progress`、`steps`、`tabs`、`.accordion`、`.timeline` 按令牌统一圆角与状态色。
- 保留：全部类名与 `data-*` 钩子（runtime.js 依赖）、`dense` 密度规则、
  1180/760px 断点与 44px 触达高度、`prefers-reduced-motion`、`component:` 注释块
  （`component_css()` 按标记切分供 `show` 命令使用）。

### 2.3 `assets/shell.html`

- 结构基本不动；dialog 内 `<select>` 套 `.select-wrap` + chevron SVG；
  可在 `.topbar` 的 `.environment` 徽标改为 pill 圆角。CSP、`$` 占位符、`data-*`、
  skip 链接、aria 属性全部保留。

### 2.4 `assets/gallery.html`（demo 门户页）

- 同一语言重写内联样式：sticky 磨砂 header、品牌方块渐变、`.sample` 卡
  `border-radius:12px` + 弥散阴影 + hover `translateY(-2px)`、`.start` 实色主按钮、
  `.panel` 阴影不描边；保留 `$panels`/`$swatches` 占位与 DOM 结构、CSP meta。

### 2.5 生成物与验证

```bash
cd .agents/skills/uml-studio/../ucd-studio   # .agents/skills/ucd-studio
python scripts/make_demo.py                 # 重新生成 demo/ 全部页面与 design-system.md、manifest.json
python -m unittest discover -s tests -v    # 全量测试须通过
```

- `make_demo.py` 会为 demo 目录重写 manifest 并把历史快照写入仓库 `temp/ucd-studio-history`（不入库）。
- 每个生成页 `build()` 内置 `audit()` 自动执行；**任何 `url(`、外联、CSP 缺失都会失败**，注意 CSS 内不得出现 `url(`。
- `demo-history.zip` 若无引用可删除（可选，优先确认无引用）。
- 可新增 `DESIGN.md`（≤20 行）记录令牌与规则；文件总数保持 ≤100。
- `references/design-guidelines.md` 中与旧视觉冲突的语句（如"避免渐变"绝对化表述、radius 6px 记录）同步修正；SKILL.md 仅在事实变化时微调。

## 3. docs 与收尾

- 本文件为实施契约；`docs/uml-studio-redesign.md` 保留为上一轮记录，末尾追加本轮修正备注。
- 接受现有 `docs/{ucd-studio,uml-studio,webapp-testing}/` 删除（文档合并清理），
  修复 `README.md` 中指向被删文档的链接（改指 SKILL.md 或本文件）。
- 完成后 `git add -A` 提交并 `git push`。

## 4. 验收清单

1. uml-studio：`npm run typecheck && npm run build` 零错误；`node --test tests/*.test.mjs` 全过；
   按钮 computed style 无 gradient；brand-mark 保留渐变；`✓/→` 已 SVG 化；文件数 ≤99。
2. ucd-studio：`python -m unittest discover -s tests -v` 全过；`make_demo.py` 重新生成 9 页 + 门户；
   `ucd.py check` 静态检查通过；生成 HTML 无 `url(`/外联；文件数 ≤100。
3. 视觉抽查：磨砂 topbar、实色主按钮、卡片 hover 上浮、圆角、SVG 图标、select 定制态、
   dialog/toast/骨架屏风格统一、无 emoji/紫粉渐变/渐变文字。

## 5. 实施结果（2026-10-28）

**uml-studio（差量修正，99 文件）**

- `src/Studio.vue`：`.button-dark`/`.button-accent`/`.uml-editor-apply` 实色化（`--accent` →
  hover `--accent-deep`，保留上浮与彩色投影，disabled 用 color-mix 实色）；`--gradient-brand`
  仅 `.brand-mark` 使用；删除唯一的 CSS `url(`（summary chevron 改纯 CSS 边框绘制）；
  补齐 select/input/option 与 `.uml-*` 编辑器的 `:disabled` 态。
- `src/FormEditor.vue` 连线 `→`、`src/ColorInput.vue` 选中 `✓` 改内联 SVG。
- `PRODUCT.md` 并入 `DESIGN.md`；`tests/fixtures/` 两文件合并为 `login.json` 并更新测试。
- 验证：typecheck/build 零错误；`node --test tests/*.test.mjs` 98/98 通过；
  Playwright 实测 `.button-accent` `background-image:none`、`.brand-mark` 保留渐变、
  玻璃导航 `blur(16px) saturate(1.5)`。

**ucd-studio（全量重设计，82 文件）**

- `data/styles.json`：8 主题 `radius`→10px，各新增 `surface-2`/`line-strong`/`shadow`/
  `shadow-pop`/`ring`（midnight 深色变体）。
- `assets/base.css` 全量重写：sticky 磨砂 topbar、`.brand-mark` 唯一渐变、面板阴影不描边、
  `.btn-primary` 实色+上浮、`badge`/`environment` pill、nav active inset 环、`surface-2` 表头、
  focus-visible 光环、details/summary chevron 过渡、骨架屏扫光；组件标记与 DOM 钩子全保留。
- `scripts/render.py`：新增 `select_wrap()`/`input-wrap` 放大镜，四处 select 统一包裹；
  `assets/shell.html`、`assets/components/select.html` 同步。
- `assets/gallery.html` 门户页同语言重写（磨砂 header、`.sample` 卡上浮、实色 `.start`）。
- 新建 `DESIGN.md`；`design-guidelines.md` 的"不用渐变"限定为业务内容；`ucd.py` design_doc
  文案同步。`demo/` 9 页 + 门户由 `make_demo.py` 重新生成（含 manifest/design-system.md）。
- 验证：`python -m unittest` 16/16 通过；9 个 demo 目录 `ucd.py check` 全过；
  生成物 0 个 `url(`/外联；Playwright 实测 topbar 磨砂+sticky、`.btn-primary` 实色、
  `.panel` 弥散阴影、`.task`/`.sample` hover `translateY(-2px)`、dialog `--shadow-pop`、
  `.select-wrap` chevron 在位；midnight 主题深色令牌正确注入。
- `demo-history.zip` 保留（`USAGE.md` 明确引用）。

**docs 同步**：`docs/{ucd-studio,uml-studio,webapp-testing}/` 旧文档合并删除（本文件与
`docs/uml-studio-redesign.md` §7 为现行记录）；`README.md` 链接改指 SKILL.md 与重设计文档；
`.agents/skills/frontend-design/` 与 `.claude/skills/frontend-design/` 随 impeccable 替代关系删除。
验证脚本与截图存于 `temp/`（不入库）。
