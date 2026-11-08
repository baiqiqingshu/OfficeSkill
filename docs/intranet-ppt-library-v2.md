# intranet-ppt 元素库 v2 与预览页改版实施方案

## 背景

当前内置元素库 34 个组件，视觉以直角色块为主，缺少圆角、行距、字距和表头样式；`library-demo.html` 只按组件原尺寸平铺，组合示例复用同一段示例文案，无法直观看出组件在 1280×720 页面中的真实效果；预览页交互只有主题按钮。

本次改版目标：

1. 元素库扩展到约 45 个，覆盖内网技术方案/需求评审的高频页面：封面、议程、章节、架构图、流程图、表格、指标、对比、时间线、计划、结论。
2. 建立统一设计语言（圆角、留白、层级、强调方式），重做全部组件视觉。
3. 扩展受限 CSS 子集，使组件可以表达圆角、行距、字距和表头，并保证 PPTX 与 HTML 预览一致。
4. `library-demo.html` 改为「整页示例优先」：直接展示 1280×720 完整页面，再按库分组浏览组件；增加搜索、主题切换、整页灯箱、复制元素 JSON 等交互。
5. `preview.html` 改为带工具栏、缩放、页码导航和键盘操作的离线预览页。

## 设计语言

### 版式

- 页面 1280×720，左右安全边距 64px，正文区 1152px。
- 页标题：34px 粗体 `INK`，下方 48×4px 主色短条。
- 小节标题：左侧 6×30px 主色竖条 + 26px 粗体标题。
- 正文：20px / 行高 1.7；次要说明 16–18px `MUTED`。
- 卡片内边距 24px，卡片间距 16–24px。
- 圆角：卡片/面板 10px，大容器 12px，标签 6px，小徽标 4–8px，圆形元素 50%。

### 层级

- 页面背景保持白色；分组容器用 `BG_SOFT2`，强调块用 `BG_SOFT` / `SOFT_A`。
- 主色只用于：标题短条、序号、图标底、表头、结论条、关键数值。
- 不使用大面积深色底，除非是结论条、代码块和封面局部装饰。
- 弱化分割线：1px `BORDER_L`，不用粗边框。

### 色板

继续使用 `themes.py` 的规范色板，组件只允许使用这些 hex，保证 5 套主题可整体换色。代码块例外色 `#212B36/#D9E4EF/#3A4A5C` 保持不变。

v2 新增三个语义色，避免暗色主题下语义冲突：

- `SURFACE`（#FDFDFD）：白色卡片、表格正文、图片框背景；`graphite` 映射为深色面 `#1B2632`。
- `ACCENT_FILL`（#1476B9）/ `ACCENT_FILL_D`（#145D93）：承载白字的填充块（徽标、表头、结论条、方法标签）；`graphite` 映射为中等深度的蓝色，保证白字对比度。
- `WHITE`（#FFFFFF）只用于主色填充上的反白文字，暗色主题保持不变。

## 框架能力扩展

### components.py

1. CSS 子集新增：
   - `border-radius: Npx | 50%`：卡片、标签、圆形徽标。
   - `line-height: 0.8–3.0`：无单位倍数，正文可读性关键。
   - `letter-spacing: Npx`：小标签字距。
2. 列表标记扩展：`ul/ol` 的 `class` 决定前缀。
   - `class="check"` → `✓  `
   - `class="dash"` → `—  `
   - `class="num"` → `1. `（`ol` 默认）
   - 其余 `ul` → `•  `
   - 标记 run 使用列表自身颜色并加粗，随主题换色。
3. 表格表头：
   - 组件 HTML 中 `<thead><tr><th style="...">` 提供表头样式；编译时输出 `headerRows` 与 `headerStyle`。
   - `data-slot="rows"` 表格的正文行仍来自 JSON；表头只取样式。
   - 预览页与 PPTX 都应用表头填充、文字颜色、加粗、内边距和边框。
4. 场景节点新增样式字段：`borderRadius`（px 数值）、`lineHeight`（倍数）、`letterSpacing`（px 数值）、表格节点 `headerRows` / `headerStyle`。
5. `render_preview` 重做页面外壳：工具栏、页码导航、缩放（适应/100%/75%/50%）、键盘翻页、打印样式。

### pptx_backend.py

1. `borderRadius`：
   - `radius >= min(w,h)/2` → `MSO_SHAPE.OVAL`。
   - 否则 → `MSO_SHAPE.ROUNDED_RECTANGLE`，`adjustments[0] = radius/min(w,h)`。
   - 文字节点带圆角时改用形状承载文本；无圆角仍用文本框。
2. `lineHeight` → 段落 `line_spacing` 倍数。
3. `letterSpacing` → run `rPr@spc = px * 75`（1/100 磅）。
4. 表格：
   - 前 `headerRows` 行应用 `headerStyle`（文字 + 填充）。
   - 单元格显式写四边 `a:lnL/lnR/lnT/lnB`，颜色取 `borderColor`，宽度取 `borderWidth`，避免默认表格样式干扰。
5. 形状默认关闭主题阴影（`shadow.inherit = False`），保持扁平。

## 组件清单（v2 为 45，当前 49）

保留并重做（34）：`title` `text` `bullets` `card` `table` `image` `metric` `steps` `cover` `section-break` `agenda-item` `section-title` `caption` `footnote` `quote` `callout` `callout-warn` `callout-danger` `conclusion` `divider` `tag` `status` `field` `feature-card` `panel` `code` `image-frame` `flow-step` `flow-arrow` `timeline-item` `phase` `layer` `compare` `matrix2x2`。

新增（11）：

| id | 名称 | 用途 | 尺寸 |
| --- | --- | --- | --- |
| eyebrow | 眉标 | 页面顶部栏目/方案名，小方块 + 字距标签 | 320×28 |
| lead | 导语 | 标题下摘要，22px 弱化文字 | 1152×72 |
| checklist | 检查清单 | ✓ 前缀要点 | 1152×200 |
| thanks | 结束页 | 谢谢/敬请指正/联系方式 | 1152×240 |
| icon-badge | 图标徽标 | 圆形底 + 单字符符号 | 48×48 |
| stat-card | 指标卡 | 标签 + 大数值 + 变化 + 说明 | 360×180 |
| person-card | 人员卡 | 姓名 + 角色 + 职责 | 360×180 |
| api-item | 接口行 | 方法标签 + 路径 + 说明 | 1152×56 |
| arch-node | 架构节点 | 架构图中的单个系统/模块 | 240×96 |
| arch-zone | 架构分区 | 带标题的分层容器背景 | 1152×240 |
| timeline-h-item | 横向时间线节点 | 日期 + 标题 + 说明，横向排布 | 264×160 |

场景串讲 / IPD 追加（4）：

| id | 名称 | 用途 | 尺寸 |
| --- | --- | --- | --- |
| outline | 多级要点 | 1–4 级嵌套要点，`{"level":2,"text":"…"}` | 1152×260 |
| ui-frame | 界面示意图 | 窗口标题条 + 界面截图 + 图注 | 640×440 |
| figure | 图示框 | 小标签 + 标题 + 流程图/UML/架构图 + 图注 | 704×480 |
| ar-header | AR 页头 | SR/AR/场景面包屑 + AR 标题 + 场景序号 | 1152×100 |

## 整页示例

新增 `examples/technical-proposal.json`，约 11 页，全部使用内置组件在 1280×720 页面内编排：

1. 封面（cover + footnote）
2. 汇报议程（title + agenda-item ×4）
3. 章节过渡（section-break）
4. 现状与目标（title + lead + feature-card ×3 + callout）
5. 总体架构（title + arch-zone ×3 + arch-node ×9）
6. 核心流程（title + flow-step ×4 + flow-arrow ×3）
7. 需求清单（title + table + footnote）
8. 关键指标（title + stat-card ×3 + bullets）
9. 方案对比（title + compare + conclusion）
10. 实施计划（title + timeline-h-item ×4 + phase ×4）
11. 结束页（thanks）

该文件同时作为 `starter` 示例和 demo 的整页展示来源，避免重复维护。

## Demo 页面

`library-demo.html` 结构：

- 左侧固定导航：产品名、搜索框、主题色板、整页示例/组件分组锚点。
- 主区顶部：标题、说明、统计（组件数、整页数）。
- 「整页示例」：读取 `examples/*.json`，按 1280×720 编译并等比缩放展示，附页标题与组件清单；点击打开灯箱，支持左右切换。
- 「组件库」：按库分组卡片，显示中文名、`库ID/组件ID`、尺寸、inputs 签名、缩放预览、示例 JSON（折叠）、复制元素 JSON 按钮。
- 搜索：按名称/ID/描述实时过滤，隐藏空分组。
- 主题：5 套色板按钮，切换后整页示例和组件预览同步换色（沿用 hex 全词替换）。
- 纯离线单文件，内联 CSS/JS，无外部字体与网络请求。

## 预览页

`preview.html` 结构：

- 顶部粘性工具栏：标题、页数、缩放按钮（适应/100%/75%/50%）、打印。
- 左侧页码导航（窄屏隐藏），主区为带阴影的幻灯片卡片。
- 键盘 `↑/↓/PgUp/PgDn` 滚动翻页，`+/-` 缩放。
- 打印时隐藏工具栏，每页分页。

## 验证

1. `python scripts/ppt_tool.py catalog` 零错误，组件数 49（v2 时 45，场景/IPD 扩展后 49）。
2. `python scripts/ppt_tool.py validate examples/*.json` 全部通过。
3. `python scripts/ppt_tool.py render examples/technical-proposal.json --out output/technical-proposal` 生成 PPTX 与 preview。
4. `python scripts/ppt_tool.py demo --out output/library-demo` 生成 demo；用 headless Chrome 截图检查整页示例和组件卡片。
5. 用 python-pptx 重新打开生成的 PPTX，抽查圆角、表头、行距、字距是否写入 XML。

## 风险

- 圆角文字节点改形状后，PowerPoint 中的默认内边距/自动换行可能与文本框略有差异；组件统一显式 padding 与固定高度。
- 表格边框需要直接写 DrawingML；需检查 XML 顺序，避免 PowerPoint 修复提示。
- 行距倍数在 LibreOffice 与 PowerPoint 的渲染略有差异，属已知差异，以 PowerPoint 为准。
- 第三方库仍可使用旧子集；新增能力为向后兼容的可选项。

## 实施结果（2026-11-08）

已完成：

1. 内置库 34 → 45 个组件，全部重做视觉；新增 `eyebrow`、`lead`、`checklist`、`thanks`、`icon-badge`、`stat-card`、`person-card`、`api-item`、`arch-node`、`arch-zone`、`timeline-h-item`。
2. `components.py` 支持 `border-radius`、`line-height`、`letter-spacing`、列表 `class="check|dash|num"`、`thead/th` 表头；场景节点新增对应字段。
3. `pptx_backend.py` 支持圆角/圆形、段落行距、字距、表头样式、单元格四边框、关闭主题阴影；圆角文字节点改用形状承载文本。
4. `render_preview` 重做为带工具栏、页码导航、缩放、键盘翻页和打印样式的离线预览页。
5. `demo.py` 重做：整页示例分页签 + 2 列幻灯片网格 + 灯箱翻页，组件库分组卡片 + 搜索 + 复制元素 JSON + 5 主题换色；侧栏深色、主区浅色。
6. 新增 `examples/technical-proposal.json`（11 页完整技术方案），同时作为 starter 示例和 demo 整页示例来源。
7. 新增主题语义色 `SURFACE`（卡片/表格白底）、`ACCENT_FILL` / `ACCENT_FILL_D`（白字填充），修复 `graphite` 暗色主题下白卡浅字、浅填充白字不可读的问题；默认主题改为 `crimson`（深红），默认母版背景/主色条/页脚线随主题生成。
8. `SKILL.md`、`references/library-format.md` 已同步组件清单、CSS 子集、表头/列表约定、主题色板与 demo 说明。

## 验收记录

- `catalog`：45 个组件，零错误。
- `validate` / `render`：`technical-proposal`（11 页）、`technical-report`、`solution-review`、`requirements-review` 全部通过。
- `starter`：输出 4 个示例和默认母版。
- `demo`：4 个 deck、20 页整页示例、45 个组件，无跳过页；搜索、主题往返切换、灯箱、复制、键盘导航均通过 headless Chrome 验证，无控制台错误、无外部请求。
- 默认主题为 `crimson`（深红）；本机 PowerPoint 导出 PNG 抽查深红与石墨黑主题的封面、架构、表格、指标、计划页均正常；圆角、表头、行距、字距生效；石墨黑默认母版为深色。
- 已知限制：不支持 flex/grid、渐变、图表脚本和任意网页转换；行距倍数在不同渲染器中有轻微差异；第三方库若仍把 `#FFFFFF` 当卡片底色，在 `graphite` 下不会自动变深，应改用 `SURFACE`。

## 场景串讲扩展（2026-11-08 追加）

- 组件 45 → 48：`outline`、`ui-frame`、`figure`。
- `list` 输入统一支持 1–4 级条目，多级前缀与缩进同时适用于 HTML 预览和 PPTX 文本。
- 表格改为内容驱动行高：编译期输出 `rowHeights`，HTML 使用 `height:auto`，PPTX 逐行写 `table.rows[i].height` 并收缩 GraphicFrame；表格不再额外绘制整框背景矩形。
- 新增 `examples/scenario-walkthrough.json`（12 页）和 `examples/images/` 三张本地示意图，覆盖背景、前置条件、主成功、分支、异常、后置状态，以及界面示意图、流程图、UML、表格、多级分点和说明文本。
- 验收：`catalog` 48 个组件；5 份示例 `validate` 全部通过；`demo` 输出 5 个 deck、32 页、48 个组件、无跳过页；PPTX 表格行高之和等于 GraphicFrame 高度。

## IPD IR/SR/AR 需求串讲扩展（2026-11-08 追加）

- 组件 48 → 49，新增 `ar-header`（AR 页头，1152×100）：面包屑 + 32px AR 标题 + 右侧场景序号。
- 新增 `examples/ipd-walkthrough.json`（31 页）：封面、IR 概述、SR 列表、AR 列表，2 个 SR 标题页，每个 SR 下 2 个 AR × 6 个场景页（背景、主成功、异常、后置、前置、分支），最后回顾页。
- 每个 AR 页标题统一为 AR 名称；场景类型由 `ar-header.crumb` 标注。
- 验收：`catalog` 49 个组件；6 份示例 `validate` 全部通过；`demo` 输出 6 个 deck、63 页、49 个组件、无跳过页。
