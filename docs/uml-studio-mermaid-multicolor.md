# UML Studio：Mermaid 兼容、多色风格与编辑体验优化（实施文档）

> 范围：`.agents/skills/uml-studio`。以代码为准；本文记录本轮设计决策与落点，完成后同步到 SKILL.md 与本文“现状”一节。

## 1. 背景与问题

| # | 用户反馈 | 代码现状（排查结论） |
|---|---|---|
| 1 | 本地大量 Mermaid 图无法迁移；时序 `box`、`Note`、分割等元素不支持 | 无任何 Mermaid 解析；时序只支持 `sync/async/return/create/destroy` 消息与 `alt/opt/loop/par` 片段，单个 `elseAt`；参与者只有 `actor/participant/database`；节点图缺少 Mermaid 常见形状（圆角胶囊、子程序、平行四边形、六边形、圆…）与箭头变体（无箭头、圆头、叉头、双向、粗线） |
| 2 | 默认字号/字重偏小 | `themes.ts` 基础主题 `fontSize:15, fontWeight:400` |
| 3 | 拖动无对齐、连线松手后才重算、卡顿 | `DiagramCanvas.vue` 只对被拖元素设置 `transform`；松手先**还原 transform** 再异步整图重排，产生“回弹→跳到新位置”；pointermove 未节流；无吸附 |
| 4 | 表单“重置表单 / 应用表单”在底部 | `FormEditor.vue` 中 `footer.uml-editor-actions` 粘底 |
| 5 | 授权本地保存默认目录 | 文件句柄只存于会话内；建议文件名取文档标题；不记忆目录 |
| 6 | 新增图表报“未找到「进程视图」示例” | `viewer.ts` 只 glob `examples/*.json`，缺 `logical/development/process/physical/scenario`（只在 `examples/scenarios/`） |
| 7 | 视觉风格只有单色 | `Theme` 只有单一 `surface/primary`，无调色板 |

## 2. 设计

### 2.1 数据模型扩展（向后兼容，旧 JSON 不变）

**时序图**
- `messages[].kind` 新增 `note`、`divider`：
  - `note`：`from`（必填）、`to`（可选，跨两人时为 over 范围）、`position: left|right|over`（缺省 over），`label` 为备注文字。占用消息索引，可被片段包含，不参与编号与激活。
  - `divider`：分割线（PlantUML `== 标题 ==` 等价），`label` 可空，`from/to` 可省略。
- `messages[]` 新增可选 `arrow: filled|open|none|cross`、`dashed`、`bidirectional`，覆盖 kind 的默认线型（对齐 Mermaid `->` `-->` `-x` `--x` `-)` `<<->>`）。
- `participants[].kind` 新增 `boundary|control|entity|collections|queue`。
- `fragments[].kind` 新增 `critical|break|rect`；新增 `elses:[{at,label}]` 支持多分支（`alt` 多个 `else`、`par` 多个 `and`、`critical` 多个 `option`）；`rect` 用 `color` 作底色高亮。
- 顶层 `boxes:[{label,participants:[id],color?}]`：参与者分组框（Mermaid `box`）。
- `layout.autonumber`（默认 `true` 保持旧行为）；Mermaid 导入时默认 `false`，遇 `autonumber` 才开启。

**节点图**
- `nodes[].kind` 新增 `terminal`（胶囊/stadium）、`subroutine`、`io`（平行四边形）、`hexagon`、`circle`、`trapezoid`。
- `edges[]` 新增 `arrow`/`startArrow: none|arrow|open|triangle|circle|cross`、`thick`。

**样式**
- `Theme`/`style` 新增 `palette: string[]`、`paletteMode: mono|tint|solid|gradient`、`paletteBy: auto|group|kind|node`。

### 2.2 Mermaid 导入器 `src/mermaid.ts`

纯函数 `mermaidToDocument(source)`：支持 Markdown 中多个 ```` ```mermaid ```` 块、`---title---` front matter、`%%` 注释。

| Mermaid | 映射 |
|---|---|
| `flowchart/graph TB/TD/BT/LR/RL` | `flowchart`，RL→LR、BT→TB；`subgraph`→嵌套 `groups`；`classDef/class/style/:::`→节点 `style`；全部节点形状与链接写法（`-->` `---` `-.->` `==>` `--o` `--x` `<-->` `~~~`、`-- 文本 -->`、`-->|文本|`、`A & B --> C`、链式）；`@{shape:…}` 常见形状 |
| `sequenceDiagram` | 参与者/别名/`actor`/`box`/`create`/`destroy`、全部箭头、`+/-` 与 `activate/deactivate`、`Note left/right/over`、`loop/alt/else/opt/par/and/critical/option/break/rect`、`autonumber`、`title` |
| `stateDiagram(-v2)` | `[*]` 起止、`state "x" as a`、`a : 描述`、复合状态→`groups`、`<<choice/fork/join>>`、`note … of`、`direction` |
| `classDiagram` | 类/成员/泛型、`<<interface>>` 等注解、全部关系与基数、`namespace`→包分组、`note for` |

非 Mermaid ID（中文、空格等）自动转为合法 ID 并保留原文为标签。未知语句收集为警告，不中断导入。

入口：
- CLI：输入文件扩展名 `.mmd/.mermaid/.md` 或 stdin 非 JSON/HTML 文本自动按 Mermaid 解析；`--mermaid '<源码>'` 直接传源码。
- 网页：“导入”支持 `.mmd/.mermaid/.md`（追加为新图，不替换现有）；源码编辑器可直接粘贴 Mermaid 后“应用”，自动转换为 JSON；侧栏新增“粘贴 Mermaid 新增”。

### 2.3 多色渲染

`src/palette.ts`：颜色解析/混合/对比度；`paintFor(theme, index)` 返回 `{fill, stroke, text, muted, gradient?}`。
- `tint`：浅色填充 + 彩色描边，深色文字。
- `solid`：实色填充，按亮度自动黑/白文字。
- `gradient`：竖向线性渐变（亮→本色），白字；SVG `linearGradient` 由 `frame()` 统一加前缀隔离，resvg 原生导出支持。
- 着色依据 `auto`：有分组/泳道按分组，否则按节点序；`kind` 按节点类型；`node` 逐节点。起止/分叉/汇合保持主色。
- 分组/泳道：按分组色浅染底色与标题色；时序参与者按序（或按 box）着色，激活条用浅色；鱼骨分类按序着色。

新增主题：`vivid` 缤纷彩色（solid）、`pastel` 马卡龙（tint）、`business` 商务多彩（tint）、`steel` 工业渐变（gradient）、`aurora` 极光渐变（gradient）、`neon` 暗夜霓虹（solid，深色底）。样式面板新增“多色模式 / 着色依据”，可让任意单色主题叠加默认调色板。

### 2.4 默认字体
基础主题 `fontSize 15→16`、`fontWeight 400→500`（正文 500，节点标题 700）；时序片段标签、图例等固定字号同步放大。

### 2.5 拖动体验（`DiagramCanvas.vue`）
- 拖动开始时缓存所有可调整元素的布局坐标包围盒、相关连线与标签。
- `pointermove` 用 `requestAnimationFrame` 合并；对其它元素的左/中/右、上/中/下边做 6px（屏幕像素）吸附并绘制参考线；按住 `Alt` 临时关闭吸附。
- 连线跟随：与被拖节点（或分组内全部节点）相连的连线，实时用正交折线临时重绘（隐藏原路径与跳线），标签按端点位移的一半跟随；分组拖动时成员节点一起移动。
- 松手提交后**保留**预览位置直至新渲染替换，不再回弹。

### 2.6 表单按钮
“重置表单 / 应用表单”移入顶部粘性工具区（检索区上方），错误信息同处显示。

### 2.7 本地保存
- 建议文件名：页面为 `file://` 时取当前 HTML 文件名，否则取文档标题。
- 用 IndexedDB 记住“当前页面地址 → 文件句柄”，重开同一 HTML 后点击即可请求权限直接同步。
- picker 传 `startIn`（最近一次的文件句柄或用户设置的默认目录）与固定 `id`，使对话框打开在上次目录；新增“设置默认目录”。浏览器安全模型不允许脚本用任意路径作为起始目录，因此页面在提示中显示当前 HTML 所在目录，首次选择后即被记住。

### 2.8 新增图表修复
`viewer.ts` 同时加载 `examples/*.json` 与 `examples/scenarios/*.json`（前者优先），保证 18 类都有示例。

## 3. 验证
- `npm run build`（含 vue-tsc 类型检查）。
- Node 冒烟：所有示例 + Mermaid 样例经 `renderDiagram` 与原生 PNG 导出。
- 现有 `npm test` 允许因默认字号变化产生的尺寸断言差异，后续迭代修正。

## 4. 现状（已实施）

| 项 | 落点 |
|---|---|
| Mermaid 导入 | `src/mermaid.ts`（导出于 `@office/uml-studio`：`mermaidToDocument / mermaidToSpec / isMermaidSource / extractMermaidBlocks`）；CLI `scripts/diagram.mjs` 识别 `.mmd/.mermaid/.md/.markdown`、stdin 与 `--mermaid`；网页“导入”、侧栏“粘贴 Mermaid 新增”、源码框粘贴后应用。样例 `examples/mermaid/samples.md` |
| 时序扩展 | `src/special.ts` `renderSequence` 重写：note / divider 行、box、critical / break / rect、多分支 `elses`、箭头 `arrow/dashed/bidirectional`、5 种新参与者图元、`layout.autonumber` |
| 节点图扩展 | `src/graph.ts`：6 种新形状及端点裁切、`arrow/startArrow/thick`、新增反向/圆头/叉头 marker |
| 多色 | `src/palette.ts`；`themes.ts` 现提供 7 套多色主题（含默认主题 `modern` 现代多彩，详见 `docs/uml-studio-layout-and-style.md`）与 `paletteModes/paletteTargets`；样式面板“多色模式 / 着色依据”；主题卡片显示色板 |
| 字体 | 基础主题 `fontSize 16 / fontWeight 500` |
| 拖动 | `DiagramCanvas.vue`：rAF 合并、吸附参考线（Alt 关闭）、连线实时正交跟随、分组成员随动、松手保持预览 |
| 表单按钮 | `FormEditor.vue` 顶部粘性工具区 |
| 本地保存 | `filesystem-save.ts`：IndexedDB 记忆句柄、默认目录、`startIn/id`、当前 HTML 文件名；“更多导出”显示当前 HTML 目录 |
| 新增图表 | `viewer.ts` 同时加载 `examples/scenarios/*.json`，18 类均可新增 |

已知限制（后续迭代）：
- Mermaid 的 `linkStyle`、`click`、主题指令 `%%{init}%%` 被忽略；子图内 `direction` 不生效；`erDiagram/gantt/mindmap` 等图类型暂不支持。
- 拖动时连线跟随为预览用的简单正交折线，松手后由布局引擎重新路由；时序图、鱼骨图拖动仅元素本身预览。
- 浏览器安全模型不允许以任意路径作为保存对话框起始目录，只能通过记住的句柄 / 默认目录实现。
