---
name: uml-studio
description: 根据结构化 JSON 绘制 UML 活动图、时序图、泳道图、流程图、用例图、类图、状态图、组件图、包图，以及系统架构、功能模块、部署、4+1 视图和鱼骨图。输出可离线编辑的 HTML 或 SVG、PNG、JPEG、WebP 图片；用户要求草稿时先提供可直接修改的 ASCII / Unicode 纯文本图。
license: MIT
metadata:
  version: "1.1.0"
---

# UML Studio

模型负责语义与结构，组件负责布局、图元、样式及导出。不要让模型生成节点坐标、SVG 路径或 draw.io XML。

## 选择图类型

| 用户内容 | `type` | 数据字段 | 示例 |
|---|---|---|---|
| 活动、流程、跨角色流程 | `activity` / `flowchart` / `swimlane` | `nodes`, `edges`，泳道另用 `lanes` | `examples/activity.json` 等 |
| 参与者之间的消息 | `sequence` | `participants`, `messages`, 可选 `fragments` | `examples/sequence.json` |
| 角色、业务能力、系统边界 | `usecase` | `nodes`, `edges`, `groups` | `examples/usecase.json` |
| 类、状态、组件、包 | `class` / `state` / `component` / `package` | `nodes`, `edges`, 可选 `groups` | 同名示例 |
| 系统架构、功能模块、部署 | `architecture` / `module` / `deployment` | `nodes`, `edges`, 可选嵌套 `groups` | 同名示例 |
| 4+1：逻辑、开发、进程、物理、场景 | `logical` / `development` / `process` / `physical` / `scenario` | `nodes`, `edges`, 可选 `groups` | `examples/scenarios/` 同名文件 |
| 原因分析、鱼骨图 | `fishbone` | `fishbone.effect`, `fishbone.categories` | `examples/fishbone.json` |

4+1 是架构视角，不是五种新的 UML 记法。选择视角后，以有明确语义的类、组件、包、部署节点或业务场景表达；不要把同一张架构图改标题充当五个视图。

## Agent 工作流

先判断交付阶段：用户说“先给草稿”“先看文字流程”“先不生成文件”等时，进入下方的**纯文本草稿模式**，本轮不执行 HTML / 图片生成。用户直接要求成品时，按以下流程生成，不强制先确认草稿。两种模式都先精炼元素文字（见“布局与文字”）。

以下命令在本 SKILL 目录执行；从其它目录调用时，使用脚本和数据文件的实际路径。输出路径相对当前工作目录。

1. 单图读取 `schemas/diagram.schema.json` 和对应 `examples/<type>.json`（4+1 视图读 `examples/scenarios/<type>.json`）；多图读取 `schemas/document.schema.json` 与 `examples/documents/gallery.json`。不照搬示例中的业务事实。
2. 单图使用 `version:1,type,title`；多图使用 `version:1,title,diagrams:[...]`。同类图可以重复，每张独立保存主题、布局、数据；可选图形 `id` 在文档内唯一，节点 ID 只须在各自图内唯一。
3. 验证再生成。默认海蓝主题、均衡布局、隐藏图内标题；只有用户要求标题时才设置 `layout.showTitle:true`。不要生成坐标或 SVG 路径。

```bash
node scripts/diagram.mjs input.json --validate
node scripts/diagram.mjs input.json --out output.html
node scripts/diagram.mjs input.json --out output.html --image output.png --scale 2
node scripts/diagram.mjs input.json --image output.svg
node scripts/diagram.mjs input.json --image output.jpeg --quality 0.92
node scripts/diagram.mjs input.json --image output.webp --theme ocean
node scripts/diagram.mjs saved.html --diagram 2 --image selected.png
node scripts/diagram.mjs saved.html --all --out-dir images --format webp --scale 1
node scripts/diagram.mjs examples/documents/gallery.json --out design-book.html
```

4. 检查命令退出码和生成回执。HTML 必须能在浏览器打开；修改数据/主题后，重新导出并检查对应图片。修改渲染源码后先完整构建，再重新生成 HTML 和图片，避免旧 HTML 内嵌运行时与新原生引擎混用。不要把 HTML 页面截图当作 diagram-only 图片导出。
5. 返回用户要的文件路径，注明图类型及实际验证的格式。用户只要图片时可只交付图片，但建议保留可编辑 HTML。

SVG、PNG、JPEG、WebP 均可在 Node 中直接导出，不安装、不启动浏览器。CLI 从 HTML 的惰性 JSON 数据块读取完整文档，不执行网页脚本；SVG 使用本地绘图引擎，位图使用 resvg / sharp。多图必须用 `--diagram` 选择从 1 开始的序号或图形 id，或用 `--all --out-dir` 批量输出，避免只导出第一张而遗漏其余图形。

### 纯文本草稿模式

- 直接在回复的 `text` 代码块中手工绘制多行 ASCII / Unicode Art，用 `┌─┐│└─┘`、`→↓`、`◇` 等字符组成框、连线和分支。也可全用 ASCII。不能以 Mermaid、JSON、HTML、图片或仅有步骤列表代替文字图；此阶段不生成 HTML / 图片文件。
- 保留用户要求的节点、先后、分支条件、回路和职责/区域；框内文字短而明确，分支在线旁标注。尽量用窄图，按中文显示宽度对齐；回路过长时用一致的 `[A]` 跳转标记并写明目标。不同图型使用相应文字结构（如时序列、泳道列），不强行改成线性流程。文字连线交叉也须避免歧义：优先绕开，或用跳转标记；仅在实际连通时使用 `●`。
- 草稿结尾简短说明可以直接修改文字图并回传。用户继续改草稿时返回更新后的完整文字图；用户要求定稿、HTML 或图片时，以最新草稿及补充要求提取结构化 JSON，再走成品流程。文字位置只用于阅读，不转成渲染坐标。业务关系仍有歧义时，只澄清会改变图意的信息。

示例（含条件和回路，`[A]` 表示返回评审）：

```text
        ┌──────────┐
        │ 提交需求 │
        └────┬─────┘
             ↓
    [A] ┌──────────┐
        │ 评审需求 │
        └────┬─────┘
             ↓
       ◇ 评审通过？◇
        │         │
       是        否
        ↓         ↓
 ┌──────────┐ ┌──────────┐
 │ 进入迭代 │ │ 修改需求 │
 └──────────┘ └────┬─────┘
                  └──→ [A]
```

## 安装与构建

已附带运行资源、构建产物与 Schema。全新环境先安装本地 npm 依赖；原生位图编码库由 npm 安装，不需要 Chromium。仅浏览已生成的 HTML 不需要 Node。

```bash
npm install
# 修改组件源码后才需要重新构建
npm run build
# 开发 26 图场景册，覆盖全部 18 类与复杂布局对照
npm run dev
# 导出逐图 SVG / PNG、检查报告和视觉拼图至工作区 temp/
npm run demo:verify
```

安装、构建、开发命令也可在 OfficeSkill 根目录执行；Demo 维护命令在本 SKILL 目录执行。`npm run diagram -- ...` 是根目录 CLI 入口。

修改组件源码时，下拉框一律用 `src/VSelect.vue`（用法与原生 `<select>` 相同：`v-model`/`v-model.number` 或 `:value`+`@change`，插槽写 `<option>`/`<optgroup>`），不得新写裸 `<select>`——`appearance:none` 只能美化关闭态，打开的原生选项列表不受 CSS 控制。模式与细节见 DESIGN.md。

完整构建将公开类型声明归并为 `dist/core.d.ts`、`dist/index.d.ts`、`dist/native.d.ts`，三个包入口及 API 保持不变。逐文件声明中间产物与 Vite 缓存在仓库 `temp/uml-studio-types/`、`temp/uml-studio-vite/`；独立安装时使用系统临时目录，不写回技能目录。组件样式保留在 Vue 文件的全局 style 中。构建将 LICENSE 中的 Fishbone Studio MIT 附录与依赖许可一起写入 THIRD_PARTY_NOTICES.txt、运行时和离线 HTML，维护时须保留。

复杂输入参考 `examples/scenarios/<type>.json`，入门集合保留在 `examples/documents/quickstart.json`。场景索引、布局对照与验证方法见 [references/demo-coverage.md](references/demo-coverage.md)。修改场景源文件后运行 `npm run demo:refresh` 或完整构建来更新设计册。

## JSON 规则

- 主结构见 schema。除通用元数据外，图节点、时序和鱼骨数据不可混用；未知字段会报错，不静默丢弃。
- 默认 `theme:"ocean"`；还支持 `white,paper,forest,blueprint,midnight,lavender,rose,amber,slate,mint`。`white` 为“纯白”预设，图表背景和节点表面均为 `#ffffff`，使用深色文字与蓝色线条，适合文档插图。`style` 覆盖主题，节点可覆盖各自样式；网页切换主题会清除全局自定义覆盖。
- 色值支持十六进制 `#RGB` / `#RRGGBB` 和 `transparent`。网页支持粘贴色值、系统拾色器与精选色板。PNG / WebP / SVG 可保留透明；JPEG 无透明通道，铺白底。字体使用本机字体；Node 导出可重复传入 `--font-file path.ttf`，不下载远程字体。
- `direction: "TB" | "LR"` 控制图布局；用例图默认 `LR`，其它节点图默认 `TB`。开始 / 结束节点使用独立的顶部 / 底部留白带；单开始、单结束的符号中心固定同轴，不通过横移结束节点挤占其它节点。显式 `LR` 时对应左 / 右及同一水平轴。起止带位于区域容器外，节点的 `group/lane` 数据仍保留。普通节点关系按正交折线路由，用例图关系按 UML 常见的直线路由，交叉处再按 `layout.edgeCrossing` 绘制。时序顺序由 `messages` 顺序决定，鱼骨分类按数组顺序排列。
- `layout.edgeCrossing: "bridge" | "plain"` 控制当前节点图的连线交叉表示。默认 `bridge` 在穿越处画拱桥形跳线（小半圆弧），表示不相连；`plain` 保留直接交叉，正交线形成无圆点的十字，也表示不相连，不改变用例图斜线方向。共用端点、共线重合不添加跳线；密集交叉合并相邻拱桥，端点或折角附近空间不足、两侧均被节点/文字阻挡时保留原线。设置不改变拓扑，时序图生命线和鱼骨分支不使用此选项。网页“连线”表单和“布局与尺寸”均可设置，保存 HTML / JSON 与图片导出保留该选择。真实连通必须显式建节点并让连线引用它；不可将几何交叉自动解释为连接，或给所有交叉加实心圆点。
- 泳道图：`lanes` 声明职责，所有节点必须设置 `lane`。分组使用 `groups` 和节点 `group`；`parent` 允许嵌套，禁止循环包含。
- 类节点可有 `attributes`、`operations`；用 `kind` 选择 UML 图元。依赖、包含、扩展、继承、实现、聚合、组合用连线 `kind`，不要只改标签冒充 UML 关系。
- 时序消息支持 `sync`、`async`、`return`、`create`、`destroy`。`activate` 打开接收方激活条；`return` 的 `deactivate` 关闭发送方激活，其他消息关闭接收方激活。销毁关闭目标的全部激活，未关闭的激活绘至图底；`database` 参与者使用标准圆柱体图元。
- `fragments` 支持 `alt`、`opt`、`loop`、`par`，使用从 0 开始、首尾包含的消息索引；`alt` / `par` 的 `elseAt` 是第二分支首条消息索引，`elseLabel` 描述该分支。长消息和条件文字自动换行并扩展时间轴间距。
- 鱼骨 `causes` 可有递归 `children`，保留原因层级。默认 `fishbone.headStyle:"classic"` 保留原版鱼头、文字比例和鱼骨样式；未设置时也使用原版。可显式选择 `fish`、`slim`、`shark`、`roundfish`、`carp`、`sunfish`、`triangle`、`rounded`、`label` 九种附加轮廓，不改变原因、层级及连接。网页鱼骨表单可选择，保存 HTML / JSON 和 SVG / PNG / JPEG / WebP 导出保留该值。

### 布局与文字

分析输入时先提炼元素的核心信息，再写标签；节点、连线、参与者、区域和鱼骨原因都应精炼，避免把原文段落塞进图中：

- 动作优先用“动词＋对象”（如“校验订单”），组件/角色用简短名称，判断用短问题（如“库存充足？”），条件放在线旁（如“是 / 否”）。一般以一行或两行可读短语为目标，不机械限制字数。
- 合并重复措辞、去掉空泛修饰，保留否定、阈值、时限、责任人及用户指定术语等会改变图意的信息。例如“系统对用户提交的订单信息进行完整性校验”可写成“校验订单完整性”。
- 必要解释放在简短 `detail`、图的 `description` 或图外说明中，避免用长 `detail` 把节点再次撑成段落；复杂内容按视角拆图。用户要求逐字保留时遵循原文，不擅自删减节点、关系或业务条件，也不用缩小字号掩盖冗长。

`layout.mode` 支持 `compact`、`balanced`（默认）、`spacious`、`grid`。紧凑默认元素 / 区域间距为 24 / 40；均衡为 48 / 72；网格默认每列 3 个节点。显式 `layout.elementGap/regionGap` 优先于 `style.gap`，后者优先于模式默认值。网页切换模式会清除间距覆盖，使预设立即生效。
- 用例图按角色关联排列业务用例，将包含 / 扩展能力放入辅助列；比较行序与角色在边界两侧的位置，优先避免直线穿过无关元素，再减少交叉和线长。角色的同侧关联共用端口，椭圆端点按实际轮廓裁切；保留显式分组、嵌套边界及每列数量限制。
- 其它节点图按连接关系布局：先分离回退边，再由 ELK 排列主流程；回退关系仍保留并从侧边绕回，不把返工步骤排到入口之前。布局优先让同一连接层级的节点共享行 / 列，保留已形成的中心线对齐；混合高度的横向主链不应改为顶边对齐后再用折线补偿。同一方向的多条关系复用源节点端口，再分配目标端口。间距配置不会切换到忽略连接关系的数组平铺。
- 同级分组区域（含嵌套分组）横向排列。泳道按 `direction` 连续相接，共用分隔边界和流程长度，`regionGap` 不在泳道之间留缝。默认道内节点沿泳道主轴排列；从完整流程识别回退关系，再确定道内先后，避免跨泳道回路把返工步骤排到入口之前。显式网格折列和嵌套分组保留各自布局。跨区域 / 跨列直接相连节点优先同一行；横向泳道对应同一列。对齐不得导致节点重叠、破坏列内先后关系或挤出所属区域；无法同时满足时保留顺序与避让。
- `maxPerColumn` 按连接关系排序后蛇形折列，相邻列交接节点尽量同一行；开始 / 结束不计入列内上限。未指定上限时，直接节点数超过 6、且高度超过同级区域典型高度两倍的区域会自动分列；显式 `0` 禁止自动折列。折列、对齐完成后统一重新路由，优先短路径、少折点、少交叉与少重叠，避让节点、标题和外置文字；分支标签需要时会扩大列间留白。
- 连线标注优先贴近本关系的独立线段；决策分支在分叉后标注，端点标注靠近对应端点。布局为文字预留必要间距，密集区域无法就近避让时用引线明确指向原连线，不把文字孤立移到其它分支旁。

可设置 `showTitle`、`maxWidth/maxHeight`（整图等比上限，不裁切）、`nodeMaxWidth/nodeMaxHeight`（节点换行后自适应缩放）、`elementGap`、`regionGap`、`maxPerColumn`。尺寸上限和显式每列数量为 0 表示不限；未设置每列数量仍允许上述不均衡区域自动折列。节点尺寸 / 每列数量只用于节点图，时序与鱼骨使用专用布局。不要用缩小字号代替删减用户要求的内容；极小节点上限会缩小文字，应按可读性设置。

文字使用 `style.fontFamily,fontSize,fontWeight,fontStyle,textDecoration`；字形为 `normal/italic`，装饰为 `none/underline`。可从字体预设选择，也可输入自定义回退列表。

最小流程示例：

```json
{
  "version": 1,
  "type": "flowchart",
  "title": "需求评审流程",
  "theme": "ocean",
  "nodes": [
    { "id": "review", "label": "评审需求", "kind": "action" },
    { "id": "accept", "label": "评审通过？", "kind": "decision" },
    { "id": "plan", "label": "进入迭代", "kind": "action" }
  ],
  "edges": [
    { "from": "review", "to": "accept" },
    { "from": "accept", "to": "plan", "label": "是" },
    { "from": "accept", "to": "review", "label": "修改后重审" }
  ]
}
```

## 单个 HTML 契约

- `#diagram-data` application/json 数据块保存单图或完整多图文档。多图用 `diagrams` 数组，不能以 `type` 为字典键，否则会丢失同类图。
- 全部 Vue / 布局 JS、CSS、数据内联，无 CDN 与远程字体，断网后仍可打开；只保存当前已应用的数据，未应用草稿会明确提示。
- 页面支持表单 / 源码切换、增删图形、复制当前图、独立主题、滚轮定点缩放及拖拽平移。默认优先显示画布，点击“编辑图表”打开编辑器；点击“调整样式”展开预览下方的主题、配色及进阶参数。导出图片、复制图片及格式 / 倍率集中在画布上方，文档 JSON 位于“更多导出”，顶部“保存 HTML”保存全部已应用图表。窄屏图表列表为可关闭抽屉、编辑器整行显示。拖动的是预览画布，不改变结构化模型中的节点位置。
- 表单支持全部展开 / 全部折叠、按内容检索（仅显示命中元素及必要上级）和清空检索。表单编辑器打开时，点击预览中的元素会展开并滚动定位相应表单，突出显示目标；检索隐藏目标时会清空检索。拖动画布不会触发定位。此功能不更改图表数据或布局。旧 HTML 需用更新后的运行时重新生成才能获得这些功能。
- 下载按钮下的“复制图片（PNG）”写入图片剪贴板，不下载、不复制 URL。需要支持 ClipboardItem 的安全页面环境与权限；不支持或权限被拒绝时明确报错。
- `window.UmlStudio` 提供 `ready,getDocument,setDocument,selectDiagram,getSpec,setSpec,getSvg,exportImage,saveHtml`。选择序号在浏览器 API 中从 0 开始；`getSpec/setSpec/getSvg/exportImage` 只操作当前图，`saveHtml` 保存全部图。等待 `ready` 与异步编辑 / 导出方法。
- Node API `@office/uml-studio/node` 提供 `readDiagramFile,documentFromHtml,renderNativeImage`，可直接从保存的 HTML 导出图片；不依赖浏览器，但需要本地 SKILL / Node 及 npm 原生依赖。跨机器字体可能不同，不承诺浏览器 / 原生导出逐像素相同。
- 位图单边最多 32,767 px，总计最多 4,000 万像素；超限必须降低倍率或改为 SVG，不静默裁切。

维护导出时，SVG 图元须兼容浏览器与 resvg。末端箭头使用 `orient="auto"`；源端聚合 / 组合菱形以 `refX="0"` 沿路径放置，避免 resvg 不支持 `auto-start-reverse` 导致方向错误。运行 `tests/raster-markers.test.mjs` 检查实际像素方向；Demo 图片使用与 CLI 相同的原生导出入口。

## 边界

这是语义化绘图和样式编辑器，不是自由拖拽的 draw.io 替代品。它自动布局结构化模型；没有 UML 模型执行、代码逆向工程或任意 SVG/HTML 注入功能。大型图应按视角拆分后分别输出，不省略用户要求的节点或关系。
