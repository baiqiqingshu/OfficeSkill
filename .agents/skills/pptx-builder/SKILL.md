---
name: pptx-builder
description: 用 JSON、原生 PPTX 母版和本地元素库生成可编辑 PowerPoint，适合技术汇报、方案评审、需求评审及 IPD SR/AR 串讲。支持母版安全区域、原生分点、布局检查和现有 PPTX 组件提取；全程离线，不用于任意网页或复杂动画转换。
---

# PPTX Builder

选择组件、填写 JSON，生成原生可编辑 `presentation.pptx` 和离线内容预览 `preview.html`。`SKILL_DIR` 指本文件所在的 `.agents/skills/pptx-builder` 目录；命令可从任意工作目录执行。

## 极速生成（免算像素坐标，一步出稿）

普通任务直接用 `quick`（内置容错规范化 + 省略 `box` 自动分栏排版 + 轻度字号自适应 + 布局检查）：

```text
python SKILL_DIR/scripts/ppt_tool.py quick --out output/deck --theme navy --title "方案评审" --json '{"pages":[{"elements":[{"component":"cover-dark","inputs":{"tag":"技术评审","title":"统一接入平台方案","subtitle":"收敛入口、毫秒校验、灰度可控","meta":"平台架构组 · 2026-04"}},{"component":"header-bar","inputs":{"title":"核心洞察","badge":"现状分析","meta":"01 / 02"}},{"component":"insight-card","inputs":{"number":"01","title":"统一入口","text":"47 套系统收口到统一网关，新系统 2 天接入。"}},{"component":"insight-card","inputs":{"number":"02","title":"统一审计","text":"策略集中下发，消除跨系统审计盲区。"}},{"component":"insight-card","inputs":{"number":"03","title":"灰度回退","text":"保留旧通道回退开关，确保零停机切换。"}},{"component":"summary-band","inputs":{"eyebrow":"结论","title":"统一底座支撑全业务协同","text":"分三批灰度推进。"}}]}]}' --strict-layout
```

- **省略 `box` 自动排版**：`quick` 会自动将 `header-bar`/`cover-dark` 放到保留区，将连续的同宽窄卡片（如 2 张 `552` 或 3 张 `360`）自动横向分栏，其余正文区块自上而下排布。也可显式指定页面 `"layout": "2cols"|"3cols"|"stack"` 或元素 `"slot": "title"|"left"|"right"|"col1"|"col2"|"col3"|"top"|"bottom"|"footer"|"full"`。
- **使用已有模板**：省略 `pages` 时直接基于 `--template technical-report|modern-elements|requirements-review|solution-review` 覆盖标题/主题或局部补丁。
- **局部修改**：用 `patch` 增量更新已生成的 `deck.json` 并重新渲染，不必重写整份 JSON：

```text
python SKILL_DIR/scripts/ppt_tool.py patch output/deck/deck.json --set theme=blue --set pages.1.elements.0.inputs.title="新页标题" --render-out output/deck --strict-layout
```

- **查看组件目录（按需精简查询，勿直接倾倒全量）**：`python SKILL_DIR/scripts/ppt_tool.py catalog --compact --filter 指标`；需要看全量槽位容量才加 `--id 组件ID`（去掉 `--compact`）。使用 `studio` 库时配置写 `"libraries":["studio"]` 即可自动解析。

## 高频组件速查表（无需先查 catalog）

| 角色 | 组件 ID（可省 `builtin/`） | 必填输入 `inputs`（及默认尺寸） |
| --- | --- | --- |
| 深色封面 | `cover-dark` | `title*`, `tag?`, `subtitle?`, `meta?`（1280×720，自动 full） |
| 浅色封面 / 章节 | `cover` / `section-break` | `title*`, `tag?`/`number?`, `subtitle?`/`desc?`, `meta?` |
| 现代页头 / 标题 | `header-bar` / `title` | `title*`, `badge?`, `meta?` / `text*`（自动 title 区） |
| 三栏洞察 / 结论带 | `insight-card` / `summary-band` | `number*`,`title*`,`text*`(360×240) / `eyebrow*`,`title*`,`text*`(1152×150) |
| 指标速览 / 条形对比 | `kpi-band` / `value-card` / `bar-metric` | `label1..4*`,`value1..4*` / `label*`,`value*`,`note*` / `title*`,`label1..4*`,`val1..4*` |
| 三栏支柱 / 四步流程 | `pillars` / `process-4step` | `col1..3*`,`items1..3*`,`sub1..3?` / `step1..4*`,`desc1..4*` |
| 四阶段路线图 | `roadmap-4col` | `date1..4*`,`title1..4*`,`desc1..4*`（1152×250） |
| 对比取舍 / 表格 | `pros-cons` / `comparison-row` / `table` | `titleL*`,`itemsL*`,`titleR*`,`itemsR*` / `label*`,`before*`,`after*` / `rows*` |
| 风险 / 行动 / 结论 | `risk-card` / `action-card` / `takeaway-panel` | `level*`,`title*`,`text*`,`action*` / `owner*`,`title*`,`items*` / `title*`,`items*`,`next*` |
| 金句 / 状态 / 评分 | `highlight-quote` / `status-row` / `scorecard` | `text*`,`source?` / `num?`,`name*`,`status*`,`note?` / `name*`,`rating*`,`note?` |
| 常规正文 / 列表 | `text` / `bullets` / `checklist` / `outline` | `text*` / `items*`（支持多级 `{"level":2,"text":"…"}`） |

## 校验、自定义布局与失败修正

手写完整坐标 JSON 时仍使用 `validate` 与 `render`：

```text
python SKILL_DIR/scripts/ppt_tool.py validate deck.json
python SKILL_DIR/scripts/ppt_tool.py render deck.json --out output/deck --strict-layout
```

**任何 PPTX 输出都必须执行布局检查。** `report.json.layout` 包含 `checked`、`status`、`issueCount`、`issues`、`masterRegions`；`--strict-layout` 在存在问题时返回非零状态。

| 报告/报错现象 | 原因 | 修正 |
| --- | --- | --- |
| `textOverflow` / `tableOverflow` | 内容超出槽位容量 | 精简文字；拆页；启用 `"autoFitFonts":true` |
| `overlap` | 元素 `box` 相交 | 改用自动排版（删去 `box`）或拉开 `y` 间距（8 的倍数） |
| `outOfPage` / `reservedRegion` | 超出 1280×720 或侵入标题/页脚区 | 改用自动排版，或下移 `y` 避开 `masterRegions` |
| `smallFont` | 有效字号低于 `minFontSize`（默认 12，允许 8–24） | 放大 `box`、提高 `fontSize` 或拆页 |
| `unknown component` | 组件 ID 拼写或未加载 `studio` | 使用速查表 ID 或检查 `"libraries":["studio"]` |
| 中文字符显示方框 | run 指定了系统没有的字体 | 删除 `fontFamily` 或改回 `Microsoft YaHei` |

## 文字、强调与原生分点

默认字体 `Microsoft YaHei`，**普通文字默认黑色 `#000000`**。文字与表格单元格支持 runs 数组：`[{"text":"关键结论：","bold":true,"color":"#A02C25"},{"text":"建议分批实施。"}]`（支持 `text`/`bold`/`italic`/`underline`/`fontFamily`/`fontSize`/`color`）。`list` 接受字符串、runs 或 `{"level":2,"text":"…"}`（1–4 级），输出 PowerPoint 原生项目符号/编号与悬挂缩进。

可选主题：`crimson`（默认深红）、`blue`（政务蓝）、`emerald`（墨绿）、`navy`（藏青，科研答辩风）、`violet`（紫金）、`mono`（黑白灰）、`majestic`（藏青金）、`graphite`（石墨黑深底）。

## 母版、元素库与维护

- 读取公司母版安全区域：`python SKILL_DIR/scripts/ppt_tool.py inspect-master master.pptx`，在顶层或逐页用 `masterRegions`（`titleHeight`/`footerHeight`/`detect`）指定保留区；元素 `region` 支持 `body`/`title`/`footer`/`full`。
- 提取现有 PPTX：`python SKILL_DIR/scripts/ppt_tool.py extract reference.pptx --out extracted --strict-layout`；初始化全套示例：`starter --out my-deck`。
- 双击 `SKILL_DIR/assets/demo/library-demo.html` 离线查看 73 个内置 + 14 个 `studio/` 组件与 7 份整页示例；更新库或示例后用 `demo --out ... --library studio --overwrite` 刷新预览。IPD SR/AR 串讲参考 `examples/ipd-walkthrough.json`。
- 全程离线：依赖 Python 3.10+、python-pptx、Pillow、lxml（内网 wheel 安装见 `scripts/requirements.txt`）；路径须位于配置目录内（`"studio"` 简写除外），禁止外网/UNC/符号链接逃逸；本目录文件总数保持 ≤100。
