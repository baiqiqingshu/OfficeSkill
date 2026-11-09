> 历史记录：当前技能统一为 `pptx-builder`，现行用法与验证结论以 [PPTX Builder 实施文档](pptx-builder-implementation.md) 和 [SKILL](../.agents/skills/pptx-builder/SKILL.md) 为准；旧技能及 CLI 入口已移除。

# intranet-ppt 场景串讲与紧凑表格实施方案

## 目标

1. 新增「场景串讲」整页示例，覆盖背景、前置条件、主成功场景、分支场景、异常场景、后置状态，以及界面示意图、流程图、UML 图、表格、多级分点、说明文本。
2. 补充可复用的元素模板：多级要点、界面示意图框、图示框（流程图/UML/架构图通用）。
3. 表格行高改为按内容紧凑排布，不再把 `box.h` 平均分配给所有行；HTML 预览与 PPTX 保持一致。

代码是唯一事实，本方案以当前 `scripts/intranet_ppt`、`assets/libraries/builtin` 的实际实现为准。

## 一、新增组件（builtin 45 → 48）

### `builtin/outline` 多级要点

- 尺寸：1152×260；19px 正文、1.75 行距、`MUTED` 色。
- 输入：`items`（list，必填）。
- 条目格式：
  - 字符串或 runs 数组：一级要点；
  - `{"level": 2, "text": "…"}`：指定层级，`level` 取 1–4；
  - `{"level": 2, "text": "…", "bold": true, "color": "#…"}`：层级 + run 样式。
- 标记与缩进：一级 `•`、二级 `◦`、三级 `▪`、四级 `–`；每深一级增加 2 个全角空格（U+3000），保证 PPTX 纯文本也能看出层级。
- `bullets` 复用同一套条目解析，因此也支持层级，但默认仍是一级列表。

### `builtin/ui-frame` 界面示意图

- 尺寸：640×440。
- 输入：`title`（text，可选）、`src`（image，必填）、`caption`（text，可选）。
- 结构：40px 窗口标题条（三个圆点 + 标题）+ 图片区 + 36px 图注条；白底圆角、细边框，图片等比居中。

### `builtin/figure` 图示框

- 尺寸：704×480。
- 输入：`label`（text，可选，如「流程图」「UML 时序图」）、`title`（text，可选）、`src`（image，必填）、`caption`（text，可选）。
- 结构：76px 顶部区（12px 主色小标签 + 18px 粗体标题）+ 图片区 + 36px 图注条；用于流程图、UML、架构图等示意图。

## 二、表格紧凑行高

### 现状

`compile_element` 只输出表格总框；PPTX 用 `add_table` 后所有行等高，HTML 用固定 `height:100%`，浏览器把多余高度平均分给各行，短内容也占满整块，行距显得松散。

### 方案

1. 编译期为表格计算 `rowHeights`：
   - 列宽 = 表格宽 / 列数，减去左右内边距与边框；
   - 按字符宽度估算（CJK 1.0 em、ASCII 约 0.55 em、空格 0.3 em）和显式换行估算每个单元格行数；
   - 行高 = 最大行数 × 字号 × 行高倍数 + 上下内边距 + 边框，取整；
   - 表头行使用 `headerStyle` 的字号、行距、内边距单独计算。
2. HTML 预览：表格高度改为 `auto`，`<tr>` 写入计算出的最小高度；单元格补 `vertical-align`，内容超出估算时浏览器自然增高。
3. PPTX：逐行写入 `table.rows[i].height`，并把 GraphicFrame 高度设为各行高度之和；PowerPoint 内容超出时仍会自动增高。
4. 内置表格默认样式收紧：正文内边距 `6px 12px`、表头 `8px 12px`、行距 1.35、单元格垂直居中。

## 三、场景串讲示例

新增 `examples/scenario-walkthrough.json`，12 页，主题「统一认证平台 · 单点登录场景串讲」：

| 页 | 内容 | 组件 |
| --- | --- | --- |
| 1 | 封面 | `cover` `footnote` |
| 2 | 串讲结构 | `title` `lead` `agenda-item`×6 |
| 3 | 背景 | `title` `lead` `outline` `callout` |
| 4 | 前置条件 | `title` `table` `footnote` |
| 5 | 主成功场景 | `title` `flow-step`×4 `flow-arrow`×3 `outline` |
| 6 | 分支场景 | `title` `table` `callout` |
| 7 | 异常场景 | `title` `table` `callout-warn` |
| 8 | 后置状态 | `title` `panel`×2 `checklist` |
| 9 | 界面示意图 | `title` `ui-frame` `panel` `callout` |
| 10 | 流程图 | `title` `figure` `panel` |
| 11 | UML 时序图 | `title` `figure` `panel` |
| 12 | 回顾与结束 | `title` `conclusion` `thanks` |

配套本地图片放在 `examples/images/`：`login-ui.png`、`scenario-flow.png`、`sequence-uml.png`，均由脚本本地绘制，无外部素材。

## 四、交付与同步

- `SKILL.md`：组件清单补充 3 个组件，说明 `outline` 层级写法与表格紧凑行为，示例列表加入场景串讲。
- `references/library-format.md`：补充 list 条目的 `level` 约定。
- `assets/demo/library-demo.html` 重新生成，纳入新示例与组件。
- 更新 `docs/intranet-ppt-implementation.md`、`docs/intranet-ppt-library-v2.md` 的组件数与能力说明。
- 验收：`catalog`、全部 `examples/*.json` 的 `validate`/`render`、PPTX 表格行高检查、`demo` 无跳过页。

## 五、实施结果（2026-11-08）

已完成：

- 组件 45 → 48：`outline`、`ui-frame`、`figure`，并同步 `samples.json`、`SKILL.md`、`references/library-format.md`。
- `list` 输入支持 1–4 级条目；`outline` 使用 19px / 1.75 行距，二级起自动缩进两个全角空格。
- `references/deck.schema.json` 增加 `listItem` 定义，覆盖多级 list 条目。
- 表格紧凑行高在 HTML 与 PPTX 双端生效；紧凑化后额外修复了表格整框背景矩形造成的底部空白边框带，填充与边框改由单元格承载。
- 新增 12 页 `examples/scenario-walkthrough.json` 与三张本地示意图，`theme` 设为 `blue` 以匹配图片配色。
- `assets/demo/library-demo.html` 重新生成：48 组件、5 份示例、32 页，无跳过页。

与方案的差异：

- 第 9–11 页右栏使用 `panel` 而非 `outline`/`text`。原因是 `outline` 原生宽 1152、`text` 原生宽 1152，放进 416–480px 的窄栏后字号按 `min(sx,sy)` 缩到约 7–8px；`panel` 原生 552，窄栏下仍有 13–15px。多级要点与说明文本已在第 3、5 页完整展示，场景覆盖不受影响。
- 表格列宽仍为等宽；分支/异常表中的长句已适度精简，避免单字换行。

验收：

- `catalog`：48 个组件，零错误。
- 5 份 `examples/*.json` 的 `validate` 全部通过；`scenario-walkthrough` render 为 12 页。
- PPTX 表格：前置条件 6 行合计 3.23in（原等分 3.75in）、分支 3.48in、异常 3.73in，GraphicFrame 高度等于行高之和。
- HTML 预览逐页截图检查：多级缩进、界面框、图示框、紧凑表格均正常，无整框空白带、无内容溢出。

补充修复（验收阶段）：

- 表格行高估算把单元格 runs 自带的 `fontSize` 计入，避免大字号单元格被按表级字号低估而溢出。
- `starter` 现在同时复制 `examples/images/`，生成的场景串讲配置可直接 `validate`/`render`。

## IPD 扩展后的规模（2026-11-08）

- 组件 48 → 49，新增 `ar-header`；示例 5 → 6，新增 30 页 `examples/ipd-walkthrough.json`。
- `assets/demo/library-demo.html` 重新生成后为 49 组件、6 份示例、62 页、无跳过页；本文此前记录的 48/5/32 为 IPD 扩展前的规模。
