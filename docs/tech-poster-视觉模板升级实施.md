# Tech Poster 视觉模板升级实施文档

> 当前状态：**阶段 0「网络灵感调研 + 样例评估」已完成**。本阶段严格未修改 `.agents/skills/tech-poster` 下任何代码、模板、示例或测试。代码仍是唯一事实；本文记录调研证据、样例结论和下一轮实施口径。

## 1. 本轮任务边界

用户要求：

1. 先网络检索可参考的图片、设计站点与视觉资源，从中获取灵感。
2. 提供网络参考图或自制修改样例图，供用户评估方向。
3. **先不要修改海报 skill 代码**。

已完成：

- 网络调研并整理灵感图版。
- 使用当前 `examples/gateway-framework.json` 导出基线 PNG 做对照。
- 自制 3 个视觉方向样例 HTML + 高清 PNG。
- 汇总为评估页，供用户选择下一轮方向。

未做：

- 未修改 `render.mjs`、`poster-core.mjs`、`themes-css.mjs`、背景、schema、demo 或测试。
- 未把网络参考图片复制进最终模板；网络图片仅用于内部评估。
- 未新增测试代码。

## 2. 评估入口与样例文件

### 2.1 本机 artifact

- Tech Poster 视觉评估页：<http://127.0.0.1:3425/a/z6dutigeygyphfoodg7xofbmce/>
- 网络灵感图版：<http://127.0.0.1:3425/a/mkm6x5h573jmhpbw4ymhfqo5x4/>

> artifact 是本机私有页面；若端口服务重启导致地址失效，可直接打开下列 temp 文件。

### 2.2 本地文件

评估页：

- `temp/tech-poster-evaluation/index.html`

网络灵感图版：

- `temp/tech-poster-inspiration-board.html`
- `temp/tech-poster-reference-images/`（12 张参考图，均已本地保存）

自制样例：

| 方向 | HTML | PNG | 最终尺寸 |
|---|---|---|---|
| 工程蓝图 / Blueprint Sheet | `temp/tech-poster-style-samples/01-blueprint.html` | `temp/tech-poster-style-samples/01-blueprint.png` | 2160×3548 |
| 深色控制台 / Console Ops | `temp/tech-poster-style-samples/02-console-ops.html` | `temp/tech-poster-style-samples/02-console-ops.png` | 2160×3266 |
| 瑞士编辑网格 / Swiss Editorial | `temp/tech-poster-style-samples/03-swiss-editorial.html` | `temp/tech-poster-style-samples/03-swiss-editorial.png` | 2160×3592 |

基线对照：

- `temp/tech-poster-baseline.html`
- `temp/tech-poster-baseline.png`
- `temp/tech-poster-baseline-panels/panel-00-hero.png`
- `temp/tech-poster-baseline-panels/panel-01.png`
- `temp/tech-poster-baseline-panels/panel-02.png`

## 3. 网络参考来源与可借鉴机制

本轮只抽象设计机制，不复制任何版权图像、插画、字体、品牌元素或付费模板。

### 3.1 技术架构长图

1. Graphmake Tech Stack Architecture  
   <https://graphmake.com/templates/tech-stack-architecture>
   - 可借鉴：深色长图章节流、架构面板、技术栈网格、KPI 大数字、时间轴停顿点。
   - 不可照搬：具体模板布局、图标组合、插画与品牌化组件。

2. Graphmake State of AI  
   <https://graphmake.com/templates/state-of-ai>
   - 可借鉴：数据报告型长图的图表磁贴、密度递进、单一强调色与分组节奏。

3. Graphmake How AI Works  
   <https://graphmake.com/templates/how-ai-works>
   - 可借鉴：中心视觉主轴 + 分阶段解释的科普型叙事。

### 3.2 工程图与技术图解

4. IBM Design Language Technical Diagrams  
   <https://www.ibm.com/design/language/infographics/technical-diagrams/design/>
   - 关键规则：8px 网格；节点分 bullet/small/large 三档；默认节点高 48px；描边 1px；圆角 8px；图标 24px；连线优先正交/肘形；颜色必须配合标签或线型双重编码。

5. IBM 2x Grid  
   <https://www.ibm.com/design/language/2x-grid>
   - 可借鉴：显式栏网格、倍数间距、工程化对齐纪律。

6. The Schematic of Structures Poster  
   <https://www.feeldesain.com/the-schematic-of-structures-poster.html>
   - 可借鉴：蓝图白线、密集标注、制图网格带来的“工程档案感”。
   - 不可照搬：建筑插画本身。

7. North Identity Diagrams  
   <https://identity.north.ae/brand-components/diagrams/>
   - 可借鉴：一张图只表达一个主结论；流向遵守阅读方向；节点过多则分组；形状即语义；禁止无意义 3D/阴影/渐变。

### 3.3 瑞士网格与编辑排版

8. The Swiss Grid / Poster House  
   <https://swissgrid.posterhouse.org>
   - 可借鉴：字体尺度、黑白对比、网格即秩序。

9. Design Lounge Swiss poster style  
   <https://designlounge.live/p/swiss-poster-style>
   - 可借鉴：红黑双色、非对称网格、超大标题、左对齐右参差。

10. Swiss Style A0 Poster Grid System  
    <https://stephenkelman.co.uk/swiss-style-a0-poster-grid-system-for-indesign>
    - 可借鉴：模块网格 + 基线网格；层级来自尺度与位置，而不是装饰。

11. Nielsen Norman Group: Designing Effective Infographics  
    <https://www.nngroup.com/articles/designing-effective-infographics/>
    - 可借鉴：视觉层级引导阅读；装饰必须增加意义；避免为了美观牺牲信息诚实。

### 3.4 深色控制台 / HUD

12. Stellae: Cyberpunk UI  
    <https://www.stellae.design/learn/cyberpunk-ui-design>
    - 可借鉴：近黑底、霓虹强调、等宽字体、切角/HUD 几何。
    - 风险控制：企业技术海报只取“控制台语义”，不做过度 glitch/扫描线/赛博朋克娱乐化。

13. DaisyUI Cyberpunk Trend  
    <https://trends.daisyui.com/trend/cyberpunk>
    - 可借鉴：深色面板密度、状态色、遥测感、尖锐几何。

14. Empire UI: Cyberpunk Design in Tailwind  
    <https://empire-ui.com/blog/tailwind-cyberpunk-design>
    - 可借鉴：深色网格背景、霓虹边界、扫描线的实现方式；最终模板应克制使用。

15. Vercel Geist / Linear 等开发者工具深色美学分析
    <https://vercel.com/geist/introduction>
    - 可借鉴：近黑而非纯黑、单色 + 单强调、等宽数字。
    - 风险：直接照搬会产生“Vercel/Linear 克隆感”。

### 3.5 竖版长图节奏

16. Venngage infographic layout guide  
    <https://venngage.com/blog/infographic-layout/>
17. Visme infographic best practices  
    <https://visme.co/blog/infographic-best-practices/>
18. Smashing Magazine: The Do's And Don'ts Of Infographic Design  
    <https://www.smashingmagazine.com/2011/10/the-dos-and-donts-of-infographic-design/>

抽象结论：

- 竖版长图应以单栏垂直流为主，双栏只用于对比、并列 KPI 或短列表。
- 每个信息模块尽量自包含，高密度段与低密度段交替。
- 每 3–4 屏应有视觉锚点：全宽架构图、大数字、对比图或深色收尾带。
- 避免每一节都是“标题 + 三个卡片”的同构重复。
- 技术长图不能完全照搬营销信息图的极简原则；应保留专业细节，但用层级组织。

## 4. 当前模板基线诊断

基线使用命令：

```bash
node .agents/skills/tech-poster/scripts/poster.mjs .agents/skills/tech-poster/examples/gateway-framework.json --out temp/tech-poster-baseline.html --png temp/tech-poster-baseline.png --split
```

基线回执正常：`audit.externalUrls = 0`、`runtimeBlockedRequests = 0`、`horizontalOverflow = false`。

从真实 PNG 与代码可见的问题：

1. **Hero 插画漂亮但主题弱**：珠峰主视觉占比较大，像通用宣传海报；缺少“系统状态、图纸编号、遥测条、技术文档”信号。
2. **栏目同构严重**：`overview`、`cards`、`layers` 都是白卡/浅色卡 + 圆角 + 细边框，长图中段节奏单一。
3. **KPI 未形成锚点**：`metric-val` 目前约 28px，视觉上只是普通卡片文本，无法承担长图停顿点。
4. **嵌套容器偏多**：section 卡内再嵌 metric/cap/arch/module 卡，产生“后台管理页面”感。
5. **技术语义不足**：缺少 title block、图纸编号、状态灯、规格标签、测量标注、正交连线、图例等工程细节。
6. **流程连线不够工程化**：`poster-core.mjs` 当前非对齐边主要用三次贝塞尔曲线；IBM 技术图规范更推荐正交/肘形连接。
7. **主题只是换色**：深色/浅色没有形成各自的材质逻辑。深色应更像面板/控制台，浅色应更像纸面/图纸。

相关代码事实：

- Hero 样式集中在 `.agents/skills/tech-poster/scripts/render.mjs` 的 `.poster-hero`、`.hero-title`、`.hero-meta`。
- 栏目卡与章节头集中在 `.poster-section`、`.section-head`、`.section-num`、`.section-title`。
- KPI、能力卡、layers 样式集中在 `.metric-card`、`.cap-card`、`.arch-layer`。
- 流程 SVG 由 `.agents/skills/tech-poster/scripts/poster-core.mjs` 的 `renderFlowSvg` 生成，连线当前在 `edgeMarkup` 中构造。

## 5. 三个自制样例方向

### 5.1 工程蓝图 / Blueprint Sheet

文件：`temp/tech-poster-style-samples/01-blueprint.png`

视觉特征：

- 浅蓝图纸面 + 8px/40px 双层网格。
- ISO 图幅双线框、四角对位十字、sheet number。
- 红色“仅限内部交流”印章。
- KPI 大数字下挂尺寸标注线。
- 架构使用剖面线、中心线、引线编号、SECTION A-A 等制图语言。
- 底部有核查单、title block、修订履历与比例尺。

优点：

- 工程可信度和差异化最强。
- 浅色打印/归档友好。
- 与架构评审、平台工程、基础设施内容高度契合。

风险：

- 标注、网格、印章等装饰必须克制，否则会变成“蓝图 cosplay”。
- 小字密度高时，IM 缩略图可读性下降。

### 5.2 深色控制台 / Console Ops

文件：`temp/tech-poster-style-samples/02-console-ops.png`

视觉特征：

- 近黑深蓝底 + 顶部遥测条。
- LED 状态灯、面板细边、微弱发光。
- KPI 面板包含编号、等宽大数字、sparkline、阈值线。
- 请求链路像运行态管道：节点、状态 chip、分段时延预算。
- 接入区是终端窗口 + 数据面节点状态表。

优点：

- 屏显冲击力最强。
- 与 SRE、网关、监控、安全、运行态系统语义高度契合。
- KPI、链路状态、接入代码三类核心内容都有自然载体。

风险：

- 打印最不友好。
- 若霓虹、扫描线、glitch 过量，会显得浮夸；企业场景必须克制。
- 灰色文字要防止对比度低于 WCAG 4.5:1。

### 5.3 瑞士编辑网格 / Swiss Editorial

文件：`temp/tech-poster-style-samples/03-swiss-editorial.png`

视觉特征：

- 米白纸面、红黑双色、粗黑规则线。
- 超大拉丁标题 + 中文标题字重对比。
- 大号章节编号与红色句点。
- KPI 大数字非对称排布。
- 架构以编辑式分层表呈现。
- 注意事项采用双栏小字排版。

优点：

- 中文标题和正文最自然。
- 打印友好，适合管理层/跨部门受众。
- 大编号能显著改善长图章节节奏。

风险：

- 单独使用技术感偏弱。
- 信息容量低，复杂架构图需要融合蓝图或控制台图形语言。
- 容易滑向“只有大字和留白、没有真网格”的表层模仿。

## 6. 评估结论与推荐

### 6.1 结论

不建议把下一轮升级理解成单纯“换一套皮肤”。更合理的方向是：

> **瑞士网格做骨架 × 工程蓝图做浅色主体 × 深色控制台做屏显主体。**

也就是：

1. **骨架瑞士化**：所有主题共享 8px/12 列网格、大号章节编号、左对齐、明确标题层级、等宽字体标签。
2. **浅色旗舰 Blueprint Sheet**：用于打印、评审、架构文档化场景。
3. **深色旗舰 Console Ops**：用于屏幕分享、运维/SRE/网关/监控/安全等运行态技术内容。

### 6.2 如果用户只选择一个方向

- **屏显优先：选 Console Ops**。它最能快速摆脱当前“通用后台卡片”的感觉，也最符合内网 IM/浏览器查看场景。
- **打印/评审优先：选 Blueprint Sheet**。它最有工程档案感，也最适合浅色主题长期沉淀。
- **Swiss Editorial 不建议单独作为唯一方向**，但其中的大编号、标题尺度、网格和留白纪律必须吸收。

## 7. 下一轮实施建议（待用户确认后再做）

### 7.1 最小落地顺序

1. **先改全局骨架**：`render.mjs`
   - Hero 遥测条/图纸头。
   - 大号章节编号与标题层级。
   - 统一 8px 网格、内容栏宽、章节间距。
   - 降低嵌套卡感，调整边框/圆角/阴影材质。

2. **再沉淀主题 token**：`themes-css.mjs`
   - 新增或重塑 `console-ops`、`blueprint-sheet` 两组 token。
   - 深色用面板边界 + 微光；浅色用纸面细线 + 制图标注。

3. **升级图形语义**：`poster-core.mjs`
   - `flow` 主干连线优先正交/圆角肘形。
   - 固定节点形状语义：start/end、process、decision、service、db。
   - `layers` 从嵌套卡改为技术剖面/层级图。

4. **最后微调背景**：`backgrounds-css.mjs`、`backgrounds-chip-css.mjs`
   - 不重写现有背景 id，保持兼容。
   - 降低通用插画感，让 Hero 装饰服务系统主题。

### 7.2 兼容红线

- 不改变 JSON schema 与 `#poster-data` 恢复能力。
- 不破坏既有 theme/background id 和 CLI 参数。
- 不引入外部字体、图标库、图片或脚本。
- 保持静态审计 `audit.externalUrls = 0` 与运行时 `runtimeBlockedRequests = 0`。
- 侧边栏编辑器依赖的 class 名与数据结构应尽量保留；如需改 DOM，先查 `client-app.js` 选择器。

### 7.3 代码探索补充约束

只读代码探索确认的额外事实：

1. `#poster-canvas`、`#poster-data`、`#tp-main-style` 是导出、数据恢复和浏览器编辑的关键契约，不能改名。
2. `[data-section-index]` 用于画布点击定位编辑器，`[data-poster-panel]` 用于 `--split` 分段导出；Hero 为 `-1`，footer 为 `-2`，这些行为不能破坏。
3. `.hero-art`、`.poster-section`、`.section-title` 已被 smoke test 直接使用，未来改造应保留。
4. `metric-grid` 列数当前写在 inline style 中，纯 CSS 难以覆盖；若要实现响应式或编辑式指标排版，需要调整渲染结构。
5. `flow` 节点和连线缺少 kind/class 修饰，纯 CSS 无法精确区分 process/decision/service/db；深度视觉升级需要改 `renderFlowSvg`。
6. Hero SVG 内部元素大多没有 class，不能靠 CSS 精细改局部颜色；要改主视觉必须调整背景生成器。
7. 需要后续实测 `.tp-export-root[data-theme]` 与 `[data-bg]` 的变量优先级，避免浏览器端“复制/下载 PNG”和 CLI 截图的 Hero 背景不一致。
8. 当前 Hero、section、footer 存在多条近似但不同的对齐轨线；下一轮应先统一网格轨线，再谈装饰。

## 8. 本轮验证记录

- 当前 baseline 成功导出 HTML + PNG + split panels。
- 三张样例均为自包含 HTML/CSS/inline SVG，无外链字体、图片或脚本。
- 样例 PNG 已人工目视检查；导出尺寸见第 2.2 节。
- 网络灵感图版 12/12 图片已本地化并在 1360px、768px、390px 宽度检查无横向溢出。
- 未修改 `.agents/skills/tech-poster` 下任何文件。

## 9. 待用户决策

请用户评估 artifact 中的三张样例：

1. 是否接受“骨架瑞士化 + 深色 Console Ops + 浅色 Blueprint Sheet”的双旗舰方向？
2. 若只能先做一个，优先做 **Console Ops** 还是 **Blueprint Sheet**？
3. 是否保留瑞士编辑网格作为独立浅色主题，还是只把它作为底层排版纪律？

用户确认后再进入 tech-poster 代码改造阶段。

## 10. 用户反馈与阶段 0.1 克制版迭代（实施前记录）

用户反馈：上一轮三个方向“有点过于花哨”，不符合公司内部使用场景。

本轮调整口径：

1. 不再追求海报感、营销感、赛博/控制台氛围或强装饰蓝图语言。
2. 目标改为“公司内部专业技术简报”：克制、清晰、可信、信息密度高、打印友好。
3. 装饰只保留对阅读有帮助的元素：细分隔线、章节编号、轻量网格、状态文字、架构图连线；去除印章、强网格底纹、大字海报标题、霓虹、遥测光效、过多色块。
4. 仍不修改 `.agents/skills/tech-poster` 代码，只制作新的评估样例。
5. 计划输出 2 个克制方向：浅色企业技术简报（主）、低调深色技术面板（备选）。

完成后将更新评估 artifact、本文档和 git 提交。

## 11. 阶段 0.1 结果：公司内部克制版样例

已根据“有点过于花哨，公司内部使用”的反馈补做两张克制样例，仍未修改 `.agents/skills/tech-poster` 代码。

评估页：

- <http://127.0.0.1:3425/a/4lhi7c4mvz62xhzn3ja7pmvxxe/>
- 本地源文件：`temp/tech-poster-corporate-evaluation/index.html`

样例文件：

- 浅色企业技术简报：`temp/tech-poster-corporate-samples/01-internal-brief-light.html` / `.png`
- 低调深色技术面板：`temp/tech-poster-corporate-samples/02-internal-panel-dark.html` / `.png`
- 浅色 PNG 尺寸 `2160×3280`（1080×1640 CSS，2x 导出）
- 深色 PNG 尺寸 `2160×3476`（1080×1738 CSS，2x 导出）
- 评估 artifact 已更新为 version 2，采用子代理最终精修版样例

设计调整：

1. 去除上一轮的印章、强网格底纹、海报式大标题、霓虹、光效、HUD 角标和复杂插画。
2. 使用更接近公司内部技术简报的结构：文档编号、简洁 Hero、meta 行、KPI 横条、逻辑架构、接入步骤和责任边界表。
3. 浅色版以白/浅灰和企业蓝为主，推荐作为默认方向；深色版保持安静低饱和，仅适合作为运维、监控、安全类主题的备选。
4. 两张样例刻意控制装饰密度，把“技术感”主要来自架构图、对齐、编号、分隔线和信息组织，而不是视觉特效。

更新后的推荐结论：

- **默认方向优先选择浅色企业技术简报。**
- 若后续实现模板，建议先把现有模板重构为“浅色内部技术简报”默认主题，再保留一个低饱和深色主题作为可选。
- Blueprint / Console Ops / Swiss Editorial 三个方向降级为探索参考，不建议直接作为内部默认模板。

待用户确认的问题收窄为：

1. 浅色企业技术简报是否足够接近预期？
2. 是否还需要保留深色备选主题？
3. 当前克制程度是否合适，还是仍需要再降低视觉装饰？
