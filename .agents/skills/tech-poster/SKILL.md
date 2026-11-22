---
name: tech-poster
description: 面向企业内网离线环境的技术分享长条海报（竖版信息图）制作技能。围绕某个技术框架或内网系统组件，按分栏目结构（概览KPI、分层架构、内置流程图、现成图片/SVG图表嵌入、核心能力卡片、选型对比表、配置代码、时间轴、避坑指南、FAQ）生成零外链的自包含单文件 HTML，并离线导出高分辨率 PNG 长图与分段卡片图。严禁外网请求、严禁泄露本地内容。触发词：技术海报、内网长图、技术分享长图、框架介绍海报、组件功能长图、架构海报、tech poster。
license: MIT
metadata:
  version: "1.0.0"
---

# Tech Poster · 内网技术分享长图海报

面向**企业内网离线环境**的技术长图海报制作工具。通过结构化 JSON 描述主题与栏目，一键产出**零外链自包含 HTML** 与**高分辨率 PNG 长图**（支持按栏目分段导出），适合介绍技术框架、内网组件能力、系统架构与核心流程。

## 安全与离线红线（不可违反）

1. **严禁外发任何文件或数据**：不得调用在线生图 API、云端排版服务、外部图标/字体 CDN、遥测统计脚本，也不得把用户内网代码/架构文档上传到任何外部接口。
2. **HTML 绝对自包含**：全部 CSS、SVG、源数据（`#poster-data`）与本地图片（自动转 Base64 Data URI）均内联在单个 HTML 文件中；字体仅使用系统离线字体栈（PingFang SC / Microsoft YaHei / Consolas 等）。
3. **双重安全门禁**：
   - 静态扫描（`audit.mjs`）：检测 HTML 中任何可触发网络请求的外部 URL（`<script src>`、`<link href>`、`<img src>`、`url(...)`、`@import`、`fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon` 等），命中即阻断交付。
   - 运行时拦截（`poster.mjs`）：Playwright 导出 PNG 时拦截全部网络请求，除 `file:` / `data:` / `blob:` 外一律 `abort` 并以非零退出码报错。

## 快速上手（一步出图）

以下命令默认在本 skill 根目录执行；在项目根目录调用时请写全路径 `.agents/skills/tech-poster/scripts/poster.mjs`：

```bash
# 1. 从 JSON 生成单文件 HTML + 2x 高清 PNG 长图（自动执行离线安全审计）
node .agents/skills/tech-poster/scripts/poster.mjs input.json --out temp/poster.html --png temp/poster.png

# 2. 同时导出分段卡片图（每个栏目一张独立 PNG，适合内网 IM 分享不被压缩截断）
node .agents/skills/tech-poster/scripts/poster.mjs input.json --out temp/poster.html --png temp/poster.png --split

# 3. 直接用 --json 一步生成（免写临时 JSON）
node .agents/skills/tech-poster/scripts/poster.mjs --json '{"title":"...","sections":[...]}' --out temp/poster.html --png temp/poster.png

# 4. 对已生成的 HTML 增量修改主题/标题并重导出（无需重写原 JSON）
node .agents/skills/tech-poster/scripts/poster.mjs temp/poster.html --set theme=slate-dark --out temp/poster-dark.html --png temp/poster-dark.png

# 5. 仅做离线安全审计（不导出图片）
node .agents/skills/tech-poster/scripts/poster.mjs temp/poster.html --audit-only

# 6. 速查内置主题、栏目类型和完整示例
node .agents/skills/tech-poster/scripts/poster.mjs --presets
node .agents/skills/tech-poster/scripts/poster.mjs --example
```

常用参数：
- `--bg <背景>`（默认 `everest-blue`；**未同时指定 `--theme` 时自动切换到该背景的配套主题**；旧 id 如 `everest-night`/`glass-wave`/`circuit-board` 自动映射到新背景）
- `--theme <主题>`（显式指定时优先于背景推荐主题；`--presets` 列出全部主题与背景配对）
- `--width 900|1080|1200`（逻辑宽度，默认 `1080`）
- `--scale 1|2|3`（PNG 缩放倍率，默认 `2`，1080px × 2 = 2160px 宽）
- `--split`（在 PNG 同级目录生成 `<name>-panels/panel-01.png` ... 按栏目完整切图，不截断文字）
- `--browser msedge|chrome|chromium`（指定本地浏览器，默认自动探测 `msedge → chrome → bundled chromium`）

## 开箱体验 Demo

本 skill 内置离线演示文件，双击即可体验全部交互：
- `demo/demo.html`：默认蓝色珠峰背景的完整技术分享长图（内置侧边栏可视化编辑、背景/主题切换、一键复制 PNG 到剪贴板、下载 PNG、保存 HTML）
- `demo/demo.svg`：配套离线矢量时序图（演示 `diagram` 栏目如何内嵌现成 SVG/PNG 图片）

## 背景与主题（自动联动）

**背景决定画面，主题决定卡片/强调色/代码块/流程图配色。** 每套背景都有配套主题：工具栏切换背景、CLI 用 `--bg` / `--set background=` 改背景、或 JSON 只写 `background` 不写 `theme` 时，主题自动切到配套主题；之后仍可用主题下拉框、`--theme` 或 JSON `theme` 手动覆盖。

背景分两种构图，全部以内联 SVG / CSS 渐变实现，零外链：
- **分体（split）**：Hero 自带渐变与主视觉插画，插画底部渐隐为正文画布色，首个栏目卡片上移叠压，头部与正文无接缝。
- **一体（unified）**：Hero 透明，纹理统一绘制在整张画布上，头部与正文是同一张背景。

| 背景 `background` | 构图 | 视觉 | 配套主题 `theme` |
|---|---|---|---|
| `everest-blue`（默认） | 分体 | 深蓝晨光 + 低多边形珠峰雪顶 + 远山云雾 | `blueprint` 珠峰蓝 |
| `skyline-tech` | 分体 | 亮蓝天空 + 3D 柱群城市 + 透视网格光环 | `sky-azure` 科技天蓝 |
| `starfield` | 一体 | 深空蓝 + 光环星球 + 光柱 + 星野星云 | `cosmos-night` 星际深蓝（半透明深色卡片） |
| `glass-aurora` | 一体 | 浅蓝紫 + 玻璃浪带 + 悬浮代码晶片 | `lavender-glass` 玻璃靛紫 |
| `clean-slate` | 一体 | 浅色纸面 + 顶部色条，打印友好 | `ink-print` 墨印极简 |
| `chip-die` **芯片晶核** | 一体 | 深青黑 + 等轴测芯片封装 + 电路网格晶核 + 放射走线 | `silicon-dark` 硅晶暗青 |
| `wafer-fab` **晶圆制造** | 分体 | 靛紫渐变 + 虹彩透视晶圆 + 晶粒网格 + 照明光束 | `wafer-iris` 晶圆虹彩 |
| `pcb-trace` **电路板金线** | 分体 | 深绿 PCB + 俯视 SoC + 金色扇出走线/过孔/贴片元件 | `pcb-gold` 电路金绿 |
| `euv-litho` **光刻紫光** | 一体 | 深紫 + EUV 光源→反射镜→掩模版→投影光锥→晶圆曝光 | `litho-violet` 光刻暗紫 |

另有 `slate-dark`（暗夜架构）、`paper-tech`（工业白皮书）、`emerald-ops`（云原生运维）三套通用主题可手动选择。芯片、EDA、制程、封测、硬件驱动类主题优先选后四套半导体背景。

## 十种技术栏目积木（`sections[]`）

每个栏目自动获得顺序编号（`01`、`02`...），并在导出 `--split` 时作为独立完整卡片输出。详细字段见 `references/schema.md`。

| `type` | 用途 | 关键字段 |
|---|---|---|
| `overview` | 组件定位 + 核心指标 KPI 条 + 亮点标签 | `summary`, `metrics[]`, `highlights[]` |
| `cards` | 核心特性 / 模块能力 / 设计原则（2~3 列网格） | `columns`, `items: [{badge, title, desc, tags}]` |
| `layers` | 分层架构图（横切分层 + 侧边横切能力栏） | `layers: [{name, desc, tone, modules[]}]`, `sidebars[]` |
| `flow` | **内置离线 SVG 流程图**（零依赖，支持 `LR`/`TB`、判断节点、服务/数据库图元、分支标注与分组） | `direction`, `steps[]`, `edges[]`, `caption` |
| `diagram` | **现成图表/图片嵌入**（直接嵌入本地 `.svg` / `.png` / `.jpg` / `.webp` 或内联 SVG，支持单图或双图并排，自动内联进单文件 HTML，独立运行无外部工具依赖） | `file`（或 `items: [{file, title, caption}]`）或 `svg`, `caption`, `surface` |
| `timeline` | 请求生命周期 / 演进路线 / 实施步骤 | `items: [{step, title, tag, desc, bullets[]}]` |
| `compare` | 技术选型对比 / 新旧架构差异矩阵 | `headers[]`, `highlightCol`, `rows[]` |
| `code` | 接入代码 / YAML 配置 / 接口契约（内置离线高亮） | `language`, `filename`, `code`, `annotations[]` |
| `callout` | 生产最佳实践 / 避坑注意事项 | `items: [{tone, title, points[]}]` |
| `qa` | 常见问题 FAQ / 排障速查 | `items: [{q, a}]` |

任意栏目均支持 `imageFile`（本地 PNG/JPG/SVG 路径），构建时自动 Base64 内联进 HTML，确保离线单文件分发不丢图。

## 推荐制作工作流

1. **收集与提炼内容**：向用户了解或从本地代码库读取目标框架/组件的核心定位、架构分层、关键流程、核心特性、接入方式与注意事项。绝不编造不存在的指标数字（示意数据须明确标注“示意”）。
2. **规划栏目骨架**（推荐 5~7 个栏目，节奏张弛有度）：
   - **Hero 顶栏**：分类徽标 + 主标题 + 一句话副标题 + 版本/团队/标签元数据
   - **01 概览（`overview`）**：解决什么痛点 + 3~4 个核心量化指标
   - **02 架构或能力（`layers` / `cards`）**：整体分层或核心模块拆解
   - **03 核心流程/图表（`flow` 或 `diagram`）**：简单主链路直接用内置 `flow` 自动绘制纯 SVG 流程图；已有复杂流程图/时序图/架构图文件时直接用 `diagram` 嵌入现成 `.svg` / `.png` 等本地图片（自动内联进 HTML）
   - **04 选型/能力对比（`compare`）** 或 **生命周期（`timeline`）**
   - **05 快速接入（`code`）** + **06 实践避坑（`callout` / `qa`）**
   - **Footer 尾栏**：维护团队、文档编号、内网可见范围提示（如“仅限内部技术交流”）
3. **生成并审计**：运行 `poster.mjs` 同时产出 `.html` 和 `.png`（高度超过 3500px 时建议加 `--split`）。检查退出码与回执：`audit.externalUrls === 0`、`runtimeBlockedRequests === 0`、`horizontalOverflow === false`。
4. **视觉自查**：使用 `read` 工具直接查看生成的 PNG（或分段 `panel-xx.png`），确认文字清晰、流程图无重叠裁切、栏目密度均衡；如有问题直接调整 JSON 重渲染。

## 文案与排版守则

- **短句高密、不塞大段文字**：卡片描述控制在 1~3 句，要点用“加粗关键词 + 短解释”。
- **流程图节点精炼**：动作使用“动词 + 对象”（如“校验 JWT 签名”），判断节点简短明确（如“命中缓存？”），分支条件标在连线上（`是`/`否`）。
- **少用无意义装饰**：不用满屏 emoji 堆砌；图标和色块服务于信息层级和语义区分。
- **HTML 交互工作台**：生成的单文件 HTML 双击打开后，顶部自带离线工具栏（截图/打印时自动隐藏）：
  - **编辑元素（侧边栏）**：展开左侧编辑器，可对顶栏/页脚与所有 10 类栏目的文字进行手动修改，支持新增/删除/上下移动/复制整个栏目以及增删栏目内部子元素（指标、卡片、架构层、流程节点/连线、表格行、代码注解、Q&A 等），并支持从本地选择 `.svg`/`.png`/`.jpg`/`.webp` 离线内联替换图表；支持点击画布栏目自动定位，也支持切换 JSON 源码编辑。
  - **背景 & 主题切换**：9 套内置背景（含 4 套芯片半导体，分体/一体两种构图）与 12 套主题实时切换；切换背景时自动匹配配套主题，可再手动改主题。
  - **复制为 PNG / 下载 PNG / 保存 HTML**：内置纯离线浏览器光栅化管线，支持一键复制高清 PNG 到系统剪贴板、直接下载 PNG，或把修改后的内容保存为新的单文件 HTML。
