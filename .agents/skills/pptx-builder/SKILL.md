---
name: pptx-builder
description: 用 JSON、原生 PPTX 母版和本地元素库生成可编辑 PowerPoint，适合技术汇报、方案评审、需求评审及 IPD SR/AR 串讲。支持母版安全区域、原生分点、布局检查和现有 PPTX 组件提取；全程离线，不用于任意网页或复杂动画转换。
---

# PPTX Builder

选择组件、填写 JSON，生成原生可编辑 `presentation.pptx` 和离线内容预览 `preview.html`。`SKILL_DIR` 指本文件所在的 `.agents/skills/pptx-builder` 目录；命令可从任意工作目录执行。

## 生成与布局检查

1. 查看输入：`python SKILL_DIR/scripts/ppt_tool.py catalog`。第三方库追加 `--library 本地/library.json`；组件 ID 和输入名以目录为准。
2. 编写配置。完整方案参考 `examples/technical-proposal.json`；现代卡片、价值指标、决策、里程碑和结论编排参考 `examples/modern-elements.json`（5 页）。其他示例包括技术进展、方案评审、需求评审、场景走查及 IPD SR/AR 串讲。
3. 校验并生成：

   ```text
   python SKILL_DIR/scripts/ppt_tool.py validate deck.json
   python SKILL_DIR/scripts/ppt_tool.py render deck.json --out output/deck --strict-layout
   ```

**任何 PPTX 输出都必须执行布局检查。** `render`、`starter`、`extract` 均检查已保存 PPTX 中原生对象的几何边界和重叠，生成报告；`render` 另检查编译内容的文字/表格高度估算及母版保留区。检查方法和复杂对象限制写入报告，不能代替 Office 实际换行渲染。先读取报告，修正问题后重新生成；存在问题的产物不能称为“布局通过”或作为最终完成稿交付。`--strict-layout` 在存在问题时返回非零状态，并保留诊断产物；原型排查可暂不加该参数，检查仍会执行。

`render` 的 `report.json.layout` 包含 `checked`、`status`、`issueCount`、`issues`、`masterRegions`；HTML 顶部显示通过状态或问题数量。报告提供具体页面、元素、偏移或拆页建议。超长文字优先精简或拆页；顶层 `"autoFitFonts":true` 可按需缩小文字/表格字号，`"minFontSize":12` 设置下限（允许 8–24），缩小后仍需检查。HTML 不显示原生公司母版的全部固定对象，最终外观以 PPTX 为准；本地有 PowerPoint/LibreOffice 时复核换行、遮挡和图片比例。

最小配置：

```json
{
  "schemaVersion": 1,
  "title": "技术方案评审",
  "masterRegions": {"detect": true, "titleHeight": 96, "footerHeight": 32},
  "pages": [{
    "id": "overview",
    "elements": [{
      "id": "heading",
      "component": "builtin/title",
      "region": "title",
      "box": {"x": 64, "y": 24, "w": 1152, "h": 52},
      "inputs": {"text": "方案概述"}
    }, {
      "id": "summary",
      "component": "builtin/bullets",
      "region": "body",
      "box": {"x": 64, "y": 130, "w": 1152, "h": 200},
      "inputs": {"items": ["统一接入能力", {"level": 2, "text": "先验证核心链路"}]}
    }]
  }]
}
```

`box` 使用页面像素坐标，默认 1280×720；每页可放多个元素。可选 `pageCount` 必须等于 `pages` 数量。完整字段见 [配置 JSON Schema](references/deck.schema.json)。

## 文字、强调与原生分点

默认字体为微软雅黑（`Microsoft YaHei`），**普通文字默认黑色 `#000000`**。标题、关键词、状态可显式使用其他颜色或粗体；不要把整段正文当作强调。示例：

```json
[{"text":"关键结论：","bold":true,"color":"#A02C25"},{"text":"建议分批实施。"}]
```

文字接收字符串或 runs 数组，run 支持 `text`、`bold`、`italic`、`underline`、`fontFamily`、`fontSize`、`color`；字号用像素，颜色用 `#RRGGBB`。省略样式时继承组件。表格单元格同样支持 runs；表格行高按实际内容估算，`box.h` 是上限，不会为了铺满框而拉伸短表。

`list` 输入接受字符串、runs 或 `{"level":2,"text":"…"}` 对象，`level` 为 1–4；`text` 可为 runs，对象可附带 run 样式。列表输出 **PowerPoint 原生段落项目符号/自动编号及悬挂缩进**，标记不拼进正文，编辑时可继续增删条目。`ul`/普通列表使用项目符号，`ol`/`num` 使用自动编号，`check`、`dash` 使用对应符号；HTML 预览与布局估算沿用相同列表语义。场景描述优先使用 `outline`。

可选主题：`crimson`（默认深红）、`blue`、`emerald`、`mono`、`graphite`。浅色主题的普通文字保持黑色；显式选择 `graphite` 时使用浅色对比文字，反白文字及强调色保留各自用途。

## 母版与标题、页脚区域

配置顶层 `"master":"master.pptx"` 指定公司母版；每页 `masterSlide` 选择源 PPTX 的第几张页面，从 1 开始，可重复或重排。源页静态对象会保留，建议只留下背景、徽标、标题和页脚等固定内容。

先读取母版实际区域：

```text
python SKILL_DIR/scripts/ppt_tool.py inspect-master master.pptx
```

结果包含 `pageSize`、`slides[].masterRegions` 和识别来源。工具识别源页、版式及母版的标题/页脚占位符：源样例页上实际存在的占位符即使空白也保留区域；版式或母版中尚未实例化的空占位符仅列为候选，不自动保留高度。没有可靠读取结果时用 `masterRegions` 显式指定。

顶层和逐页均支持 `masterRegions`，逐页覆盖顶层。`titleHeight` 为自顶向下的标题区域高度，`footerHeight` 为自底向上的页脚高度，单位均为像素；`detect:true` 启用读取，显式高度覆盖对应读取值。正文应位于标题区域以下、页脚区域以上。

元素 `region` 可为 `body`、`title`、`footer`、`full`。正文使用 `body`；标题、页脚分别声明对应区域；`full` 仅用于确实需要跨区域的封面或背景装饰。内置标题/封面可自动识别，第三方组件建议显式声明。区域声明不会免除页面越界或文字溢出检查。

## 元素库与预览

双击 `SKILL_DIR/assets/demo/library-demo.html` 离线查看整页示例和组件。目录可搜索名称/ID/描述、切换主题、放大翻页，并复制示例元素 JSON。

内置库提供 59 个组件。除标题、正文、清单、表格、架构节点、流程、时间线和图框等基础元素外，本次新增：

| 组件 | 用途 |
| --- | --- |
| `builtin/insight-card` | 编号洞察与三栏观点 |
| `builtin/value-card` | 大指标与价值说明 |
| `builtin/decision-card` | 方案建议与决策取舍 |
| `builtin/milestone-strip` | 阶段计划与里程碑 |
| `builtin/risk-card` | 风险描述与应对 |
| `builtin/action-card` | 负责人及行动清单 |
| `builtin/summary-band` | 页面摘要与重点导读 |
| `builtin/comparison-row` | 现状与目标对比 |
| `builtin/capability-tile` | 三栏能力地图 |
| `builtin/takeaway-panel` | 评审结论与下一步 |

第三方库在顶层配置 `"libraries":["library/library.json"]`，通过 `库ID/组件ID` 引用。库只提供声明式受限 HTML/CSS，不加载 JS 插件。创建或扩展组件时读 [元素库格式](references/library-format.md)。

更新库或示例后重新生成预览：

```text
python SKILL_DIR/scripts/ppt_tool.py demo --out output/library-demo
python SKILL_DIR/scripts/ppt_tool.py demo --out output/library-demo --library 本地/library.json
```

IPD SR/AR 串讲参考 `examples/ipd-walkthrough.json`（29 页）：封面、SR/AR 需求列表（类型/编号/标题/工作量四列），每个 SR 先放标题页，再为各 AR 组织背景、主成功场景、异常场景、后置状态、前置条件和分支场景。`ar-header` 的 `crumb` 填 SR/AR/场景类型，`title` 填同一 AR 的统一名称，`meta` 填场景序号。

## 提取与初始目录

```text
python SKILL_DIR/scripts/ppt_tool.py extract reference.pptx --out extracted --strict-layout
python SKILL_DIR/scripts/ppt_tool.py render extracted/deck.json --out output/rebuilt --strict-layout
python SKILL_DIR/scripts/ppt_tool.py starter --out my-deck --strict-layout
```

提取输出 `master.pptx`、本地元素库/图片、`deck.json` 和提取报告。先确认报告中哪些对象仍留在母版，避免重复叠加。复杂原生列表等不能安全提取的对象保留在母版并报告，不静默丢失语义。范围见 [提取和安全边界](references/extraction-security.md)。

`starter` 复制全部场景示例和默认母版。默认不覆盖非空目录；只有本工具生成并带 `.pptx-builder-output` 标记的目录才可 `--overwrite`。

## 本地环境与维护

依赖 Python 3.10+、python-pptx、Pillow、lxml，版本范围见 `scripts/requirements.txt`。缺依赖时使用内网 wheel：`python -m pip install --no-index --find-links 本地wheel目录 -r SKILL_DIR/scripts/requirements.txt`。不自动联网安装，不上传模板或内容，不使用云转换、外部字体或遥测。

配置中的母版、库和图片路径相对于配置目录，必须位于其中；HTML 文件及静态图片相对于库目录。禁止网络、UNC、远程图片、路径穿越及符号链接逃逸。

维护时本目录文件总数保持 ≤100；临时配置与输出放仓库 `temp/` 或用户指定目录。修改库、示例、文字或样式后更新预生成演示，并对生成的 PPTX 检查布局。
