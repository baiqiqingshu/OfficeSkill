---
name: uml-studio
description: 根据结构化 JSON 绘制 UML 活动图、时序图、泳道图、流程图、用例图、类图、状态图、组件图、包图，以及系统架构、功能模块、部署、4+1 视图和鱼骨图。输出可离线编辑数据和样式的单个 HTML，或直接生成 SVG、PNG、JPEG、WebP 图片。
license: MIT
metadata:
  version: "1.0.0"
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

1. 读取 `schemas/diagram.schema.json` 和一个匹配的 `examples/<type>.json`。只保留用户提供的业务事实，不照搬示例内容。
2. 新建符合 schema 的 UTF-8 JSON：`version: 1`、`type`、`title`；节点用稳定 ID，连线引用已有 ID。不要生成坐标。
3. 验证，再生成。默认交付 HTML；需要图片时同时生成图片。

```bash
node scripts/diagram.mjs input.json --validate
node scripts/diagram.mjs input.json --out output.html
node scripts/diagram.mjs input.json --out output.html --image output.png --scale 2
node scripts/diagram.mjs input.json --image output.svg
node scripts/diagram.mjs input.json --image output.jpeg --quality 0.92
node scripts/diagram.mjs input.json --image output.webp --theme ocean
```

4. 检查命令退出码和生成回执。HTML 必须能在浏览器打开；修改数据/主题后，重新导出并检查对应图片。不要把 HTML 页面截图当作 diagram-only 图片导出。
5. 返回用户要的文件路径，注明图类型及实际验证的格式。用户只要图片时可只交付图片，但建议保留可编辑 HTML。

支持格式为 SVG、PNG、JPEG、WebP；不支持的格式必须明确说明，不能改后缀伪装。SVG 无需浏览器。位图使用本机 Chromium，不需要网站、账号或远程 API。

## 安装与构建

已附带 `assets/`、`dist/` 与 JSON Schema，生成 HTML/SVG 不需重新构建。全新环境安装本地依赖后即可调用 CLI；位图导出还需要 Chromium。

```bash
npm install
npx playwright install chromium
# 修改组件源码后才需要重新构建
npm run build
# 开发 Demo，默认鱼骨图
npm run dev
```

也可在 OfficeSkill 根目录执行同名命令；`npm run diagram -- ...` 是根目录 CLI 入口。

## JSON 规则

- 主结构见 schema。除通用元数据外，图节点、时序和鱼骨数据不可混用；未知字段会报错，不静默丢弃。
- 通用 `theme`：`paper`、`ocean`、`forest`、`blueprint`、`midnight`；`style` 覆盖配色、字体、字号、线宽、圆角、节点尺寸和间距。节点可用自己的 `style` 覆盖图元样式。
- 颜色使用十六进制 `#RGB` 或 `#RRGGBB`；字体优先使用本机中文字体，不下载远程字体。
- `direction: "TB" | "LR"` 控制图布局。时序顺序由 `messages` 顺序决定，鱼骨分类按数组顺序排列。
- 泳道图：`lanes` 声明职责，所有节点必须设置 `lane`。分组使用 `groups` 和节点 `group`；`parent` 允许嵌套，禁止循环包含。
- 类节点可有 `attributes`、`operations`；用 `kind` 选择 UML 图元。依赖、包含、扩展、继承、实现、聚合、组合用连线 `kind`，不要只改标签冒充 UML 关系。
- 时序消息支持 `sync`、`async`、`return`、`create`、`destroy`。`activate` 打开接收方激活条；`return` 的 `deactivate` 关闭发送方激活，其他消息关闭接收方激活。销毁关闭目标的全部激活，未关闭的激活绘至图底。
- `fragments` 支持 `alt`、`opt`、`loop`、`par`，使用从 0 开始、首尾包含的消息索引；`alt` / `par` 的 `elseAt` 是第二分支首条消息索引，`elseLabel` 描述该分支。长消息和条件文字自动换行并扩展时间轴间距。
- 鱼骨 `causes` 可有递归 `children`，保留原因层级。

最小流程示例：

```json
{
  "version": 1,
  "type": "flowchart",
  "title": "需求评审流程",
  "theme": "paper",
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

- `<script id="diagram-data" type="application/json">` 保存当前结构化数据，包括主题和样式；页面可编辑、复制或下载该 JSON。
- SVG 由本地 Vue 组件和布局库生成。默认把 JS、CSS 和初始数据全部内联，无 CDN、无远程字体，断网后仍可双击打开。
- “保存 HTML”将当前已应用的数据和样式写入新文件，重新打开后可继续编辑、切换样式和导出。
- 浏览器提供 `window.UmlStudio`：`ready`、`getSpec()`、`setSpec(spec)`、`getSvg()`、`exportImage(options)`、`saveHtml()`；`ready` 和 `setSpec` 均需等待。
- Canvas 位图输出有尺寸上限；过大时降低倍率或改为 SVG，不允许静默缩小。

## 边界

这是语义化绘图和样式编辑器，不是自由拖拽的 draw.io 替代品。它自动布局结构化模型；没有 UML 模型执行、代码逆向工程或任意 SVG/HTML 注入功能。大型图应按视角拆分后分别输出，不省略用户要求的节点或关系。
