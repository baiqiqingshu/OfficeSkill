# UML Studio · 结构化绘图 SKILL

本项目新增 **`.agents/skills/uml-studio`**：模型提供 JSON，组件负责自动布局、UML 图元、样式和图片导出。参考 FishboneStudio 的数据 / 渲染 / Vue / 导出分层，独立实现，不依赖 `D:\WorkProject\FishboneStudio`，不替换已有绘图 SKILL。

## 直接体验

双击打开：**[离线鱼骨图 Demo](.agents/skills/uml-studio/demo-dist/index.html)**。

初始为鱼骨图，可切换 18 类示例。点击“编辑 JSON”修改数据并“应用到画布”；左侧可切换主题、自定义颜色、字体、字号、线宽、圆角、节点尺寸、间距和布局方向。随后导出图片或保存包含当前数据、样式的 HTML。较宽的图可使用预览缩放；预览缩放不改变图片导出倍率。

HTML 内联 Vue 运行时、布局库、CSS、JSON，无 CDN、无远程字体，离线也能继续编辑和导出。网页不会自动覆盖磁盘上的原文件，修改后须点击“保存 HTML”下载新文件。

## 安装与启动

建议 Node.js 22.12+。在项目根目录执行：

```bash
npm install
npx playwright install chromium
npm run build
npm run dev
```

`npm run dev` 启动 Vite 演示项目，地址由终端输出。仅浏览已生成的 HTML 不需要 Node.js；生成 HTML/SVG 不需要浏览器，agent 直接导出位图需要本机 Playwright Chromium。

## Agent 生成文件

```bash
# 同时生成可编辑 HTML 和 PNG
npm run diagram -- .agents/skills/uml-studio/examples/fishbone.json --out temp/fishbone.html --image temp/fishbone.png

# 直接输出矢量图片
npm run diagram -- .agents/skills/uml-studio/examples/usecase.json --image temp/usecase.svg

# JPEG / WebP：支持倍率、质量和主题参数
npm run diagram -- .agents/skills/uml-studio/examples/sequence.json --out temp/sequence.html --image temp/sequence.jpeg --scale 1 --quality 0.92
npm run diagram -- .agents/skills/uml-studio/examples/physical.json --image temp/physical.webp --theme blueprint --scale 1

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
| 原因分析 | 鱼骨图，支持递归原因 |
| 图片 | SVG、PNG、JPEG（含 `.jpg`）、WebP |
| 主题 | 暖纸、海蓝、苔绿、蓝图、夜色，以及 JSON / 页面样式覆盖 |

这是自动布局与数据 / 样式编辑器，不是自由拖拽画布，也不执行 UML 模型或逆向生成代码。大图可按视角拆分，或使用 SVG / 预览缩放；位图超过 4,000 万像素或单边 32,767 px 会明确拒绝，避免浏览器分配过大画布。

## 组件库与数据契约

技术栈：**Vue 3 + TypeScript + SVG + ELK.js**。普通图使用分层正交布局；时序图和鱼骨图使用专用布局。JSON Schema 与 Ajv 检查结构，额外检查 ID、关系引用、分组循环和时序片段索引。

| 路径 | 用途 |
|---|---|
| [SKILL.md](.agents/skills/uml-studio/SKILL.md) | Agent 路由、生成步骤、完整使用约定 |
| [schemas/diagram.schema.json](.agents/skills/uml-studio/schemas/diagram.schema.json) | 可供模型和编辑器使用的 JSON Schema |
| [examples/](.agents/skills/uml-studio/examples/) | 18 类 JSON 示例 |
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

浏览器输出还暴露相同职责的 `window.UmlStudio`，可用于 agent 自动化；原始数据位于 `<script id="diagram-data" type="application/json">`。

## 修改源码后

```bash
npm run typecheck
npm run build
npm test
```

构建会重新生成离线 Demo、组件模块、类型声明、Schema 与第三方许可声明。新实现采用 MIT；ELK.js 等依赖保留各自许可，详见 SKILL 目录的 `THIRD_PARTY_NOTICES.txt`，相关声明也随独立 HTML 内嵌运行时一起保留。

## 本次交付验证

- TypeScript / Vue 类型检查、完整构建、7 项校验回归测试通过。
- 18 类示例实际生成 SVG，并在浏览器检查 XML、文字画布边界、节点 / 关系完整性、分组与泳道；55 组字号边界、方向及长条件文字场景通过。
- 网页编辑 JSON、错误输入保留上次结果、5 套主题、自定义样式、复制 / 下载 JSON 均已实际操作；四种图片经过文件签名与浏览器解码验证。
- 保存的 HTML 在断网、`file://` 环境下重开，再修改数据和配色、重新导出 PNG、再次保存 HTML 后重开；数据与样式保留，未发出 HTTP 请求。
- 1440×960、1920×1080、390×844 页面无水平溢出；移动端可切换图类型；编译后的 Vue 组件在同页挂载两种主题，SVG ID 与箭头引用不冲突。
- 根目录 agent 命令实际生成 HTML / PNG，另生成用例 SVG、时序 JPEG、物理视图 WebP；同时验证 UTF-8 BOM、相对输出路径和无效模型不覆盖已有文件。

本机回执、图片和桌面 / 移动端截图保留在 `temp/uml-studio-evidence/`，按项目规则不纳入版本控制。上述自动功能与几何检查不等同于人工审美评审。
