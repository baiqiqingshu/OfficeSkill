# intranet-ppt 元素库扩展与可视化 Demo 实施方案

## 目标

1. 内置一个 demo HTML，预览内置元素模板库全部组件，支持切换主题色板；文件可直接双击打开，SKILL.md 告知路径。
2. 将内置元素库从 8 个扩展到约 30 个，面向内网技术方案/需求评审汇报：流程图、表格、分点文本、架构分层、时间线、对比、四象限、封面/章节/目录/结论等。

## 约束（来自现有代码，必须遵守）

组件 HTML 受限子集（components.py）：

- 标签：`div section article p h1-h6 span strong b em i u br img table thead tbody tr th td ul ol li`
- CSS：`position(absolute/relative) left top width height font-family font-size font-weight font-style text-decoration color background background-color padding(1/2/4值) border(Npx solid #RRGGBB) border-width border-style border-color text-align vertical-align white-space(pre-wrap) box-sizing(border-box)`
- **无** flex/grid/margin/line-height/border-radius/渐变/letter-spacing/transform；无 script/style/link；无 `on*` 事件
- 布局全靠绝对定位 px/%；所有可见叶子必须显式宽高且 >0
- 块容器不能混用裸文字与块级子元素（裸文字要包 span/p）；组件根不能直接是文字
- 输入类型：`text/richtext/image/table/list`，经 `data-slot` 绑定；每个 input 必须有绑定；每个 data-slot 必须在 inputs 声明
- `list` 输入渲染为 `• `/`N. ` 前缀的 runs（ul/ol），不能按条目重复子结构 → 多变体流程用固定件数组件或多个元素摆放
- 静态文字可写在叶子标签内（如固定"提示"标签）；img 静态 src 相对库目录且文件必须存在
- 验证命令：`python .agents/skills/intranet-ppt/scripts/ppt_tool.py catalog` 会解析全部组件，必须零错误

## 规范色板（组件只允许使用以下 hex，保证主题可换色）

| 语义 | hex |
| --- | --- |
| INK 主标题 | #17324D |
| BODY 正文 | #263C50 |
| MUTED 次要 | #52687A |
| FAINT 弱文字 | #8496A8 |
| ACCENT_D 深主色 | #145D92 |
| ACCENT 主色 | #1476B8 |
| ACCENT_L 浅主色 | #3F92CC |
| SOFT_A 主色浅底 | #E4EFF8 |
| BG_SOFT 卡片底 | #F0F5FA |
| BG_SOFT2 表格底 | #F5F8FB |
| BORDER 边框 | #C5D3DF |
| BORDER_L 浅边框 | #D8E4EF |
| WHITE 反白文字 | #FFFFFF |
| OK/WARN/DANGER 及 _BG | #1E7A46/#E5F3EA、#A86A00/#FBF0DC、#B3372F/#F9E9E7 |

例外（不参与换色）：代码块深底 #212B36、代码文字 #D9E4EF、代码边框 #3A4A5C。

## 组件清单（库 ID 约定，共约 30 个）

保留：title、text、bullets、card、table、image、metric、steps

新增（ID 固定，demo 组合示例按 ID 引用）：

| id | 名称 | 说明 |
| --- | --- | --- |
| cover | 封面 | 主标题+副标题+汇报人/日期元信息行 |
| section-break | 章节页 | 大编号+大标题+一句说明 |
| agenda-item | 目录行 | 编号+标题+说明，模型摆放多行成目录页 |
| section-title | 小节标题 | 左侧主色竖条+标题文字（可带编号 input） |
| caption | 图注 | 小号居中说明文字 |
| footnote | 页脚注 | 小号弱文字注释 |
| quote | 引用 | 左侧竖线+斜体引用文字 |
| callout | 提示框 | 主色左边条+标签+说明（label 可填"提示/说明"） |
| callout-warn | 警告框 | 同构，WARN 配色 |
| callout-danger | 风险框 | 同构，DANGER 配色 |
| conclusion | 结论条 | 主色底+白字，评审结论/决策 |
| divider | 分隔线 | 细横线（高 2px 左右的 rect） |
| tag | 标签 | 小色块+白字，用于技术栈/分类 |
| status | 状态 | ● + 文字，进度/状态标注 |
| field | 字段行 | 左粗体字段名+右值+下边框，需求字段说明 |
| feature-card | 特性卡 | 序号/符号+标题+说明（比 card 多徽标） |
| panel | 面板 | 顶部标题条+内容区（分组容器） |
| code | 代码块 | 深底等宽字体，命令/SQL/伪代码 |
| image-frame | 带框图片 | 边框+底部图注条 |
| flow-step | 流程步骤 | 编号圆点+标题+说明，横向摆放成流程图 |
| flow-arrow | 流程箭头 | 居中大箭头字符（richtext 可改 →/▼/⇒） |
| timeline-item | 时间线项 | 圆点+竖线+日期+标题+说明，竖排成时间线 |
| phase | 阶段卡 | 阶段名+周期+要点，实施计划/路线图 |
| layer | 架构层 | 左层名标签+右内容说明，竖向叠放成分层架构图 |
| compare | 双栏对比 | 左标题+左列表 \| 右标题+右列表 |
| matrix2x2 | 四象限 | 4 个象限各带标题+列表（SWOT/优先级） |

## samples.json

`assets/libraries/builtin/samples.json`：以 `builtin/<组件id>` 为 key，给出 demo 渲染用的示例 inputs（真实中文技术汇报语料）。image 类输入引用库内 `images/` 下静态图片，需生成 1 张占位示意图 PNG（临时 Pillow 脚本放 temp/，产物提交到库目录）。第三方库可在其 library.json 同目录放同名 samples.json 参与 demo。

## 主题机制（themes.py）

`scripts/intranet_ppt/themes.py`：`THEMES = {id: {name, canvas（demo 画布底色）, colors:{上述语义色→目标色}}}`，5 套：

- `blue` 政务蓝（默认，恒等映射）
- `emerald` 墨绿
- `crimson` 深红
- `mono` 黑白灰
- `graphite` 深色暗底（INK/BODY 换浅色、BG_* 换深灰、canvas 深色）

换色实现：`components.load_libraries(paths, palette=None)` 增加可选参数，在 `_parse` 前对组件 html 字符串做 `#RRGGBB` 全词替换（大小写不敏感）。deck JSON 顶层新增可选 `"theme":"emerald"`，cli.prepare 校验并传 palette；catalog 不需要。第三方库用规范色板即自动支持主题。

## demo 命令与页面

`python ppt_tool.py demo --out DIR [--library x.json] [--overwrite]` → 生成 `DIR/library-demo.html`，走 `_directory_transaction`。同时预生成提交到 `assets/demo/library-demo.html`，SKILL.md 写明可直接打开。

`scripts/intranet_ppt/demo.py`：

- 用 load_libraries 加载内置+第三方库；逐组件取 samples.json 或自动生成示例（text→示例文本、list→3 条、table→表头+2 行、image→Pillow 生成的占位图）
- 复用 components 的 compile_element + 预览节点渲染（把 render_preview 内节点→HTML 的逻辑抽成可复用函数），按原始 size 渲染组件画布，卡片式排布：组件名、`builtin/id`、size、inputs 签名、可折叠示例 JSON
- 页头主题按钮：内嵌 THEMES 的 JS 对象，切换时对所有内联样式做"任一主题色→目标主题色"全词替换（按 token 汇总所有主题色值建映射），同时切换画布底色
- "组合示例"区：流程图（flow-step×3+flow-arrow×2）、分层架构（layer×4）、目录（agenda-item×4）、指标行（metric×3）；按固定 ID 引用，缺组件则跳过该示例
- CSP：`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'`；不引用任何外部资源

## 文档同步

- SKILL.md：新增"元素库预览"段（demo HTML 路径 + demo 命令 + theme 字段）+ 更新内置组件列表
- references/library-format.md：规范色板表、theme 字段、samples.json 约定
- references/deck.schema.json：增加 theme 字段
- docs/intranet-ppt-implementation.md：实施状态追加本轮交付

## 分工与验收

- 子代理 A：library.json 扩展 + samples.json + 占位图；catalog 零错误
- 子代理 B：themes.py、demo.py、components.py palette 参数、cli theme/demo、schema/references/SKILL.md
- 主代理：合并后重新生成 assets/demo/library-demo.html
- 测试代理：catalog/validate/render（含 theme）/demo 全命令 E2E，检查产物；不写测试代码
