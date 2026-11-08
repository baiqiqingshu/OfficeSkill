# intranet-ppt 标题压缩、布局检查与 IPD 示例去 IR 实施方案

## 目标

1. 示例标题位置上移、标题占高减少，把更多页面空间留给正文。
2. 输出 HTML 时检查内容重叠、超出页面、文本溢出和表格溢出，并给出可执行的解决思路。
3. IPD 需求串讲示例不再体现 IR：删除 IR 页和 IR 相关内容，只保留 SR / AR。

代码是唯一事实，本方案以当前 `scripts/intranet_ppt`、`assets/libraries/builtin` 的实际实现为准。

## 一、标题压缩

### `builtin/title`

- 原生尺寸：1152×64 → 1152×52。
- 标题文字：top 0，高 50 → 42，34px / line-height 1.2。
- 主色短条：top 56 → 44，48×4。
- 示例中的标题 box：`y: 40 → 24`，`h: 64 → 52`。

### `builtin/ar-header`

- 原生尺寸：1152×100 → 1152×86。
- 面包屑 / 右侧序号：高 24 → 22。
- AR 标题：top 30 → 24，高 48 → 40，32px / line-height 1.2。
- 主色短条：top 86 → 68，48×4。
- IPD 示例中的 `ar-header` box：`y: 32 → 20`，`h: 100 → 86`。

### 示例内容随之上移

- 含 `builtin/title` 的页面：标题设为 `y=24,h=52`；除标题和 footnote 外，`y >= 100` 的元素整体上移 28px。
- 含 `builtin/ar-header` 的 AR 页：页头设为 `y=20,h=86`；除页头和 footnote 外，`y >= 100` 的元素整体上移 26px。
- footnote 保持 `y=664`，SR 章节页、封面、结束页按原有结构处理。
- 这样正文起点从 124/150 提前到 96/124，约多出 26–28px 内容高度。

## 二、HTML 布局检查

### 检查对象

在 `prepare` 阶段保留每个元素的编译节点，并在 `compile_element` 的场景节点上写入 `elementId` 供审计分组。`audit_layout(pages, page_size)` 按元素聚合节点，计算每个元素的“可见边界”：

- 文本：按 runs 的字号、换行和行高估算所需高度；垂直居中/底部对齐按锚点方向偏移（溢出时同样生效，与 PPT 锚点溢出方向一致）；letterSpacing 计入字宽；混合字号 runs 按视觉段落各自的最大字号计行高；可用宽 ≤0 时退化为每字符一行；宽度 ≤ 可用宽不再被 3% 余量误进位。
- 表格：仅当 `rowHeights` 前 len(rows) 项全部有效时按行高之和（与渲染端收缩高度口径一致），否则按 `box.h`；行高估算的列宽折算到字号度量单位，非等比拉伸下不失真。
- 图片：按 `min(w/iw, h/ih)` 等比缩放、居中后的 letterbox 实际区域（读不到图时回退整 box）。
- 矩形、线条：按节点 `w/h`。

### 四类问题

1. **超出页面**：元素可见边界越出 1280×720（含 middle/bottom 锚点向上溢出）。
2. **元素重叠**：两个元素的可见边界有面积 > 4px² 的交集；仅当**先出现的元素**全包含后出现的元素时豁免（容器在底层承载子元素）；box 完全相同、后者完全覆盖前者照常报出并注明 z 序。
3. **文本溢出**：文本节点估算所需高度超过节点高度 2px 以上。
4. **表格溢出**：表格渲染行高之和超过表格节点高度 2px 以上。

### 解决思路

- 重叠：上下/左右偏移 8–16px；缩小或调整 box；重新布局页面；把其中一个元素拆到下一页。
- 超出页面：上移/左移元素或缩小 box；精简文案、降低字号/行距；拆分到下一页。
- 文本溢出：精简文案或拆成多级要点；降低字号/行距或增大 box 高；拆到下一页。
- 表格溢出：把表格拆成多页；加宽表格或减少列数；精简单元格/降低字号；调整表格 box 或页面布局。

### 输出位置

- `report.json` 增加 `layout`：`issueCount`、`issues`（每项含 `page`、`kind`、`elements`、`detail`、`suggestions`）。
- `preview.html`：
  - 顶部工具栏显示“布局检查：N 项”或“布局检查通过”。
  - 预览页顶部显示默认展开的可折叠检查面板，按页列出问题与建议。
  - 控制台输出同样的 warning。
- `validate` 输出 `layoutIssueCount` 与 `layoutIssues` 明细，不渲染也能定位问题。

### 误报控制

- 表格用实际渲染行高，不用 `box.h`，避免紧凑表格与下方 callout 的假重叠。
- 文本用估算文字高度与 letterbox 图片区域，不用整个声明框，避免假重叠。
- 先出现的容器全包含后出现的子元素时不报重叠（如 `arch-zone` 与 `arch-node`）；反过来后画的大元素盖住先画的小元素会报“后者完全覆盖前者”。
- 文本/表格溢出容差 2px，避免 1px 行高误差。
- 行高口径三端统一：PPTX 写绝对行距 `a:spcPts`（`最大 run 字号 × 0.75pt × line-height`，未设 line-height 统一 1.2），与 preview 的 CSS em 语义、审计估算同源，不再出现 PPTX 自然行高（雅黑 ≈1.3em）比估算高 10–30% 的系统性漏报。

## 三、IPD 示例去 IR

- 删除 `ir-overview` 页（原第 2 页），示例从 31 页变为 30 页。
- 封面标题改为「统一身份与访问管理 / SR / AR 需求串讲」，副标题和 footnote 去掉 IR 编号。
- SR 列表页 lead 去掉「IR 拆分为」；删除 IR 层级条，只保留 SR / AR 两层。
- AR 列表页 footnote 去掉 IR 编号。
- 示例 JSON 中不再出现 `IR` 字样（不区分大小写检查）。
- `SKILL.md` 的推荐结构改为「封面 + SR 清单 + AR 清单 + 每个 SR 标题页 + 每个 AR 六页」，skill 描述改为 IPD SR/AR 需求串讲。
- 同步 `docs/intranet-ppt-ipd-walkthrough.md`、`docs/intranet-ppt-implementation.md`、`docs/intranet-ppt-library-v2.md`、`docs/intranet-ppt-scenario-walkthrough.md` 的页数/示例描述。

## 四、交付与验收

- 重新生成 `assets/demo/library-demo.html`：49 组件、6 份示例、62 页、无跳过页。
- 验收：
  - `catalog` 49 个组件；6 份示例 `validate`/`render` 全部通过。
  - IPD 示例 30 页，无 `IR` 字样；SR/AR 列表页先于 SR 标题页；每个 AR 六页且标题为 AR 名称。
  - 标题 box 为 `y=24,h=52`（title）或 `y=20,h=86`（ar-header）。
  - `audit_layout` 对当前 6 份示例的已知真实问题给出报告；预览页显示检查结果；无问题时显示“布局检查通过”。
  - 用一份故意重叠/超页/超长表格的临时 deck 验证四类问题都能被识别，且建议文本可读。

## 五、实施结果（2026-11-08）

已完成：

- `builtin/title`：1152×64 → 1152×52，标题文字高 50 → 42，主色条 top 56 → 44。
- `builtin/ar-header`：1152×100 → 1152×86，标题 top 30 → 24、高 48 → 40，主色条 top 86 → 68。
- 6 份示例的 31 个 `title` 统一改为 `y=24,h=52`，24 个 `ar-header` 统一改为 `y=20,h=86`；含标题/页头的页面正文整体上移 28/26px，footnote 保持 `y=664`。
- `components.audit_layout` 已接入 `prepare` / `render` / `validate` / `render_preview`；场景节点带 `elementId`，`report.json` 输出 `layout`，`preview.html` 顶部显示布局徽标并可展开问题与建议，控制台同步 warning。
- 阈值：页面边缘 0.5px、文本/表格溢出 2px、重叠面积 4px²、包含关系 1px；表格用实际行高、文本用估算高度，容器全包含子元素不报重叠。
- 当前 6 份示例 `layoutIssueCount` 均为 0；临时测试 deck 分别命中：
  - 两个面板重叠 → `overlap`，提示偏移 8–16px、调整 box、重排或拆页；
  - 8 行表格 box 仅 80px → `tableOverflow`，提示拆页、加宽/减列、精简或降字号；
  - 10 条要点 box 仅 140px → `textOverflow`，提示精简、降字号/行高或拆页；
  - 文本尾部超出页面 → `outOfPage` + `textOverflow`，提示上移/缩小或拆页。
- `preview.html` 正常 deck 显示“布局检查通过”，问题 deck 显示“布局检查 N 项”并展开建议面板；无控制台错误、无外部请求。
- IPD 示例删除 IR 页与 IR 文字后为 30 页；`demo` 重新生成后为 49 组件、6 份示例、62 页、无跳过页。
