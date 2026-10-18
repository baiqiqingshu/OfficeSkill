---
name: uml-studio
description: 根据结构化 JSON 绘制 UML 活动图、时序图、泳道图、流程图、用例图、类图、状态图、组件图、包图，以及系统架构、功能模块、部署、4+1 视图和鱼骨图。输出可离线编辑数据和样式的单个 HTML，或直接生成 SVG、PNG、JPEG、WebP 图片。
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
| 4+1：逻辑、开发、进程、物理、场景 | `logical` / `development` / `process` / `physical` / `scenario` | `nodes`, `edges`, 可选 `groups` | 同名示例 |
| 原因分析、鱼骨图 | `fishbone` | `fishbone.effect`, `fishbone.categories` | `examples/fishbone.json` |

4+1 是架构视角，不是五种新的 UML 记法。选择视角后，以有明确语义的类、组件、包、部署节点或业务场景表达；不要把同一张架构图改标题充当五个视图。

## Agent 工作流

以下命令在本 SKILL 目录执行；从其它目录调用时，使用脚本和数据文件的实际路径。输出路径相对当前工作目录。

1. 单图读取 `schemas/diagram.schema.json` 和对应 `examples/<type>.json`；多图读取 `schemas/document.schema.json` 与 `examples/documents/gallery.json`。不照搬示例中的业务事实。
2. 单图使用 `version:1,type,title`；多图使用 `version:1,title,diagrams:[...]`。同类图可以重复，每张独立保存主题、布局、数据；可选图形 `id` 在文档内唯一，节点 ID 只须在各自图内唯一。
3. 验证再生成。默认海蓝主题、紧凑布局、隐藏图内标题；只有用户要求标题时才设置 `layout.showTitle:true`。不要生成坐标或 SVG 路径。

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

4. 检查命令退出码和生成回执。HTML 必须能在浏览器打开；修改数据/主题后，重新导出并检查对应图片。不要把 HTML 页面截图当作 diagram-only 图片导出。
5. 返回用户要的文件路径，注明图类型及实际验证的格式。用户只要图片时可只交付图片，但建议保留可编辑 HTML。

SVG、PNG、JPEG、WebP 均可在 Node 中直接导出，不安装、不启动浏览器。CLI 从 HTML 的惰性 JSON 数据块读取完整文档，不执行网页脚本；SVG 使用本地绘图引擎，位图使用 resvg / sharp。多图必须用 `--diagram` 选择从 1 开始的序号或图形 id，或用 `--all --out-dir` 批量输出，避免只导出第一张而遗漏其余图形。

## 安装与构建

已附带运行资源、构建产物与 Schema。全新环境先安装本地 npm 依赖；原生位图编码库由 npm 安装，不需要 Chromium。仅浏览已生成的 HTML 不需要 Node。

```bash
npm install
# 修改组件源码后才需要重新构建
npm run build
# 开发多图 Demo，第一张为鱼骨图，另外两张为不同主题的活动图
npm run dev
```

也可在 OfficeSkill 根目录执行同名命令；`npm run diagram -- ...` 是根目录 CLI 入口。

## JSON 规则

- 主结构见 schema。除通用元数据外，图节点、时序和鱼骨数据不可混用；未知字段会报错，不静默丢弃。
- 默认 `theme:"ocean"`；还支持 `paper,forest,blueprint,midnight,lavender,rose,amber,slate,mint`。`style` 覆盖主题，节点可覆盖各自样式；网页切换主题会清除全局自定义覆盖。
- 色值支持十六进制 `#RGB` / `#RRGGBB` 和 `transparent`。网页支持粘贴色值、系统拾色器与精选色板。PNG / WebP / SVG 可保留透明；JPEG 无透明通道，铺白底。字体使用本机字体；Node 导出可重复传入 `--font-file path.ttf`，不下载远程字体。
- `direction: "TB" | "LR"` 控制图布局。时序顺序由 `messages` 顺序决定，鱼骨分类按数组顺序排列。
- 泳道图：`lanes` 声明职责，所有节点必须设置 `lane`。分组使用 `groups` 和节点 `group`；`parent` 允许嵌套，禁止循环包含。
- 类节点可有 `attributes`、`operations`；用 `kind` 选择 UML 图元。依赖、包含、扩展、继承、实现、聚合、组合用连线 `kind`，不要只改标签冒充 UML 关系。
- 时序消息支持 `sync`、`async`、`return`、`create`、`destroy`。`activate` 打开接收方激活条；`return` 的 `deactivate` 关闭发送方激活，其他消息关闭接收方激活。销毁关闭目标的全部激活，未关闭的激活绘至图底。
- `fragments` 支持 `alt`、`opt`、`loop`、`par`，使用从 0 开始、首尾包含的消息索引；`alt` / `par` 的 `elseAt` 是第二分支首条消息索引，`elseLabel` 描述该分支。长消息和条件文字自动换行并扩展时间轴间距。
- 鱼骨 `causes` 可有递归 `children`，保留原因层级。

### 布局与文字

`layout.mode` 支持 `compact`（默认）、`balanced`、`spacious`、`grid`。紧凑默认元素 / 区域间距为 24 / 40；网格默认每列 3 个节点。显式 `layout.elementGap/regionGap` 优先于 `style.gap`，后者优先于模式默认值。网页切换模式会清除间距覆盖，使预设立即生效。

可设置 `showTitle`、`maxWidth/maxHeight`（整图等比上限，不裁切）、`nodeMaxWidth/nodeMaxHeight`（节点换行后自适应缩放）、`elementGap`、`regionGap`、`maxPerColumn`。尺寸上限和每列数量为 0 表示不限；节点尺寸 / 每列数量只用于节点图，时序与鱼骨使用专用布局。不要用缩小字号代替删减用户要求的内容；极小节点上限会缩小文字，应按可读性设置。

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
- 页面支持表单 / 源码切换、增删图形、复制当前图、独立主题、滚轮定点缩放及拖拽平移。导出工具栏在编辑按钮附近、预览上方；样式位于预览下方，默认折叠，可展开调整。拖动的是预览画布，不改变结构化模型中的节点位置。
- 下载按钮下的“复制图片（PNG）”写入图片剪贴板，不下载、不复制 URL。需要支持 ClipboardItem 的安全页面环境与权限；不支持或权限被拒绝时明确报错。
- `window.UmlStudio` 提供 `ready,getDocument,setDocument,selectDiagram,getSpec,setSpec,getSvg,exportImage,saveHtml`。选择序号在浏览器 API 中从 0 开始；`getSpec/setSpec/getSvg/exportImage` 只操作当前图，`saveHtml` 保存全部图。等待 `ready` 与异步编辑 / 导出方法。
- Node API `@office/uml-studio/node` 提供 `readDiagramFile,documentFromHtml,renderNativeImage`，可直接从保存的 HTML 导出图片；不依赖浏览器，但需要本地 SKILL / Node 及 npm 原生依赖。跨机器字体可能不同，不承诺浏览器 / 原生导出逐像素相同。
- 位图单边最多 32,767 px，总计最多 4,000 万像素；超限必须降低倍率或改为 SVG，不静默裁切。

## 边界

这是语义化绘图和样式编辑器，不是自由拖拽的 draw.io 替代品。它自动布局结构化模型；没有 UML 模型执行、代码逆向工程或任意 SVG/HTML 注入功能。大型图应按视角拆分后分别输出，不省略用户要求的节点或关系。
