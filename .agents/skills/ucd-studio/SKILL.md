---
name: ucd-studio
description: 创建和修改公司内网工具网站的离线 HTML 界面原型。适用于审批列表、工作台、表单、详情和看板；支持按需读取本地项目。无需联网、安装依赖或前端构建，不用于 UML 或生产后端。
---

# UCD Studio

离线内网工具 HTML 原型生成器与轻量 UCD 框架（Python 3.10+ 标准库，零依赖，纯离线）。

## 极速生成（默认一步完成，无需先检索）

直接用 `quick` 一步生成或更新（支持内联 `--json`、点路径 `--set`、安全覆盖已有输出目录）：

```text
python <skill>/scripts/ucd.py quick --out output/approval --layout admin --style ocean --title "申请管理" --json '{"blocks":{"records":{"title":"待我审批"}}}'
```

- 无定制需求时直接省略 `--json`，即可生成完整可交互原型。
- 支持 `--shell sidebar`（默认左侧栏）或 `--shell topnav`（顶部导航栏，适合仪表盘/表单/详情页）。
- 已知局部修改直接用 `patch --set` 或 `patch --json`，无需写临时文件：

```text
python <skill>/scripts/ucd.py patch --dir output/approval --set title="设备台账" --set style=jade --set shell=topnav
```

- 需要手写自由 HTML 页面时，导出轻量 CSS/JS 框架（含滑出详情抽屉、增强下拉框、KPI 卡片、响应式栅格）：

```text
python <skill>/scripts/ucd.py kit --out output/custom --style ocean
```

## 单页速查表（无需再翻其他文档）

- **布局 `--layout`**：`admin`（筛选列表，默认）、`dashboard`（总览指标+待办）、`workbench`（三栏工作台）、`form`（填报表单）、`detail`（详情+时间线+页签）、`kanban`（任务看板）
- **主题 `--style`**：`ocean`（霁蓝，默认）、`nordic`（极简白）、`indigo`（深靛研发）、`slate`（岩灰）、`jade`（青绿）、`plum`（紫藤）、`warm`（暖纸）、`rose`（玫瑰）、`midnight`（暗色监控）、`contrast`（高对比）
- **外壳与密度**：`--shell sidebar|topnav`、`--density compact|comfortable`、`--mode single|library|editable`
- **顶层可选字段**：`title`、`product`、`description`、`action`（主按钮）、`actions`（次按钮数组）、`user`（`{name,role}`）、`workspace`、`tokens`（覆盖颜色/radius）、`blocks`
- **16 种 `blocks`（可写对象 `{id:{...}}` 或数组 `[{id?,type,...}]`）**：
  - `stats`：`items:[{label,value,change?,hint?}]`
  - `table`：`columns:[str], rows:[[str|{text,tone}]], statusColumn?, pageSize?, rowAction?`（默认点击行/详情打开右侧抽屉）
  - `form`：`fields:[{label,type?:text|email|date|number|select|textarea,options?,required?,placeholder?,help?}], submit?`
  - `detail`：`items:[{label,value:str|{text,tone}}]`
  - `cards`：`items:[{title,description?,action?}]`
  - `activity`：`items:[{title,time?,description?}]`
  - `kanban`：`columns:[{title,items:[{title,owner?,tag?}]}]`
  - `tabs`：`items:[{label,content}]`
  - `bar-chart`：`items:[{label,value:0..100}]`
  - `line-chart`：`labels:[str], values:[num], summary?, change?`
  - `steps`：`items:[str], current?:0`
  - `progress`：`items:[{label,value:0..100}]`
  - `accordion`：`items:[{title,content}]`
  - `alert`：`text` / `empty`：`text, heading?, action?` / `image`：`src:assets/x.png, alt, caption?`
- **状态色 `tone`**：`primary` / `neutral` / `success` / `warning` / `danger`

运行 `python <skill>/scripts/ucd.py presets` 可输出以上 JSON 速查表；仅当模板不满足或依据本地源码生成时，按需阅读 `references/` 下对应文档（`page-spec.md`、`source-workflow.md`、`design-guidelines.md`、`output-modes.md`）。

## 约束

始终离线：禁止外网请求、CDN、远程字体/图片与外链跳转。交互均为本地演示（含弹窗、抽屉审批、表格筛选排序分页、表单校验）。输出已内置 CSP 与静态审计。
