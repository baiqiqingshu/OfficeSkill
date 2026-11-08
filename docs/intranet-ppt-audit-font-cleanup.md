# intranet-ppt 审查修复实施文档

本轮三项任务：布局检查（layout audit）实现问题修复、默认字体全部统一为微软雅黑、skill 目录文件数收敛至 ≤100。

## 一、布局检查问题与修法

布局检查实现位于 `components.py`：`audit_layout`（963-1028）+ `_text_width`/`_cell_lines`/`_table_row_heights`/`_text_required_height`/`_node_visual_rect`/`_union_bounds`/`_page_overflow`/`_contains` 等估算函数。整体框架正确（渲染前检查、与渲染共享同一批编译节点、页面 px 统一单位），问题集中在估算模型与 PPTX 实际渲染的口径偏差及若干边界 bug。逐项修法：

| # | 问题 | 修法 | 位置 |
|---|---|---|---|
| 1 | **行高语义错配（系统性低估，漏报）**：审计按 `行数×字号×lineHeight`（CSS em 语义，默认 1.2）；PPTX `paragraph.line_spacing=ratio` 写 `a:spcPct`，语义是 ratio×字体自然行高（雅黑≈1.3em），实际行高比审计高约 10–30% | **统一为绝对行距**：`_text` 中对每个段落取该段最大 run 字号，写 `paragraph.line_spacing = Pt(最大字号px×0.75×ratio)`（产出 `a:spcPts`，与 CSS em、preview 的 line-height、审计三者一致）；`lineHeight` 未设时统一按 1.2（与 preview `.text{line-height:1.2}`、审计默认一致） | `pptx_backend.py::_text` |
| 2 | **包含豁免过宽**：`_contains` 双向豁免 → 完全相同 box 的重复元素、后绘制元素完全盖住先绘制元素（z-order 反了）都漏报 | 只在"先出现的元素包含后出现的元素"（容器在底层）时豁免；box 完全相同或后者包含前者 → 报 overlap，detail 注明"box 完全相同"/"后者完全覆盖前者" | `components.py::audit_layout` |
| 3 | **溢出文本可视带锚点错误**：`required>h` 时一律按 top 锚点向下扩，但 middle 锚点向上下对称扩、bottom 向上扩 | 锚点位移无条件应用（`middle: y+=(h-required)/2`、`bottom: y+=h-required`，required>h 时自然向上偏移） | `components.py::_node_visual_rect` |
| 4 | **混合字号 runs 全按最大字号计高（误报）** | `_cell_lines` 改为逐段累计：每次 flush 的行组按该组内最大字号结算，返回 `(行数, 行高像素和)`；两处调用方改为 `行高和×lineHeight` | `components.py::_cell_lines` 及调用方 |
| 5 | **图片按整 box 计入边界（误报 overlap）** | 审计侧用 PIL 读图尺寸，按 `min(w/iw,h/ih)` 等比居中算 fitted rect；读不了回退整 box | `components.py::_node_visual_rect` |
| 6 | **`letterSpacing` 未计入字宽**（正字距漏报/负字距误报） | `_text_width` 增加 `spacing` 参数，每字符累加；`_cell_lines` 透传；text 节点与表格单元格分别取各自 style 的 letterSpacing | `components.py` |
| 7 | **`_TABLE_SAFETY=1.03` 边界误报**：宽度 ≥97.1% 可用宽即算 2 行 | 改为 `width<=available → 1 行`，确认溢出后 ceil 时保留 3% 余量 | `components.py::_cell_lines` |
| 8 | **表格行高宽度口径**：`_table_row_heights` 在组件 px 域按 `rect.w` 估算后乘 `scale=min(sx,sy)`，非等比拉伸（sx>sy）时真实列更宽、估算偏高 | `emit` 中改传 `rect["w"]*sx/scale`（折算到"字号的度量单位"），结果仍乘 scale —— 渲染与审计同源受益 | `components.py::compile_element` |
| 9 | **rowHeights 部分无效口径不一**：审计对有效子集求和；渲染仅当全部有效才收缩高度 | 对齐渲染规则：统计 rowHeights 前 len(rows) 个有效值，全部有效才用求和否则用 box 高 | `components.py::_node_visual_rect`+审计 table 分支 |
| 10 | **available≤0 退化为 1 行（漏报）** | 退化为"每字符一行"估算 | `components.py::_cell_lines` |
| 11 | **手写场景鲁棒性**：rowHeights 非 list → TypeError；坐标 None/NaN → 崩溃；无 elementId 的节点被丢弃不审计 | `_valid_row_heights` 加类型保护；新增 `_num` 兜底解析；回退分组把无 elementId 节点按各自伪元素纳入审计 | `components.py` |
| 12 | **validate 只回 issueCount** | 结果中附带 `layoutIssues` 明细，不渲染也能看到问题 | `cli.py` |

设计层说明（不改代码）：检查为估算性质的建议项；母版静态装饰不参与检查（report.json 已有类似说明）；overlap detail 中补充 z-order 提示。

## 二、字体统一为微软雅黑

现状：默认字体已基本就位 —— `components.DEFAULT_STYLE`、`_font` 兜底、`_shape_style` 提取默认、`library.json` 99 处组件、preview/demo body 字体栈均为 `Microsoft YaHei`；`_font` 已同时写 latin/ea/cs 三槽位。

待改缺口：

1. **默认母版主题字体仍是 Calibri**：`create_default_master` 用 python-pptx 默认模板，theme `majorFont/minorFont` 的 latin 为 Calibri Light/Calibri、ea 为空。本工具生成的 run 全部显式字体不受影响，但用户在 PowerPoint 里新增/编辑文字会回退 Calibri。修法：新增 `_theme_fonts`，遍历 `prs.slide_masters` 的 theme 部件，把 fontScheme 下 latin/ea/cs typeface 全部改写为 `Microsoft YaHei`（改 `part._blob`）。用户自带母版不动（尊重公司母版）。
2. **内置库两处 Consolas**：`library.json` 中 `api-item` 的 `path`、`code` 的 `code` 槽位用 `font-family:Consolas` —— 按"全部微软雅黑"要求改为 `Microsoft YaHei`。
3. 保留项（说明不改）：preview/demo 页 body 栈已雅黑在前；demo 页 UI 中展示 JSON/ID 的 `Consolas,monospace` 属于文档界面等宽字体，不进 PPTX，保留；deck schema 允许 run/listItem 级 `fontFamily` 覆盖（显式用户选择，保留）；提取 PPTX 保留源文件实际字体名。
4. `assets/demo/library-demo.html` 为生成产物，改完后用 `demo` 命令重新生成。

## 三、skill 目录文件数 ≤100

现状 1029 个文件，其中 `temp/` 988 个（80MB 调试产物：check-*.cjs、test decks、输出目录、err/out 文件、截图）、`__pycache__` 7 个。真实 skill 文件仅 34 个。

措施：
1. 删除 skill 内 `temp/` 全部调试产物与 `__pycache__`（均属可再生成本地垃圾，不入库）→ 收敛至 34 个文件。
2. 在 `SKILL.md` 写入维护约束：本目录文件总数 ≤100；调试脚本、临时 deck、生成输出一律放仓库 `temp/` 或用户 `--out` 目录，不进 skill 目录；新增内容优先合并进现有文件。

## 四、验证

- `validate`/`render` 跑 `examples/technical-report.json` 等示例，确认 report.json 的 layout 字段正常、无异常误报/漏报突变；
- 解包生成的 pptx 抽查 `a:latin/a:ea` typeface 均为 `Microsoft YaHei`，theme1.xml 字体槽为微软雅黑；
- 统计 skill 目录文件数 ≤100。
