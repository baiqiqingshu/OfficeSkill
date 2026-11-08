# intranet-ppt IPD IR/SR/AR 需求串讲实施方案

## 目标

按华为 IPD 的 IR → SR → AR 层级组织需求串讲：

1. 一份 PPT 包含多个 SR，每个 SR 包含多个 AR。
2. 前面先放 SR 列表页与 AR 列表页，建立全局索引。
3. 每个 SR 先出 SR 标题页，随后按该 SR 的每个 AR 展开六类场景页：背景、主成功场景、异常场景、后置状态、前置条件、分支场景。
4. 每个 AR 内容页的页面标题统一使用 AR 名称，页眉用 `SR-01 · AR-01 · 场景类型` 标注层级与场景类型。

代码是唯一事实，本方案以当前 `scripts/intranet_ppt`、`assets/libraries/builtin` 的实际实现为准。

## 一、结构设计

### 页面骨架（31 页示例）

| 页 | 内容 | 组件 |
| --- | --- | --- |
| 1 | 封面：IR 需求串讲 | `cover` `footnote` |
| 2 | IR 概述：背景、目标、范围、成功标准 | `title` `lead` `outline` `callout` |
| 3 | SR 列表：SR 编号、名称、AR 数、优先级、负责人 | `title` `lead` `table` `layer`×3 `footnote` |
| 4 | AR 列表：SR、AR、AR 名称、优先级、场景页数 | `title` `lead` `table` `callout` `footnote` |
| 5 | SR-01 标题页 | `eyebrow` `section-break` `agenda-item`×2 |
| 6–11 | AR-01 六页 | `ar-header` + 场景组件 |
| 12–17 | AR-02 六页 | `ar-header` + 场景组件 |
| 18 | SR-02 标题页 | `eyebrow` `section-break` `agenda-item`×2 |
| 19–24 | AR-03 六页 | `ar-header` + 场景组件 |
| 25–30 | AR-04 六页 | `ar-header` + 场景组件 |
| 31 | 串讲回顾 | `title` `conclusion` `thanks` |

示例内容采用「统一身份与访问管理（IAM）」：

- IR-2026-0187 统一身份与访问管理
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

新增 `builtin/ar-header`，每个 AR 内容页只放这一个页头组件：

- `crumb`：`SR-01 · AR-01 · 背景`，12px 主色小字，带字距。
- `title`：AR 名称，32px 粗体，作为页面标题。
- `meta`：场景序号或优先级，如 `场景 1/6`、`P0`，右对齐弱化文字。

这样六个页面的标题始终是同一个 AR 名称，场景类型由页眉区分，满足「AR 的内容内每个页面建议标题为 AR 标题」。

## 二、新增组件（48 → 49）

### `builtin/ar-header` AR 页头

- 尺寸：1152×100。
- 输入：`crumb`（text，必填）、`title`（richtext，必填）、`meta`（text，可选）。
- 结构：
  - `crumb` 左上 760×24，12px 粗体 `ACCENT`，`letter-spacing:1px`。
  - `meta` 右上 392×24，12px `FAINT`，右对齐。
  - `title` 左侧 1152×48，32px 粗体 `INK`，`line-height:1.2`。
  - 底部 48×4 主色短条，圆角 2px。
- 只用规范色板：`#1476B8`、`#8496A8`、`#17324D`、`#1476B9`。

## 三、示例生成

新增 `examples/ipd-walkthrough.json`：

- 2 个 SR × 2 个 AR × 6 页 = 24 个 AR 场景页，加封面、IR 概述、SR/AR 列表、2 个 SR 标题页、回顾页，共 31 页。
- 表格沿用紧凑行高；每页内容控制在一屏内。
- 不新增图片素材，AR 六页以文字、流程、表格和面板为主；需要界面/流程图时可在具体 AR 中追加 `ui-frame` / `figure` 页。

## 四、交付与同步

- `assets/libraries/builtin/library.json` 增加 `ar-header`；`samples.json` 增加示例。
- `SKILL.md`：组件清单加 `ar-header`；生成建议补充 IPD IR/SR/AR 结构；示例列表加入 `ipd-walkthrough.json`。
- `references/library-format.md`：组件清单加 `ar-header`。
- `docs/`：新增本文；同步 `intranet-ppt-implementation.md`、`intranet-ppt-library-v2.md` 的组件数与示例数。
- 重新生成 `assets/demo/library-demo.html`。
- 验收：`catalog` 49 个组件；6 份示例 `validate`/`render` 全部通过；IPD 示例 31 页；每页标题为 AR 名称；SR/AR 列表页位于详细页之前；PPTX 表格仍为紧凑行高。

## 五、实施结果（2026-11-08）

已完成：

- 组件 48 → 49：新增 `ar-header`，同步 `samples.json`、`SKILL.md`、`references/library-format.md`。
- 新增 `examples/ipd-walkthrough.json`（31 页，theme `blue`），共 157 个元素：
  - 第 1 页封面；第 2 页 IR 概述；第 3 页 SR 列表；第 4 页 AR 列表。
  - 第 5 页 SR-01 标题页，第 6–11 页 AR-01 六页，第 12–17 页 AR-02 六页。
  - 第 18 页 SR-02 标题页，第 19–24 页 AR-03 六页，第 25–30 页 AR-04 六页。
  - 第 31 页串讲回顾。
- 每个 AR 内容页使用 `ar-header`：`crumb` = `SR-xx · AR-yy · 场景类型`，`title` = AR 名称，`meta` = `场景 n/6`；页面不再另放 title/eyebrow。
- SR 列表页在表格下方增加 IR/SR/AR 三层 `layer` 条，AR 列表页增加「串讲顺序」callout，避免列表页下方大面积留白。
- `assets/demo/library-demo.html` 重新生成：49 组件、6 份示例、63 页、无跳过页。

验收：

- `catalog`：49 个组件，零错误。
- 6 份 `examples/*.json` 的 `validate` 全部通过；IPD 示例 render 为 31 页。
- 页面顺序检查：SR 列表（第 3 页）、AR 列表（第 4 页）先于所有 SR 标题页；每个 SR 后紧跟其 2 个 AR 的六页；六页顺序为背景 → 主成功 → 异常 → 后置 → 前置 → 分支。
- 标题检查：24 个 AR 内容页的 `ar-header.title` 均等于所属 AR 名称，`crumb` 覆盖 SR/AR/场景类型。
- HTML 预览与 PPTX 抽查：列表页层级条、AR 页头、紧凑表格、流程步骤、面板与 checklist 均正常，无溢出或遮挡。
