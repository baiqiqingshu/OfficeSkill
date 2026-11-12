> 历史记录：当前技能统一为 `pptx-builder`，现行用法与验证结论以 [PPTX Builder 实施文档](pptx-builder-implementation.md) 和 [SKILL](../.agents/skills/pptx-builder/SKILL.md) 为准；旧技能及 CLI 入口已移除。

# intranet-ppt IPD SR/AR 需求串讲实施方案

## 目标

按华为 IPD 的 SR → AR 层级组织需求串讲：

1. 一份 PPT 包含多个 SR，每个 SR 包含多个 AR。
2. 前面先放合并的 SR/AR 需求列表页，建立全局索引。
3. 每个 SR 先出 SR 标题页，随后按该 SR 的每个 AR 展开六类场景页：背景、主成功场景、异常场景、后置状态、前置条件、分支场景。
4. 每个 AR 内容页的页面标题统一使用 AR 名称，页眉用 `SR-01 · AR-01 · 场景类型` 标注层级与场景类型。
5. 示例不再展开 IR：删除 IR 概览页和 IR 相关文字，只保留 SR / AR。

代码是唯一事实，本方案以当前 `scripts/intranet_ppt`、`assets/libraries/builtin` 的实际实现为准。

## 一、结构设计

### 页面骨架（29 页示例）

| 页 | 内容 | 组件 |
| --- | --- | --- |
| 1 | 封面：SR / AR 需求串讲 | `cover` `footnote` |
| 2 | 需求列表：类型、编号、标题、工作量（仅 SR/AR 两级） | `title` `lead` `table` `footnote` |
| 3 | SR-01 标题页 | `eyebrow` `section-break` `footnote` |
| 4–9 | AR-01 六页 | `ar-header` + 场景组件 |
| 10–15 | AR-02 六页 | `ar-header` + 场景组件 |
| 16 | SR-02 标题页 | `eyebrow` `section-break` `footnote` |
| 17–22 | AR-03 六页 | `ar-header` + 场景组件 |
| 23–28 | AR-04 六页 | `ar-header` + 场景组件 |
| 29 | 串讲回顾 | `title` `conclusion` `thanks` |

示例内容采用「统一身份与访问管理」：

- SR-01 统一认证与单点登录
  - AR-01 员工登录与全局会话
  - AR-02 多因素认证与风险登录
- SR-02 账号治理与审计
  - AR-03 账号全生命周期管理
  - AR-04 登录审计与合规报表

### 每个 AR 的六页顺序

严格按需求顺序：背景 → 主成功场景 → 异常场景 → 后置状态 → 前置条件 → 分支场景。

- 背景：`lead` + `outline`（多级要点）
- 主成功场景：`flow-step`×4 + `flow-arrow`×3 + `outline`
- 异常场景：`table` + `callout-warn`
- 后置状态：`panel`×2 + `checklist`
- 前置条件：`table` + `callout`
- 分支场景：`table` + `callout`

### 页面标题约定

`builtin/ar-header`，每个 AR 内容页只放这一个页头组件：

- `crumb`：`SR-01 · AR-01 · 背景`，12px 主色小字，带字距。
- `title`：AR 名称，32px 粗体，作为页面标题。
- `meta`：场景序号或优先级，如 `场景 1/6`、`P0`，右对齐弱化文字。

这样六个页面的标题始终是同一个 AR 名称，场景类型由页眉区分，满足「AR 的内容内每个页面建议标题为 AR 标题」。

## 二、新增组件（48 → 49）

### `builtin/ar-header` AR 页头

- 尺寸：1152×86（标题压缩后的版本）。
- 输入：`crumb`（text，必填）、`title`（richtext，必填）、`meta`（text，可选）。
- 结构：
  - `crumb` 左上 760×22，12px 粗体 `ACCENT`，`letter-spacing:1px`。
  - `meta` 右上 392×22，12px `FAINT`，右对齐。
  - `title` 左侧 1152×40，32px 粗体 `INK`，`line-height:1.2`。
  - 底部 48×4 主色短条，圆角 2px。
- 只用规范色板：`#1476B8`、`#8496A8`、`#17324D`、`#1476B9`。

## 三、示例生成

新增 `examples/ipd-walkthrough.json`：

- 2 个 SR × 2 个 AR × 6 页 = 24 个 AR 场景页，加封面、需求列表、2 个 SR 标题页、回顾页，共 29 页。
- 标题/页头按压缩后的布局：`title` 为 `y=24,h=52`，`ar-header` 为 `y=20,h=86`；正文起点随之上移到 96/124。
- 表格沿用紧凑行高；每页内容控制在一屏内。
- 不新增图片素材，AR 六页以文字、流程、表格和面板为主；需要界面/流程图时可在具体 AR 中追加 `ui-frame` / `figure` 页。

## 四、交付与同步

- `assets/libraries/builtin/library.json` 增加 `ar-header`；`samples.json` 增加示例。
- `SKILL.md`：组件清单加 `ar-header`；生成建议补充 IPD SR/AR 结构；示例列表加入 `ipd-walkthrough.json`。
- `references/library-format.md`：组件清单加 `ar-header`。
- `docs/`：新增本文；同步 `intranet-ppt-implementation.md`、`intranet-ppt-library-v2.md` 的组件数与示例数。
- 重新生成 `assets/demo/library-demo.html`。
- 验收：`catalog` 49 个组件；6 份示例 `validate`/`render` 全部通过；IPD 示例 29 页且无 IR 字样；每页标题为 AR 名称；需求列表页位于详细页之前；PPTX 表格仍为紧凑行高。

## 五、实施结果（2026-11-08）

已完成：

- 组件 48 → 49：新增 `ar-header`（1152×86），同步 `samples.json`、`SKILL.md`、`references/library-format.md`。
- 新增 `examples/ipd-walkthrough.json`（29 页，theme `blue`），共 140 个元素：
  - 第 1 页封面；第 2 页需求列表。
  - 第 3 页 SR-01 标题页，第 4–9 页 AR-01 六页，第 10–15 页 AR-02 六页。
  - 第 16 页 SR-02 标题页，第 17–22 页 AR-03 六页，第 23–28 页 AR-04 六页。
  - 第 29 页串讲回顾。
- 每个 AR 内容页使用 `ar-header`：`crumb` = `SR-xx · AR-yy · 场景类型`，`title` = AR 名称，`meta` = `场景 n/6`；页面不再另放 title/eyebrow。
- 需求列表合并为一页四列表（类型/编号/标题/工作量），不再保留 layer 条与串讲顺序 callout；SR 标题页不再逐条列 agenda-item，section-break desc 标注下辖 AR 编号范围，以适配单 SR 下约十个 AR 的场景。
- 封面、SR 列表 lead/footnote、AR 列表 footnote、结束页 footnote 均删除 IR 编号与 IR 表述；整个示例 JSON 不再出现 `IR` 字样。
- `assets/demo/library-demo.html` 重新生成：49 组件、6 份示例、62 页、无跳过页。

验收：

- `catalog`：49 个组件，零错误。
- 6 份 `examples/*.json` 的 `validate` 全部通过；IPD 示例 render 为 29 页，`layoutIssueCount` 为 0。
- 页面顺序检查：需求列表（第 2 页）先于所有 SR 标题页；每个 SR 后紧跟其 2 个 AR 的六页；六页顺序为背景 → 主成功 → 异常 → 后置 → 前置 → 分支。
- 标题检查：24 个 AR 内容页的 `ar-header.title` 均等于所属 AR 名称，`crumb` 覆盖 SR/AR/场景类型；AR 页无额外 title/eyebrow。
- HTML 预览与 PPTX 抽查：列表页层级条、AR 页头、紧凑表格、流程步骤、面板与 checklist 均正常，无溢出或遮挡。
