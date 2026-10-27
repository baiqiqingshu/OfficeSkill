# UML Studio · 结构化绘图 SKILL

新增 **[Web 项目功能验证 skill](.agents/skills/webapp-testing/SKILL.md)**：面向 Spring Boot + Vue，通过真实接口、Lightpanda 和数据库验证功能，支持需求/暂存区影响分析及独立 Python 用例包。详见 [使用说明](.agents/skills/webapp-testing/SKILL.md)。

本项目新增 **`.agents/skills/uml-studio`**：模型提供 JSON，组件负责自动布局、UML 图元、样式和图片导出。参考 FishboneStudio 的数据 / 渲染 / Vue / 导出分层，独立实现，不依赖 `D:\WorkProject\FishboneStudio`，不替换已有绘图 SKILL。

## 直接体验

双击打开：**[离线多图 Demo](.agents/skills/uml-studio/demo-dist/index.html)**，包含 26 张图：20 个复杂业务场景、3 个布局与样式对照、3 个入门用例，覆盖全部 18 类图。

场景包括登录多重判断、发布并行汇合、四方报销泳道、嵌套时序片段、订单领域基数、跨区域部署、死信重放与递归鱼骨。每张图的说明列出观察点；[场景与验证索引](.agents/skills/uml-studio/references/demo-coverage.md) 说明覆盖范围和运行方式。

默认海蓝视觉风格、均衡布局，不显示图内标题。工作台以画布为中心，顶部“编辑图表”和“调整样式”按需展开对应区域；图片导出与复制集中在画布上方，文档 JSON 等低频操作收进“更多导出”。左侧管理图表，编辑区支持表单与 JSON 源码切换，进阶参数分组折叠。每张图独立保存数据与设置，未应用草稿和待保存 HTML 状态分别提示。预览可滚轮定点缩放、按住拖拽平移、用滚动条浏览、恢复原始大小 / 适应画布，不改变导出内容。详见 [工作台说明](.agents/skills/uml-studio/SKILL.md) 和 [设计约定](docs/uml-studio-redesign.md)。

HTML 内联 Vue 运行时、布局库、CSS、JSON，无 CDN、无远程字体，离线也能继续编辑和导出。网页不会自动覆盖磁盘上的原文件，修改后须点击“保存 HTML”下载新文件。

## 安装与启动

建议 Node.js 22.12+。在项目根目录执行：

```bash
npm install
npm run build
npm run dev
```

`npm run dev` 启动 Vite 演示项目。仅浏览生成的 HTML 不需要 Node；CLI 生成 SVG / PNG / JPEG / WebP 均不需要浏览器。Node 使用 resvg 渲染、sharp 编码，原生依赖由 npm 安装；Playwright 只供开发验证使用。

## Agent 生成文件

```bash
# 同时生成可编辑 HTML 和 PNG
npm run diagram -- .agents/skills/uml-studio/examples/fishbone.json --out temp/fishbone.html --image temp/fishbone.png

# 直接输出矢量图片
npm run diagram -- .agents/skills/uml-studio/examples/usecase.json --image temp/usecase.svg

# JPEG / WebP：支持倍率、质量和主题参数
npm run diagram -- .agents/skills/uml-studio/examples/sequence.json --out temp/sequence.html --image temp/sequence.jpeg --scale 1 --quality 0.92
npm run diagram -- .agents/skills/uml-studio/examples/physical.json --image temp/physical.webp --theme blueprint --scale 1

# 从已经保存的 HTML 直接导出第 2 张图；不启动浏览器
npm run diagram -- .agents/skills/uml-studio/demo-dist/index.html --diagram 2 --image temp/from-html.png

# 单个 HTML 的全部图形批量导出；同类图也不会被覆盖
npm run diagram -- .agents/skills/uml-studio/demo-dist/index.html --all --out-dir temp/images --format webp --scale 1

# 从多图 JSON 生成设计册
npm run diagram -- .agents/skills/uml-studio/examples/documents/gallery.json --out temp/design-book.html

# 仅校验 / 查看支持类型
npm run diagram -- .agents/skills/uml-studio/examples/activity.json --validate
npm run diagram -- --list
```

使用自有 JSON 时替换输入路径。输出路径相对调用目录，输出目录自动创建；错误以非零状态退出，不用其它格式冒充，也不静默丢弃节点或关系。`--theme` 设置基础主题，JSON 中的 `style` 仍拥有更高优先级；网页选择预设主题会清除全局自定义覆盖。

## 支持范围

| 类别 | 图类型 |
|---|---|
| UML 与流程 | 活动、时序、泳道、流程、用例、类、状态、组件、包 |
| 系统设计 | 系统架构、功能模块、部署 |
| 4+1 架构视图 | 逻辑、开发、进程、物理、场景；五个示例分别表达结构、代码组织、运行协作、部署位置与业务交互 |
| 原因分析 | 鱼骨图，支持递归原因；默认使用原版鱼头，扩展造型可按需选择 |
| 图片 | SVG、PNG、JPEG（含 `.jpg`）、WebP |
| 主题 | 默认海蓝；纯白、暖纸、森林绿、工程蓝图、午夜、薰衣草、玫瑰、琥珀、岩灰、薄荷；支持独立样式覆盖 |

这是自动布局编辑器，不执行 UML 模型或逆向生成代码。拖拽仅平移预览，不手动改变节点坐标。位图超过 4,000 万像素或单边 32,767 px 会明确拒绝；可降低倍率或改为 SVG。

## 布局、文字与配色

- 布局模式：紧凑、均衡（默认）、宽松、分栏网格。紧凑的默认元素 / 区域间距为 24 / 40，均衡为 48 / 72，宽松为 80 / 112；网格默认每列 3 个节点。
- `layout.showTitle`：默认 `false`，只隐藏图片内标题 / 说明，图表名称仍保留在工作台和无障碍信息中。
- `layout.maxWidth/maxHeight`：整图等比尺寸上限，保留完整 viewBox，不裁掉节点。`nodeMaxWidth/nodeMaxHeight` 限制节点，文字会换行并在必要时缩放。
- `layout.elementGap/regionGap/maxPerColumn`：元素间距、区域间距、区域内每列最大普通节点数（起止节点不计入）。显式 `0` 不限列内节点且禁止自动折列；未设置时允许高度失衡区域自动折列。节点和分栏参数仅用于节点图。
- `style.fontFamily/fontSize/fontWeight/fontStyle/textDecoration`：字体预设 / 自定义回退列表、字号、字重、斜体、下划线。颜色支持文本粘贴、系统拾色器、31 个精选实色和透明背景。
- 显式布局间距优先于原有 `style.gap`，后者优先于模式默认值；网页切换模式会清除这些间距覆盖，使新模式立即生效。
- 用例图默认横向，使用专用布局：按角色关联归组，主用例与包含 / 扩展能力分列，比较行序和角色两侧位置以减少直线穿越、交叉与线长；同侧角色关联共用端口。显式方向、分组、嵌套边界和每列数量仍生效。
- 其它节点图先分离回退边，再按连接关系分层；嵌套同级区域横排，跨区域直连节点优先同行，蛇形折列优先让相邻列交接节点同行。对齐以不重叠、保持列内顺序和区域包含为前提。
- 开始 / 结束使用区域外的独立顶部 / 底部留白带，单起止符号固定同轴；显式 `LR` 时对应左右留白与水平同轴。原始 `group/lane` 数据不变。间距和分栏设置不会丢失连线；定位完成后统一生成连续正交折线，比较路径长度、折点、交叉和重叠并避让节点与文字；用例图关系使用直线，并复用同方向的源端口。

PNG / WebP / SVG 支持透明，JPEG 铺白底。跨机器的字体安装可能不同；CLI 可用 `--font-file path.ttf`（可重复）加载本地字体，不承诺原生导出与浏览器逐像素一致。

下载按钮下提供 **复制图片（PNG）**：把当前图直接写入图片剪贴板，不弹下载框、不保存本地文件、不用链接替代图片。浏览器需支持 ClipboardItem，并允许安全页面写入剪贴板；不支持 / 拒绝时明确报错。

## 多图与 HTML 再导出

多图格式为 `{ "version": 1, "title": "设计册", "diagrams": [...] }`，参见 [完整多图示例](.agents/skills/uml-studio/examples/documents/gallery.json)。数组可包含多张相同 `type`，各自保留主题和布局；可选图形 `id` 在文档中唯一。

HTML 始终包含全部已应用图形；保存时有未应用草稿会明确提示，不静默丢弃。CLI 只读取 `#diagram-data` JSON，不执行 HTML 脚本，也不加载网页资源。多图图片输出需用 `--diagram`（从 1 开始的序号或图形 id）选择，或 `--all --out-dir` 批量输出。批次中途出错会非零退出并报告已完成数量；已导出的图片不会冒充整个批次成功。

## 组件库与数据契约

技术栈：**Vue 3 + TypeScript + SVG + ELK.js**，Node 图片后端为 **resvg + sharp**，HTML 数据解析使用 parse5。普通图支持分层正交布局 / 区域分栏布局；时序和鱼骨使用专用布局。JSON Schema 与 Ajv 检查结构，并检查 ID、引用、分组循环和消息索引。

| 路径 | 用途 |
|---|---|
| [SKILL.md](.agents/skills/uml-studio/SKILL.md) | Agent 路由、生成步骤、完整使用约定 |
| [schemas/diagram.schema.json](.agents/skills/uml-studio/schemas/diagram.schema.json) | 可供模型和编辑器使用的 JSON Schema |
| [schemas/document.schema.json](.agents/skills/uml-studio/schemas/document.schema.json) | 多图文档 Schema，可包含同类多图 |
| [examples/](.agents/skills/uml-studio/examples/) | 18 类简明模板、20 个复杂场景与多图设计册 |
| `.agents/skills/uml-studio/src/` | Vue 组件、类型、校验器、布局与导出源码 |
| `.agents/skills/uml-studio/dist/` | Node 渲染器、Vue 组件模块、组件 CSS 与类型声明 |
| `.agents/skills/uml-studio/assets/` | 可内联进单个 HTML 的完整工作台运行资源 |
| `.agents/skills/uml-studio/demo/` | Vite Demo 入口；`demo-dist/index.html` 为离线交付物 |

Vue 应用可导入：

```ts
import { DiagramCanvas, downloadBlob } from '@office/uml-studio/vue'
import type { DiagramSpec } from '@office/uml-studio/vue'
import '@office/uml-studio/style.css'
```

组件用法为 `<DiagramCanvas :spec="spec" ref="diagram" />`，`spec` 符合 `DiagramSpec`。组件暴露 `ready`、`getSpec()`、`setSpec(spec)`、`getSvg()`、`exportImage(options)`、`saveHtml()`；`ready`、`setSpec`、`exportImage` 需等待。组件 CSS 不重置宿主页面的 `body`；一个页面可挂载多个不同主题的图。

Headless Node API 为 `import { renderDiagram, validateSpec } from '@office/uml-studio'`。`renderDiagram(input)` 返回 `{ svg, width, height }`，可直接写为 SVG。独立 HTML 的生成使用 CLI；自行调用 `createHtml` / 组件 `saveHtml` 时需提供构建出的 `{ js, css }` 运行资源，不能只保存一个无法离线工作的空壳。

`window.UmlStudio` 的 `getDocument/setDocument/selectDiagram` 管理完整集合，选择序号从 0 开始；`getSpec/setSpec/getSvg/exportImage` 操作当前图，`saveHtml` 保存整个集合。数据位于 `#diagram-data`。Node API 为 `import { readDiagramFile, documentFromHtml, renderNativeImage } from '@office/uml-studio/node'`，接受 JSON / 已保存 HTML，不依赖 DOM、Canvas 或 Chromium。

## 修改源码后

```bash
npm run typecheck
npm run build
npm test
# 逐图导出与视觉证据，结果写入 temp/uml-demo-evidence/
npm run demo:verify -w @office/uml-studio
```

构建会重新生成离线 Demo、组件模块、类型声明、Schema 与第三方许可声明。新实现采用 MIT；ELK.js 等依赖保留各自许可，详见 SKILL 目录的 `THIRD_PARTY_NOTICES.txt`，相关声明也随独立 HTML 内嵌运行时一起保留。

## 本次交付验证

### Demo 场景扩展验证

- 离线 Demo 从 3 张扩展到 26 张，覆盖 18 类图；20 个复杂场景与 3 个布局对照均由独立源 JSON 生成，原有 3 个入门用例保留。
- 完整构建与 74 项测试通过；复杂节点场景额外覆盖四种模式 × 两种方向，共 144 种布局组合，检查节点、关系、标注、容器与可识别图元的几何约束。
- 浏览器逐一切换全部 26 张图并确认 SVG 预览；4 类复杂图实际导出全部四种图片格式，26 图逐图 SVG / PNG、视觉拼图和检查报告保存在 `temp/uml-demo-evidence/`。自动几何检查不代表所有连线和留白已经达到最佳视觉效果。

### 布局与路由修复验证

- 修复设置 `regionGap/maxPerColumn` 后绕过连接布局并丢失全部边的路径；移除结束节点事后横移造成的重叠，以及回退边把返工步骤排到入口之前的问题。
- 完整构建和 17 项测试通过；18 类图在四种模式、TB / LR、节点尺寸限制及自环等边界下共 158 个实际渲染场景通过，检查节点 / 关系完整性与连续正交路径；需求评审 SVG / PNG / JPEG / WebP 均实际导出。
- 浏览器加载验收文档并逐图渲染，21 张节点图检查无节点重叠、普通节点无区域越界；需求评审的网格模式切换后仍有全部 6 条边。证据在 `temp/layout-routing-evidence/`。
- 离线 Demo 与内嵌运行资源已重新构建。旧的独立 HTML 内嵌旧代码，不会因源码变化自动升级；使用新 Demo，或将旧数据导入新工作台后重新保存 HTML。

### 先前交付记录

- TypeScript / Vue 检查、完整构建与 10 项回归测试通过，覆盖引用校验、多图边界、透明 PNG、JPEG 白底与惰性 HTML 数据解析。
- 18 类图的四种布局模式，加上尺寸约束 / 分栏 / 多图场景共 79 个渲染场景通过：检查 XML、文字边界、节点与关系完整性；每列上限 2 的七节点图实际排为 2 / 2 / 2 / 1。
- 简单链式图在紧凑 / 均衡 / 宽松模式下的高度为 716 / 860 / 1052，证明预设实际改变布局，而不是仅保存设置。
- 实际操作表单 / 源码切换、递归鱼骨原因、活动图节点增删、独立主题、十六进制粘贴、精选色板、透明背景、字体及布局参数；无效源码保留成功画布。
- 实际滚轮改变缩放、指针拖动改变画布滚动位置。复制图片后从系统剪贴板读回 PNG，确认没有触发下载。
- 三图 HTML 包含两张不同主题活动图，保存后断网重开仍保留全部图形与独立设置；1440px 和 390px 宽度无页面水平溢出。
- 对已保存 HTML 导出 SVG / PNG / JPEG / WebP，并批量导出全部图形；验证时禁止浏览器模块与 Node 子进程，指定不存在的浏览器路径，原生导出仍成功。
- 导出工具栏在预览上方且首屏可见；样式设置位于预览下方，默认收起，实际展开 / 折叠操作通过。类图属性与时序消息表单编辑通过；删除仍被引用的参与者会明确拒绝。
- 另从网页编辑后保存的 HTML，按图形 id 导出 720 × 323 的原生 PNG，仍禁止浏览器包与子进程，保留修改后的内容、字体和透明背景。

本次回执、图片和截图保留在 `temp/uml-enhancement-evidence/`；前一版证据仍位于 `temp/uml-studio-evidence/`。临时验证脚本完成后移除，不纳入版本控制。自动功能和几何检查不等同于人工审美评审。
