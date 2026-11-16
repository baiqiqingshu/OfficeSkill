# 内置组件库美化记录（科研答辩风）

日期：2026-11-17
范围：`.agents/skills/pptx-builder/assets/libraries/builtin/library.json` 全部 66 个组件

## 一、目标与约束

把内置组件库统一升级为「科研答辩风」：编号方块、深色表头条/结论条、通栏细线分层、
正文黑字强调走主色，默认主题仍为 `crimson`。约束：

- 不改组件 ID、`size`、输入槽名/类型/必填性，不破坏 `examples/*.json`；
- 只用 `references/library-format.md` 允许的 HTML/CSS 子集（无渐变、阴影、flex、伪类）；
- 组件内颜色只用 `themes.py` `CANONICAL` 规范色板中的 hex，保证主题换色完整生效；
- 保持 `DEFAULT_THEME = "crimson"`，保留原有 6 套主题。

## 二、改动统计

- 组件总数：**66**；本轮改动：**39**，未动：27。
- 脚本化改写 + 人工复核：用 `temp/beautify_library.py` 批量重写 HTML，断言 ID/size/inputs/name 不变后写回。

### 改动的 39 个组件（按职能分组）

| 分组 | 组件 | 处理手法 |
| --- | --- | --- |
| 标题层级 | `title`, `eyebrow`, `section-title`, `lead`, `caption`, `divider` | 主标题下通栏细线 + 4px 主色短线压线；`lead` 改为浅底陈述条 + 左侧主色脊线；节标题编号入色 |
| 封面/章节 | `cover`, `section-break`, `agenda-item` | 封面双色方块标 + 底部深色信息带 + 右侧装饰图形；章节页整版深色 + 超大白色编号 + 装饰竖条组；议程编号入浅底方块 |
| 卡片/面板 | `card`, `feature-card`, `panel`, `icon-badge` | `panel` 加深色表头条；`feature-card` 编号方块；`card` 顶部主色压条；`icon-badge` 白字主色底 |
| 对比/矩阵 | `compare`, `matrix2x2` | `compare` 加中央 VS 圆形徽章 + 列内压条；`matrix2x2` 象限标题入色带 |
| 字段/接口 | `field`, `api-item`, `tag` | 字段标签左侧主色刻度；`api-item` 方法名入徽章块；`tag` 浅底描边 |
| 结论/提示 | `conclusion` | 深色结论条 + 白色「结论」小方章 + 竖分割 |
| 流程/架构 | `flow-step`, `flow-arrow`, `arch-node`, `arch-zone` | 序号实心方块；`arch-node` 左侧主色脊线；`arch-zone` 加通栏线 |
| 时间线 | `timeline-item`, `timeline-h-item`, `phase` | 日期主色、节点圆点、期次头部色带 |
| 媒体/代码 | `code`, `ui-frame` | `code` 由深底改为浅底面板（**修复了非规范色**），三色窗点保留终端意象；`ui-frame` 标题栏加深色带 |
| 现代组件 | `ar-header`, `insight-card`, `value-card`, `decision-card`, `milestone-strip`, `action-card`, `summary-band`, `comparison-row`, `capability-tile`, `takeaway-panel`, `stairs` | `insight-card` 深色编号块 + 主色短刻度；`takeaway-panel` 右侧整块深色「下一步」区；`comparison-row` 中央箭头圆章；`decision-card`/`milestone-strip`/`summary-band` 状态章与结论条化；`stairs` 阶梯编号块加深 |

### 未动的 27 个组件

`text`, `bullets`, `checklist`, `steps`, `footnote`, `thanks`, `metric`, `stat-card`,
`person-card`, `table`, `status`, `quote`, `callout`, `callout-warn`, `callout-danger`,
`layer`, `image`, `image-frame`, `outline`, `figure`, `risk-card`, `swot`, `pros-cons`,
`status-row`, `scorecard`, `funnel`, `kpi-band`

原因：这些组件原视觉已符合规范（纯文字、原生表格、原生列表、既有色带结构），
或其装饰性已足够；强行加框反而破坏排版密度。

## 三、主题

保留原 6 套 + 新增 2 套，共 **8** 套：

| id | 名称 | 说明 |
| --- | --- | --- |
| `crimson` | 深红（默认） | 内网汇报默认，红色按「强调色」克制使用 |
| `blue` | 政务蓝 | 通用政企蓝 |
| `emerald` | 墨绿 | 绿色调 |
| `navy` | 藏青 | **新增**，科研答辩首选：藏青墨色 + 深蓝主色 |
| `violet` | 紫金 | **新增**：紫主色 + 浅金点缀（ACCENT_L=#C9A75E） |
| `mono` | 黑白灰 | 打印/传真友好 |
| `majestic` | 藏青金 | 藏青 + 金，颁奖/总结场合 |
| `graphite` | 石墨黑 | 深色底，组件经规范色板自动反色 |

## 四、答辩风取舍（adopted / rejected）

### 采用

1. **编号方块 + 通栏细线**：`agenda-item`、`feature-card`、`insight-card`、`flow-step`、`stairs` 等统一「实心块内白字编号」，标题下 1px 细线 + 3–4px 主色短线压线，形成「章节感」。
2. **深色条带承载结论**：`conclusion`、`summary-band`、`takeaway-panel` 右区、`panel` 表头、`section-break` 整版——深色（`ACCENT_FILL_D`）上白字，替代过去浅色提示框，结论一眼可辨。
3. **分层底面**：`SURFACE`(白)→`BG_SOFT`→`SOFT_A` 三级底 + `BORDER_L` 1px 细边，`compare`/`matrix2x2`/`takeaway-panel` 内部再加分栏线，密度高但不乱。
4. **小圆徽章做关系符**：`compare` 的 VS、`comparison-row` 的 →，白底描边圆，避免裸符号漂浮。
5. **陈述式 lead**：`lead` 由居中大字改为左脊浅底条，配合 samples 中「结论先行：…」写法。

### 拒绝

1. **渐变/阴影/大圆角**：`library-format.md` 不允许，且答辩场景下渐变投影显廉价。
2. **整句红字强调**：改为「编号块/结论条」承担强调，正文保持黑字——红色只在 `DANGER`/`WARN` 语义中出现。
3. **深色终端风 `code` 块**：原实现用了非规范色 `#212B36/#3A4A5C/#D9E4EF`，石墨主题下无法反色。改为浅底面板 + `DANGER/WARN/OK` 三色窗点，石墨主题经规范色板自动反色为深底。
4. **大幅留白封面**：答辩首页信息要密（题名/单位/汇报人/编号），`cover` 改为上密下实的版式而非居中大海报。
5. **stock 图/插画装饰**：不用图片占位，装饰仅由规范色矩形/圆点构成，主题可整体换色。

## 五、验证结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 目录 | `ppt_tool.py catalog` | 66 组件容量正常（如 `title` 33字/行、`panel.text` 28×6、`takeaway-panel.items` 34×4） |
| 规范色 | 自写脚本扫描 library.json 全部 hex ∈ CANONICAL | **NONE 违规**（修复 `code` 3 个非规范色后） |
| 结构不变量 | 改写脚本断言 ID/size/inputs/name 不变 | OK |
| validate | 7 个 examples 全部 `validate` | 全部 `valid`，`strictLayoutFailed=false` |
| 严格渲染 | `render technical-proposal.json --strict-layout` | 11 页，`layoutStatus=passed`，**0 issue** |
| 严格渲染 | `render modern-elements.json --strict-layout` | 6 页，`layoutStatus=passed`，**0 issue** |
| 严格渲染 | `render ipd-walkthrough.json --strict-layout` | 29 页，passed，0 issue |
| 严格渲染 | `render scenario-walkthrough.json --strict-layout` | 12 页，passed，0 issue |
| 画廊 | `ppt_tool.py demo --out assets/demo` | 66 组件 / 8 主题 / 7 decks / 67 页，0 skipped |

产物：
- 画廊 `.agents/skills/pptx-builder/assets/demo/library-demo.html`（约 1.78 MB，离线自包含）；
- 渲染验证 `temp/final-tp/`、`temp/final-me/`（及此前 `temp/new-*`）含 `presentation.pptx` + `report.json`。

## 六、其他改动

- `themes.py`：新增 `navy`、`violet` 两套色板；`DEFAULT_THEME` 保持 `crimson`。
- `demo.py`：页面 chrome（侧栏导航高亮、主题按钮选中态）跟随所选主题主色，画廊与组件观感一致；文案注明答辩风设计。
- `samples.json`：全面刷新为「统一认证平台技术方案评审 REQ-2026-018」场景文案（结论先行、数字化指标、评审语境）。
- `library-format.md`、`SKILL.md`：主题数 6→8，补 `navy`/`violet` 说明。
- `components.py`、`pptx_backend.py`：**未改动**。

## 七、遗留问题

- 无 layout issue；无校验报错。
- 画廊为静态预览，复杂组件（如 `stairs` 阶梯）在极端窄缩放下未做逐档回归，建议实际排版时遵循 catalog 给出的 `approxChars` 上限。
- `graphite` 深色主题下个别浅底面板的反差靠规范色板自动反色实现，已抽查 `conclusion`/`panel`/`code` 反色链路正常。
