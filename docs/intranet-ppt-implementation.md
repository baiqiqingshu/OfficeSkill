> 历史记录：当前技能已迁移为 `native-ppt`，现行用法与验证结论以 [Native PPT 实施文档](native-ppt-implementation.md) 和 [新 SKILL](../.agents/skills/native-ppt/SKILL.md) 为准；旧 CLI 入口继续兼容。

# 内网 PPT Skill 实施方案

## 目标与范围

新增独立的 `.agents/skills/intranet-ppt`，面向技术汇报、技术方案评审、需求评审。保留现有 dashi-ppt，提供更短的模型操作路径：选择组件、填写一份 JSON、运行本地命令，生成可编辑 PPTX 与离线 HTML 内容预览。实施依据为现有代码，不读取其他 docs 文档。

## 架构决定

- 使用本地 Python、python-pptx、lxml、Pillow；不依赖云服务、浏览器、Node、遥测或自动安装。Dashi 导出引擎有专有许可，不复制其实现。
- PPTX 母版/示例页面原生保留，不经过 HTML 重建。每页通过 `masterSlide` 选择源 PPTX 页面，允许重复和重排，追加组件生成的原生文字、形状、图片和表格。
- 元素库存储 JSON 清单及受限 HTML/CSS 组件，内容通过 `data-slot` 绑定。框架将 HTML 解析成统一场景，分别输出 HTML 和 PPTX。支持的 HTML/CSS 是明确子集，第三方库不执行代码；任意网页不在原型范围。
- HTML 比 PPT 适合模型填写和组件维护；PPTX 适合无损保留公司固定视觉。采用混合方案，不宣称任意 HTML 与 PowerPoint 像素一致。
- 模板正文由组件控制；母版只建议保留固定背景、徽标、页脚。提取现有 PPTX 时输出组件库、清空内容的母版和可直接生成的示例配置；不可表达的对象明确报告。

## 固定输入契约

```json
{
  "schemaVersion": 1,
  "title": "技术方案评审",
  "master": "./master.pptx",
  "libraries": ["./library/library.json"],
  "pageSize": {"width": 1280, "height": 720},
  "pageCount": 1,
  "pages": [{
    "id": "overview", "masterSlide": 1,
    "elements": [{
      "id": "heading", "component": "builtin/title",
      "box": {"x": 64, "y": 40, "w": 1152, "h": 72},
      "inputs": {"text": [{"text": "方案", "bold": true}, {"text": "概述"}]}
    }]
  }]
}
```

`master`、`libraries`、`pageSize`、`pageCount` 可省略；省略使用内置空白母版、内置组件、1280×720，页数由 pages 决定。路径相对于配置或库清单，不依赖当前工作目录。组件命名为 `库ID/组件ID`。

库清单：`schemaVersion:1, id, name, components:[{id,name,description,size:{width,height},inputs:{输入ID:{type,required}},html}]`。`html` 为内联字符串；另支持 `htmlFile` 本地相对文件。输入类型 `richtext/text/image/table/list`；富文本为字符串或 runs 数组，run 支持 `text,bold,italic,fontFamily,fontSize,color,underline`。组件 HTML 的 CSS 为内联、绝对定位，尺寸使用 px/%；使用 `data-slot` 绑定输入。

## 命令与模块边界

入口：`python scripts/ppt_tool.py <command>`。

- `catalog [--library PATH]`：输出组件输入和尺寸，不要求模型阅读实现。
- `validate CONFIG`：检查 JSON、组件输入、资源与包安全。
- `render CONFIG --out DIR [--overwrite]`：生成 `presentation.pptx`、`preview.html`、`report.json`。
- `extract SOURCE.pptx --out DIR [--overwrite]`：输出 `master.pptx`、`library/library.json`、`deck.json`、`extraction-report.json`。
- `starter --out DIR [--overwrite]`：输出内置母版、全部场景 JSON 示例和示例图片。

模块职责：

1. `components.py`：库读取、受限 HTML/CSS 解析、输入绑定、统一场景、离线 HTML 预览。
2. `pptx_backend.py`：PPTX 包安全、母版页克隆、场景导出、默认母版、现有 PPTX 提取。
3. `cli.py` / `ppt_tool.py`：参数、配置校验、路径解析、原子输出、命令整合。
4. `assets/libraries/builtin/library.json`、`examples/`、`references/`、`SKILL.md`：组件、场景、模型使用说明。

统一场景节点约定：`type` 为 `text/rect/line/image/table`，`x,y,w,h` 为页面像素，`style` 使用 `fontFamily,fontSize,color,bold,italic,underline,fill,borderColor,borderWidth,align,verticalAlign,padding`，文字节点 `runs`，图片节点 `src`（已验证本地绝对路径），表格节点 `rows`（单元格为字符串或 runs）。由组件模块输出，后端不重新解释 HTML。

## 安全约束

拒绝网络/UNC 路径、脚本、外部资源、事件属性、非白名单 HTML/CSS、PPTX 外链、宏、ActiveX、DTD/实体。库内资源限制在库目录；配置资源限制在配置目录，拒绝路径穿越与符号链接逃逸。不上传、不自动联网安装、不执行库内代码。组件库 HTML 禁止脚本；预览页只含内联交互脚本（缩放/翻页），不加载外部脚本或远程资源。公司母版的固定视觉只以 PPTX 为准。

## 并行实施与验收

实施代理分别负责组件引擎、PPTX 后端、CLI/内置库/Skill 说明，主代理管理契约和整合。独立测试代理用临时目录执行真实命令与输出检查，不编写测试代码。验收覆盖默认三场景、局部富文本、第三方本地库、多个页面/元素、源页重复排序、现有 PPT 提取后再生成、无网络与危险输入拒绝。完成后在本文记录实际交付与限制，自动提交相关代码。

## 实施状态

已完成独立 skill，保留现有 dashi-ppt 不变。组件引擎、PPTX 后端、CLI/示例/说明分别由三个实施代理完成；另一个独立验证代理完成真实工作流验收，未新增测试代码。

实际交付：

- 五个固定命令：`catalog`、`validate`、`render`、`starter`、`extract`。
- 内置组件库（当前 49 个，见下节），覆盖标题、正文、要点、卡片、表格、图片、指标、封面、章节、目录、流程、架构、时间线、对比、结论、场景串讲、IPD SR/AR 需求串讲等。
- 五类可直接生成的配置示例（6 份示例）：技术汇报、技术方案评审、需求评审、场景串讲、IPD 需求串讲。
- 配置 JSON Schema、第三方库格式和提取/安全边界说明。所有运行代码与资源在 skill 内自包含，可整体复制到内网，不依赖其他 skill。
- 图片为本地 PNG/JPEG/GIF/BMP/WebP；输出 HTML 内嵌 PNG，预览页仅含内联交互脚本，无远程依赖。表格和文字为原生 PowerPoint 可编辑对象。
- 输出目录事务发布，失败不发布半成品；覆盖仅限有本工具标记的专用产物目录，且禁止输出目录包含本次输入。

与初始方案的具体收敛：

- 提取出的组件 HTML 内联保存在 `library/library.json`，图片位于 `library/assets/`；第三方库仍支持 `htmlFile`，不要求为每个提取组件额外创建文件。
- HTML/CSS 支持绝对坐标、有限字体/颜色/边框、1/2/4 值 padding、`border-radius`、`line-height`、`letter-spacing`、`thead` 表头和列表标记 class。明确拒绝 flex/grid、样式表、脚本、渐变和任意网页转换。
- 普通文字、非裁剪图片、非合并表格、简单矩形可提取。组合、图表、旋转、复杂形状等保留为原生静态对象并报告；混合静态对象时需检查层叠顺序。主题色/字体及表格复杂效果属于近似映射，不能承诺往返像素一致。
- 库最多 200 个组件；提取超出组件容量、页面边界或支持范围的对象会保留在母版并报告。含嵌入附件/工作簿的 PPTX 也会被包安全检查拒绝。
- 自定义母版保持原页面尺寸；JSON 的像素画布映射到原生尺寸。`box` 缩放会缩放组件字号，不会根据内容自动缩小字体或截断正文；最终应本地检查文字溢出。
- 生成和提取会去除源备注、批注、缩略图和旧元数据。模板本身的固定文字、母版内容以及提取出的业务正文仍属于敏感数据，需要保存在内网。

## 独立验收结果

2026-11-05，独立测试代理完成以下真实命令和产物检查：

| 项目 | 结果 |
| --- | --- |
| starter、三个场景配置 validate/render、skill quick_validate | 通过 |
| 公司原生母版按 `2,1,2` 复用；固定页脚和装饰保留 | 通过 |
| 每页多个元素；局部加粗/取消粗体、宋体斜体；本地图片和原生可编辑表格 | 通过 |
| 本地第三方 `htmlFile` 元素库 | 通过 |
| 生成结果提取为 27 个组件，再校验、生成和重排 | 通过 |
| URL、UNC、穿越、符号链接逃逸、脚本、事件、CSS URL、iframe、PPTX 外链拒绝 | 通过 |
| 失败无半成品，保护非本工具目录和输入目录 | 通过 |
| 拦截网络连接后运行完整生成 | 成功，连接尝试为 0 |
| 本机 PowerPoint 打开并导出 PNG，检查组合案例和提取回放截图 | 通过，未发现明显遮挡或缺失 |

已修复集成中发现的四边 padding、局部样式显式 false、字体透明色拒绝、重复母版克隆名称冲突、示例换行/字号及一句文案的孤立标点问题。未引入测试框架或测试代码。

提取回放的表格主题/填充存在近似转换差异，属于已声明限制；正文、字体和位置可用。HTML 为内容预览，不包含原生母版的固定视觉。框架自身没有网络行为，不代表宿主模型、查看器或操作系统自动满足内网数据边界。

临时验收产物及 JSON 报告位于 `temp/intranet-ppt-validation-20261105-022153/`，由仓库忽略规则排除，不随代码提交。

## 元素库扩展与主题换色（本轮追加交付）

- 内置库扩至 45 个组件（流程、架构、分层、目录、引用、提示框、代码块、时间线、四象限、指标卡、人员卡、接口行等），同目录 `samples.json` 提供演示输入，`images/` 放库内静态图。
- `themes.py` 提供 5 套主题（crimson 默认、blue、emerald、mono、graphite），`load_libraries(palette=)` 在组件 HTML 解析前做规范色板 hex 全词替换；deck JSON 顶层 `"theme"` 生效于 render 链路。
- 新增 `demo` 命令：`demo --out DIR [--library x.json] [--overwrite]` 生成单文件离线 `library-demo.html`。v2 改为「整页示例优先」：读取 `examples/*.json`，按 1280×720 完整页面展示并支持灯箱翻页；组件库分组卡片支持搜索、示例 JSON、复制元素 JSON 和 5 主题换色。预生成产物在 `assets/demo/`。
- `deck.schema.json` 增加 `theme` 枚举；`library-format.md` 增补规范色板、samples.json、demo 用法；`SKILL.md` 增补元素库预览说明。
- 新增 `examples/technical-proposal.json`（11 页完整技术方案），作为 starter 与 demo 的整页示例来源。
- v2 框架扩展：圆角/圆形、行距、字距、表头、单元格边框、列表标记；预览页增加工具栏、缩放、页码导航与键盘翻页；默认母版随主题生成。详见 [intranet-ppt-library-v2.md](intranet-ppt-library-v2.md)。

## 场景串讲与紧凑表格（本轮追加交付）

- 内置库扩至 48 个组件，新增 `outline`（多级要点，1–4 级）、`ui-frame`（界面示意图窗口框）、`figure`（流程图/UML/架构图通用图示框）。
- `list` 输入统一支持 `{"level":1-4,"text":"…"}` 条目：2/3/4 级使用 `◦/▪/–` 前缀并缩进两个全角空格，`text` 可为字符串或 runs；`bullets`、`checklist`、`steps`、`phase`、`matrix2x2` 等组件同时受益。
- 表格行高改为内容驱动：编译期按等宽列、内边距、边框和字符宽度估算换行行数，逐行写入 `rowHeights`；HTML 预览使用 `height:auto` + `<tr>` 最小高度，PPTX 写入 `table.rows[i].height` 并把 GraphicFrame 高度收缩为行高之和。`box.h` 由“等分总高”变为“上限”，短表格顶部对齐。
- 修复紧凑化后暴露的整框背景问题：表格不再额外输出覆盖整个 `box` 的矩形，填充与边框只由单元格承载，避免表格下方出现空白边框带。
- 新增 `examples/scenario-walkthrough.json`（12 页）与 `examples/images/` 三张本地示意图，覆盖背景、前置条件、主成功场景、分支场景、异常场景、后置状态，以及界面示意图、流程图、UML 时序图、表格、多级分点与说明文本；示例使用 `blue` 主题以匹配图片。
- `SKILL.md`、`references/library-format.md` 已同步组件清单、多级 list 约定、表格紧凑行高与示例入口；`assets/demo/library-demo.html` 重新生成（48 组件、5 份示例、32 页，无跳过页）。
- 验收：5 份示例 `validate` 全部通过；`scenario-walkthrough` 与 `technical-proposal` 的 PPTX 表格行高之和等于 GraphicFrame 高度，且明显小于原等分高度；HTML 预览截图无空白边框带、无内容溢出。

验收阶段补充修复：表格行高估算计入单元格 runs 的 `fontSize`；`starter` 复制 `examples/images/`，避免场景串讲示例缺少图片。

## IPD SR/AR 需求串讲（本轮追加交付）

- 内置库 48 → 49，新增 `ar-header`（1152×86）：`crumb` 写 `SR-01 · AR-01 · 背景`，`title` 统一填 AR 名称，`meta` 写场景序号。
- 新增 `examples/ipd-walkthrough.json`（30 页）：封面、SR 列表、AR 列表，随后每个 SR 一页标题页，再按该 SR 下每个 AR 展开六页——背景、主成功场景、异常场景、后置状态、前置条件、分支场景；示例为 2 个 SR × 2 个 AR。示例不展开 IR。
- 每个 AR 内容页只使用 `ar-header` 作页头，页面标题即 AR 名称，场景类型由面包屑区分；SR 列表页用表格 + SR/AR 两层 `layer` 条展示层级，AR 列表页用表格 + 串讲顺序 callout。
- `SKILL.md` 增加 IPD 串讲推荐结构，`references/library-format.md` 增加 `ar-header` 约定；`starter` 帮助文本改为“全部场景示例（含示例图片）”。
- 验收：`catalog` 49 个组件；6 份示例 `validate`/`render` 全部通过；IPD 示例 30 页且无 IR 字样；SR/AR 列表页位于所有 SR 详细页之前；每个 AR 六页顺序正确且标题为 AR 名称。

## 标题压缩与布局检查（本轮追加交付）

- `builtin/title` 从 1152×64 压缩为 1152×52，标题文字高 42、主色条 top 44；`builtin/ar-header` 从 1152×100 压缩为 1152×86。示例标题统一改为 `y=24,h=52`，AR 页头改为 `y=20,h=86`，正文起点上移约 26–28px。
- 新增 `components.audit_layout`：按元素聚合可见边界，检查超出页面、元素重叠、文本溢出、表格溢出；表格使用实际行高、文本使用估算文字高度，容器全包含子元素时不报重叠。
- `report.json` 增加 `layout`（问题数量、详情、建议）；`preview.html` 顶部显示“布局检查通过”或问题数，并列出偏移、重排、拆页、加宽/拆分表格等建议；`validate` 输出 `layoutIssueCount`。
- 当前 6 份示例 `layoutIssueCount` 均为 0；临时重叠、超页、文本溢出、表格溢出测试 deck 均能正确识别并给出建议。详见 [intranet-ppt-layout-check.md](intranet-ppt-layout-check.md)。

## 布局检查修复、字体统一与文件收敛（本轮追加交付）

- **布局检查修复**：修正估算模型与 PPTX 渲染的口径偏差及若干边界 bug，详见 [intranet-ppt-audit-font-cleanup.md](intranet-ppt-audit-font-cleanup.md)。
  - PPTX 段落行距改为绝对行距 `a:spcPts`（段落最大 run 字号 × 0.75pt × line-height，未设时 1.2），与 preview CSS、审计估算三端统一；消除原 `spcPct`（×字体自然行高，雅黑 ≈1.3em）造成的 10–30% 系统性低估。
  - 文本可视带锚点位移无条件应用（middle 对称溢出、bottom 向上溢出）；letterSpacing 计入字宽；混合字号 runs 按视觉段落最大字号计高；满宽不再被 3% 余量误进位；可用宽 ≤0 退化为每字符一行。
  - 表格行高估算列宽折算到字号度量单位（非等比拉伸修正）；rowHeights 与渲染端"全部有效才收缩"口径对齐；图片按 letterbox 实际区域计边界。
  - overlap 判定改方向敏感：仅"先出现包含后出现"豁免；box 完全相同与"后者完全覆盖前者"均报出并注明 z 序；无 elementId 节点纳入审计；手写场景数值鲁棒性兜底。
  - `validate` 输出增加 `layoutIssues` 明细。
- **字体全部微软雅黑**：默认母版 theme majorFont/minorFont 的 latin/ea/cs 改写为 `Microsoft YaHei`（用户在 PowerPoint 中新增文字也回退雅黑）；内置库 `api-item` 的 `path` 与 `code` 组件两处 `Consolas` 改为 `Microsoft YaHei`；run 级 `fontFamily` 显式覆盖通道保留。
- **文件收敛**：删除 skill 内 `temp/`（988 个调试产物）与 `__pycache__`，目录文件总数 1029 → 34（≤100）；`SKILL.md` 新增"维护约束"写入文件预算与雅黑默认约定。
- **验收**（独立测试代理，6/6 通过）：6 份示例 validate 全过、layoutIssueCount=0；render 冒烟生成正常；解包 PPTX 全部 latin/ea/cs 为 Microsoft YaHei、spcPct=0、theme 字体槽为雅黑；library-demo.html 重新生成且内容无 Consolas；负面 deck 正确报出 box 完全相同 / 完全覆盖 / textOverflow 且正常包含关系不误报；顺带修复 `deck.schema.json` theme default 文档值 blue→crimson。
