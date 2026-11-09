> 历史记录：当前技能已迁移为 `native-ppt`，现行用法与验证结论以 [Native PPT 实施文档](native-ppt-implementation.md) 和 [新 SKILL](../.agents/skills/native-ppt/SKILL.md) 为准；旧 CLI 入口继续兼容。

# intranet-ppt 布局检查支持调小字号（含最小字号约束）

> 状态：实施前文档（2026-11-08）
> 范围：`.agents/skills/intranet-ppt` 的布局检查与渲染流程
> 代码是唯一事实：本文档基于 `scripts/intranet_ppt/components.py`、`cli.py` 现状（行号以编写时为准，实现时以实际代码为准）

## 目标

1. 布局检查发现文本/表格溢出时，给出**具体可调小到的字号**建议（如"调小至 15px"），不再只给泛化文案。
2. 规定**最小字号**（默认 12px，可用配置覆盖），避免建议/自动缩放把字调得过小。
3. 提供渲染时**自动调小字号**的开关：`autoFitFonts: true` 时，render 自动把溢出的文本/表格字号缩小到可容纳（不小于最小字号）；仍无法容纳的保留并在布局报告中如实上报。

## 现状（探索结论）

- 布局检查 `audit_layout(pages, page_size)`（components.py L1007）：逐元素检测 `outOfPage` / `textOverflow` / `tableOverflow` / `overlap` 四类问题。
- 文本高度测量：`_text_required_height(node)`（L848）用 wrap 模型估算，字号取 `node.style["fontSize"]`（缺失回退 24px），run 级 `fontSize` 参与测量。
- 表格高度：`_table_render_height(node)`（L868）= `sum(node["rowHeights"])`；`rowHeights` 由 `_table_row_heights`（L665）按单元格换行估算，单元格字号默认 24（实际取组件 style 声明值）。
- 建议文本来自常量 `_LAYOUT_SUGGESTIONS`（L928），issue 由 `_layout_issue`（L1002）生成：`{page, pageIndex, kind, elements, detail, suggestions}`。`detail` 仅有格式化字符串（含溢出像素），**没有**结构化溢出数据。
- `validate`（cli.py L271）输出 `layoutIssueCount`；`render`（cli.py L186）在 writer 内先 `audit_layout`，再写 `preview.html`（`render_preview`，components.py L1325）与 `report.json`。preview 自动拼接 `suggestions`，新增建议文本无需改 preview。
- 配置顶层键白名单在 cli.py `prepare()` 的 `_keys(config, [...])`（L84），新增键必须加入。
- 现有静态缩放：`_scale_style`/emit 按 box 与组件原始尺寸比例缩放 fontSize（不是按溢出动态缩放）。**无** fit/shrink/minFontSize 逻辑。

## 设计

### 常量与配置

- 新增常量 `MIN_FONT_PX = 12`（components.py）。
- 顶层配置新增两个键（cli.py `_keys` 白名单 + 校验）：
  - `autoFitFonts`: bool，默认 false。true 时 render 阶段自动缩字号。
  - `minFontSize`: int，默认 12，允许范围 8–24（过低会不可读）。供建议计算与自动缩放使用。

### 1. 建议给出具体字号（audit，常开）

`audit_layout(pages, page_size, min_font=MIN_FONT_PX)`：

- `textOverflow` 分支：取当前字号 `F = node.style.get("fontSize", 24)`、所需高度 `N = _text_required_height(node)`、box 高 `H = node["h"]`。
  - `suggested = floor(F * H / N)`。
  - 若 `suggested >= min_font`：在 suggestions 首位插入 `"可将字号调小至 {suggested}px（最小 {min_font}px）即可容纳"`。
  - 否则：插入 `"最小字号 {min_font}px 仍无法容纳，需精简文案或拆页"`。
  - 保留原有 suggestions。
- `tableOverflow` 分支：同样公式，字号取表格单元格字号（优先 `node.style.get("fontSize")`，否则 24）。
  - `"可将表格字号调小至 {suggested}px（最小 {min_font}px）"` 或 `"最小字号 {min_font}px 仍无法容纳，需精简单元格文案或拆表"`。

detail 保持不变（避免破坏既有消费方）；issue 结构不变。

### 2. 渲染自动缩字号（opt-in）

新增 `fit_fonts(pages, min_font=MIN_FONT_PX)`（components.py）：

- 遍历 `pages[].nodes`：
  - `type == "text"`：`required = _text_required_height(node)`，若 `required > node["h"]`：
    `factor = node["h"] / required`；对 `node["style"]["fontSize"]` 与每个 run 的 `fontSize`（缺失则跳过）执行 `new = max(min_font, round(F * factor))`，仅当 `new < F` 时应用；若 `new == F` 不写。
  - `type == "table"`：`required = _table_render_height(node)`，溢出时按同样 factor 缩放单元格 runs 的 `fontSize`（及 `headerStyle` 若含 fontSize），clamp 到 `[min_font, 240]`。
  - 其他类型（rect/line/image）不动。
- 不溢出的 node 不动；已低于最小字号的 run 不再缩小。

`render`（cli.py writer 内）：

1. `layout0 = audit_layout(pages, pageSize, min_font)`
2. 若 `config.get("autoFitFonts")`：`fit_fonts(prepared["pages"], min_font)`，然后 `layout = audit_layout(pages, pageSize, min_font)`（二次审计，剩余问题如实上报）
3. preview / report.json 使用二次审计的 `layout`。

`validate`：不应用 fit；审计传 `min_font`，suggestions 已含具体字号建议；若 `autoFitFonts` 开启，可给 overflow 类建议追加提示 `"已开启 autoFitFonts，渲染时将自动调小字号（最小 {min_font}px）"`（可选，保持简单可不加）。

### 3. 文档同步

- `SKILL.md`：更新"框架不会按内容自动缩小文字"表述，补充 `autoFitFonts` / `minFontSize` 配置说明与最小字号约束。
- `references/deck.schema.json`：补充两个顶层属性。
- `docs/intranet-ppt-layout-check.md`：同步说明（若内容过时可合并清理）。

## 改动点清单

| 文件 | 改动 |
|---|---|
| `scripts/intranet_ppt/components.py` | 新增 `MIN_FONT_PX` 常量、`fit_fonts()`；`audit_layout` 增加 `min_font` 参数并在 text/table 溢出分支插入具体字号建议 |
| `scripts/intranet_ppt/cli.py` | `_keys` 白名单加 `autoFitFonts`/`minFontSize` 及校验；`validate`/`render` 传 `min_font`；render 在 autoFitFonts 开启时调用 `fit_fonts` 并二次审计 |
| `SKILL.md` | 配置说明更新 |
| `references/deck.schema.json` | 顶层属性补充 |
| `docs/intranet-ppt-layout-check.md` | 说明同步 |

## 验证方式（手动 smoke，不写测试代码）

1. 构造一个表格/文本溢出 deck（例如单元格文案超长），`validate`：确认 `layoutIssueCount` 不变、suggestions 中出现"可调小至 Xpx（最小 12px）"。
2. 同 deck 加 `autoFitFonts: true` 渲染：`report.json` 的 `layout.issueCount` 应下降（溢出被自动缩小消除）；`presentation.pptx` 可打开且文字未消失。
3. 极限用例：文案极长使 `suggested < 12`：建议应提示"最小字号 12px 仍无法容纳"；autoFit 渲染后该问题仍在报告中。
4. 回归：现有示例（examples/*.json）validate 全部通过，渲染无报错。

## 约束

- 不改 preview.html 生成逻辑（suggestions 自动显示）。
- 不改 PPTX 渲染后端（字号来自同一 node.style，自动缩小自动生效）。
- 不动 `_LAYOUT_SUGGESTIONS` 的既有文案顺序语义（新建议插到首位，保留原建议）。