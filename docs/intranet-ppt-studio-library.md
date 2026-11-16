# intranet-ppt studio 汇报组件库（ppt-studio 视觉语言移植）

> 第三方元素库 `studio`，位于 `.agents/skills/pptx-builder/assets/libraries/studio/`，面向内网需求/方案评审、答辩汇报类页面。视觉语言提取自 `skills_hub/ppt-studio`（layout-catalog、design-rules、defense-style 与 gallery 样张），重写为 pptx-builder 的受限声明式 HTML，保证原生可编辑 PPTX 与全主题换色。

## 产物

```text
.agents/skills/pptx-builder/assets/libraries/studio/
├── library.json            # 库定义（id=studio，14 个组件）
├── samples.json            # 每组件一条中文内网汇报示例
└── images/
    ├── arch-sample.png     # figure-points 示例架构图
    └── icons/              # 40 枚 Lucide 描边图标（128×128 PNG，ACCENT #1476B8）
```

加载方式与 builtin 相同：`libraries: ["…/studio/library.json"]`（须在 deck 配置目录内），或 `catalog --library` / `demo --library` 命令行参数。

## 组件清单（14）

| id | 名称 | 尺寸 | 用途与容量 | ppt-studio 来源 |
| --- | --- | --- | --- | --- |
| num-header | 编号页眉 | 1152×84 | 内容页页眉：双色错位标记 + 编号 + 竖线 + 28px 标题 + 通栏细线 + 右侧 meta；num≤4 字符，title≤18 字 | 答辩页「编号+标题+下划线」页眉 |
| statement | 阐述条 | 1152×64 | 页面核心主张：浅底 + 深主色竖条 + 徽标 + 一句话主张；label≤6 字，text≤50 字，关键词可用 runs 上 `#B3372F` | 辩护页"one clear claim"主张条 |
| conclusion-band | 结论带 | 1152×76 | 深主色横幅结论：双侧白色装饰条 + 居中 21px 白字；text≤40 字，页底收束 | 答辩页底部结论条 |
| ribbon-panel | 彩带面板 | 552×300 | 证据面板：白底圆角卡 + 顶部居中飘带标题 + bullet 列表；2–4 张并排 | 证据卡 / panel 组 |
| flow-column | 链式竖卡 | 360×300 | 深主色标题块 + 下指箭头 + 白卡（副标题+要点+可选图标）；3–4 张并排成链路 | columns 链路 / 分层卡 |
| route-chain | 技术路线链路 | 1152×190 | 顶部目标句 + 4 段由浅到深阶段块 + 箭头 + 每段注记；step≤8 字，note≤20 字 | 横向技术路线图 |
| milestone-axis | 里程碑轴 | 1152×292 | 主色轴线 + 4 枚年份胶囊 + 事件卡上下交错；year"2026 Q2"，desc≤30 字 | 时间轴 / 里程碑 strip |
| issue-fix | 问题对策双栏 | 1152×230 | 左淡红问题栏 + 圆形箭头 + 右浅蓝对策栏（✓ 列表）；每栏 2–4 条 ≤24 字 | 问题→对策 split panel |
| big-number | 大数字卡 | 360×200 | KPI 卡：主色顶条 + 48px 大数字 + 单位 + 口径注记；3 张并排 | 大数字/数据陈列 |
| figure-points | 左图右文图版 | 1152×400 | 左 660×352 带框图 + 图注；右标题条 + 要点 + 说明；items 3–6 条 | 左图右文版式 |
| innovation-row | 编号亮点行 | 1152×104 | 「01」深块 + 标签块 + 说明行；3–4 条竖排成"特色与创新"页 | 创新点/亮点编号行 |
| versus-panel | 优劣对比面板 | 1152×330 | 左推荐卡（深头+徽标+✓）/ 右对照卡（灰头+dash）+ VS 圆徽；每侧 3–5 条 | 方案比选双栏 |
| risk-item | 风险条目 | 1152×110 | 等级徽标 + 风险名 + 描述 + 右侧"应对"浅底框；叠 3–5 条成风险清单 | 风险矩阵（列表化） |
| honor-item | 成果条目 | 1152×116 | 图标 + 成果名 + 说明 + 等级胶囊 + 右下元信息；叠 2–4 条 | 获奖/成果 showcase |

必填输入以 `*` 标注于 `library.json`；完整 description 与 catalog 容量见 `ppt_tool.py catalog --library …/studio/library.json` 输出。

## 图标清单（40）

来源 `skills_hub/ppt-studio/assets/icons/lucide.json`（ISC 许可，见同目录 `LUCIDE_LICENSE.txt`）。组件引擎只接受 PNG/JPG 等位图，而本机无 CairoSVG/Inkscape/Magick/rsvg-convert，故用 `temp/render_icons.py` 自写栅格化：解析 Lucide 24×24 path 数据（含 `a` 弧线紧凑旗标），按 stroke-width=2 以 PIL 线段+关节绘制，输出 128×128 透明 PNG，描边色取规范色板 `ACCENT #1476B8`。

```text
chart-column  chart-line  chart-pie   trending-up   gauge
presentation  table       target      flag          route
milestone     calendar-check  clock   file-text     file-search
clipboard-check   book-open   triangle-alert  circle-check  badge-check
shield-check  list-checks users       user-check    handshake
building      settings    cpu         server        database
network       workflow    layers      lightbulb     zap
rocket        circle-dollar-sign  trophy  award     search
```

覆盖图表、目标、日程、文档、告警、勾选、人员、协作、建筑、设置、算力、数据库、网络、分层、创意、闪电、经费、奖项、检索等汇报高频场景。

## 设计决策

1. **色板**：全部颜色取自 `themes.py` 规范 hex（`#17324D` INK、`#1476B8/#1476B9` ACCENT、`#145D92` ACCENT_D、`#E4EFF8` SOFT_A、`#F0F5FA/#F5F8FB` 浅底、`#D8E4EF` BORDER_L、`#FDFDFD` SURFACE、`#B3372F/#F9E9E7` DANGER、`#A86A00/#FBF0DC` WARN、`#1E7A46` OK），白字填充块用 `ACCENT_FILL/#1476B9`、`ACCENT_FILL_D/#145D93`，保证 blue/emerald/crimson/mono/majestic/graphite 等全部主题整体换色（demo 已验证 crimson 映射）。
2. **答辩式语言**：编号页眉、结论带、彩带面板、问题/对策红蓝对照对应 defense-style 的"一个主张+证据"范式；红仅用于问题侧与关键词，符合"有限红色强调"。
3. **受限 CSS 适配**：无 flex/grid，全部 `position:absolute` + 固定 px；渐变改为深浅分段实色（route-chain 四段、versus/issue-fix 双色面板）；阴影改为 1px `BORDER_L` 边框；圆角用 `border-radius`（≤10px 卡片、50% 徽标）。
4. **输入粒度**：list 上限 100 项但 description 约束 2–6 条；richtext 支持 runs 上色（如 risk 等级、statement 关键词）；image 输入走本地 PNG（`images/icons/*.png`、`images/arch-sample.png`）。
5. **big-number 单位**：单位槽为固定坐标（left:190, top:86），短数值（≤5 字符）单独使用时视觉正常；长数值或需紧贴效果时用 `value` 的 runs 内嵌小字号单位，示例：`"value": [{"text":"85"},{"text":" %","fontSize":18}]`（samples.json 与验证 deck 均按此写法）。
6. **与 builtin 的差异**：结论带居中无徽标、彩带面板为飘带式标题、对比面板带 VS 圆徽与推荐徽标——与 builtin 的 conclusion/compare/card 视觉可区分，不重复造轮子。

## 未移植的 ppt-studio 布局及原因

| ppt-studio 版式 | 未移植原因 |
| --- | --- |
| 渐变色块/毛玻璃/投影卡片 | CSS 子集不支持 `linear-gradient`、`box-shadow`、`backdrop-filter`；用分段实色+细边框近似 |
| 内联 SVG 图标/插画 | 引擎仅接受 PNG/JPG 等位图；改为离线预渲染 40 枚 PNG |
| 真甘特图（按日期比例铺色块） | 需要多行多段自由定位与日期换算，声明式 HTML 表达成本高；`milestone-axis` 提供等效横向里程碑表达 |
| 数据图表（柱状/折线/饼图） | 无图表脚本能力；用 `big-number` + `figure-points`（成品图）替代 |
| 组织架构图 / 网络拓扑 / 复杂连线图 | 需连线与任意路径绘制；建议外部出图后经 image 输入嵌入 |
| 风险矩阵 5×5 网格 | 单元格矩阵可用 builtin/table 表达；`risk-item` 提供答辩更常用的"等级+描述+应对"条目式 |
| 封面大图蒙版 / 章节大字排版 | builtin `cover`/`section-break` 已覆盖，未重复实现 |
| 页面转场、逐条出现动画 | 原生 PPTX 生成不表达动画，HTML 预览亦无脚本 |
| 引用/脚注并排多栏小字 | builtin `footnote`/`quote` 已覆盖 |

## 验证记录

- `catalog --library assets/libraries/studio/library.json`：14 个 studio 组件全部列出，零错误，各槽容量合理。
- `demo --out temp/studio-demo --library …`：`components: 80`（builtin+studio），`decks: 7`，`pages: 67`，`skipped: []`；headless Edge 截图逐页检查，crimson 等主题换色正常。
- 端到端：`temp/studio-deck.json`（6 页，覆盖全部 14 组件）`render` 成功，`presentation.pptx` 原生可编辑，`layoutStatus: passed`、`layoutIssueCount: 0`、nativeChecks passed；preview 截图确认版式与 runs 单位渲染正确。

## 使用要点

- 页面 1280×720、安全边距 64px：num-header 放 `(x=64, y=24)`，statement 放 `y≈116`，conclusion-band 页底 `y≈620`；360 宽组件三张并排 `x=64/460/856`，552 宽两张并排 `x=64/664`。
- icon 输入传相对库目录路径 `images/icons/<name>.png`；deck 中相对 deck 配置目录。
- 自定义 deck 中 `libraries` 与图片路径禁止 `..`，须位于配置目录内（`_asset`/`_resource` 校验）。
- 生成脚本与验证 deck：`temp/render_icons.py`、`temp/make_sample_fig.py`、`temp/studio-deck.json`（渲染产物在 `temp/studio-render/`、`temp/studio-demo/`）。
