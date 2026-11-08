---
name: intranet-ppt
description: 面向内网技术汇报、技术方案评审和需求评审，用一份 JSON、原生 PPTX 母版及本地 HTML 元素库生成可编辑 PPTX。支持第三方元素库和从现有 PPTX 提取组件；全程离线，不适用于任意网页或复杂动画转换。
---

# 内网 PPT

模型只选组件、填写 JSON、调用固定命令。框架输出可编辑 `presentation.pptx` 和离线 `preview.html`。下文 `SKILL_DIR` 指本文件所在目录；所有命令可从任意工作目录执行。

## 生成

1. 先查看输入：`python SKILL_DIR/scripts/ppt_tool.py catalog`。使用第三方库时追加 `--library 本地/library.json`。只使用目录中列出的组件 ID 和输入名。
2. 写一份配置 JSON。优先参考 `examples/technical-proposal.json`：11 页完整技术方案，覆盖封面、议程、章节页、架构图、流程图、表格、指标、对比、时间线和结束页。短例可参考 `technical-report.json`、`solution-review.json`、`requirements-review.json`。默认内置母版和基础库，无需选择多套方案。
3. 执行：

   ```text
   python SKILL_DIR/scripts/ppt_tool.py validate deck.json
   python SKILL_DIR/scripts/ppt_tool.py render deck.json --out output/deck
   ```

4. 根据错误中的页面、元素和字段修正 JSON。超长内容由模型精简或拆页；框架不会按内容自动缩小文字。交付 PPTX；HTML 仅预览内容，原生公司母版的最终外观以 PPTX 为准。条件允许时在本地 PowerPoint/LibreOffice 复核换行、遮挡和图片比例。

最小配置：

```json
{
  "schemaVersion": 1,
  "title": "技术方案评审",
  "pageCount": 1,
  "pages": [{
    "id": "overview",
    "masterSlide": 1,
    "elements": [{
      "id": "heading",
      "component": "builtin/title",
      "box": {"x": 64, "y": 40, "w": 1152, "h": 72},
      "inputs": {"text": [{"text": "方案", "bold": true}, {"text": "概述", "bold": false}]}
    }]
  }]
}
```

每页可放多个元素。`box` 为页面像素坐标，默认页面 1280×720。`pageCount` 可省略；填写时必须等于 `pages` 数量。文字可以是字符串或 runs 数组，每段支持 `text`、`bold`、`italic`、`fontFamily`、`fontSize`、`color`、`underline`，例如 `[{"text":"重点","bold":true},{"text":"说明","fontFamily":"宋体","italic":true}]`。颜色用 `#RRGGBB`，字号用像素。

配置顶层可加 `"theme":"主题id"` 整体换色，可选 `crimson`（默认，深红）、`blue`（政务蓝）、`emerald`（墨绿）、`mono`（黑白灰）、`graphite`（深色暗底）。只有组件规范色板内的色值参与换色，其余颜色原样保留。

## 元素库预览

直接双击打开 `SKILL_DIR/assets/demo/library-demo.html`，可离线浏览元素库：

- 「整页示例」按 deck 分页签，把组件放进 1280×720 完整页面展示（封面、议程、架构、流程、表格、指标、对比、计划等），点击可放大并左右翻页。
- 「组件库」按库分组，显示中文名、`库ID/组件ID`、原始尺寸、inputs 签名、缩放预览和示例输入 JSON，可一键复制可直接粘贴的元素 JSON。
- 左侧搜索框按名称/ID/描述过滤，5 套主题色板可即时给整页示例和组件预览换色。

该文件为预生成产物，库或示例变更后可用命令重新生成（第三方库用 `--library` 一并纳入）：

```text
python SKILL_DIR/scripts/ppt_tool.py demo --out output/library-demo
python SKILL_DIR/scripts/ppt_tool.py demo --out output/library-demo --library 本地/library.json
```

内置组件（`builtin/` 前缀）：`title` `eyebrow` `lead` `section-title` `text` `bullets` `checklist` `steps` `caption` `footnote` `divider` `cover` `section-break` `agenda-item` `thanks` `card` `feature-card` `panel` `metric` `stat-card` `person-card` `icon-badge` `table` `compare` `matrix2x2` `field` `api-item` `tag` `status` `quote` `callout` `callout-warn` `callout-danger` `conclusion` `flow-step` `flow-arrow` `layer` `arch-node` `arch-zone` `timeline-item` `timeline-h-item` `phase` `image` `image-frame` `code`。各组件的输入名、类型和必填性一律以 `catalog` 输出为准。

## 公司母版和外部库

配置顶层添加 `"master":"master.pptx"`；每页 `masterSlide` 选择该 PPTX 的第几张页面，从 1 开始，可重复及重排。建议母版页面只保留背景、徽标、页脚等固定元素，正文由 HTML 组件控制；框架会保留指定源页上的所有静态内容。

第三方库在顶层添加 `"libraries":["library/library.json"]`，然后用 `库ID/组件ID` 选择组件。库只能提供声明式受限 HTML/CSS，不加载 JS 插件。需要创建或扩展库时再读 [元素库格式](references/library-format.md)；字段不清楚时查 [配置 JSON Schema](references/deck.schema.json)。

配置中的母版、库和图片路径均相对于配置文件所在目录，必须在该目录内；可先把公司素材复制到项目目录。组件 HTML 文件和静态图片相对于库清单目录。禁止网络、UNC、远程图片、路径穿越及符号链接逃逸。

## 从现有 PPTX 提取

```text
python SKILL_DIR/scripts/ppt_tool.py extract reference.pptx --out extracted
python SKILL_DIR/scripts/ppt_tool.py render extracted/deck.json --out output/rebuilt
```

提取生成清空已提取正文的 `master.pptx`、含内联 HTML 的 `library/library.json`、本地图片、`deck.json` 和 `extraction-report.json`。先阅读提取报告，确认哪些对象留在母版中，避免重复叠加。支持范围及限制见 [提取和安全边界](references/extraction-security.md)。

## 本地环境

依赖 Python 3.10+、python-pptx、Pillow、lxml，版本范围见 `scripts/requirements.txt`。未安装时由内网环境准备 wheel，执行 `python -m pip install --no-index --find-links 本地wheel目录 -r SKILL_DIR/scripts/requirements.txt`。不自动联网安装，不上传模板或内容，不使用云端转换、外部字体、遥测。

需要可直接修改的初始目录：`python SKILL_DIR/scripts/ppt_tool.py starter --out my-deck`。输出四个场景示例（含 11 页完整技术方案）和默认母版。默认不覆盖已有非空目录；只有本工具生成并带标记的目录可用 `--overwrite` 替换，勿将其他文件放入待覆盖目录。
