# 配置工程协议 v1.1

默认使用 Python 标准库 + 原生 JS，内置“霁蓝瓷面”样式、自定义下拉框、`<dialog>` 确认弹窗与内联 SVG 图标。可直接打开 [完整示例](../demo/project/index.html)，用 `unpack` 恢复源工程。

## 命令速查

```text
python <skill>/scripts/ucd.py project --out output/approval --template crud --title "申请管理" --style ocean
python <skill>/scripts/ucd.py project --out output/app --from-spec spec.json
python <skill>/scripts/ucd.py components [组件名]
python <skill>/scripts/ucd.py add-page --dir output/approval --id users --title "成员管理" --template tree-table --icon users --group "组织权限"
python <skill>/scripts/ucd.py add-component --dir output/approval --name biz-card --deps panel --css
python <skill>/scripts/ucd.py patch --dir output/approval --file pages/requests.json --node requests --set props.pageSize=10 --append props.columns=priority --remove props.filters.status
python <skill>/scripts/ucd.py summary --dir output/approval
python <skill>/scripts/ucd.py build --dir output/approval [--out delivery/approval.html]
python <skill>/scripts/ucd.py unpack --html delivery/approval.html --out output/approval-edit [--force] [--allow-modified]
python <skill>/scripts/ucd.py check --dir output/approval
```

- **Skill 内聚合 vs 工作区单文件**：Skill 内部将 19 个内置组件按类别维护在 `assets/workspace/bundles/{core,data,layout,charts}.js`；`build` 会在工作目录按需拆分为 `components/<name>.js`（一组件一文件），随后把实际用到的源码复制到系统临时目录执行工程自带 `build.py`。
- **外部交付洁净度**：`build --dir <工程>` 默认生成 `<工程>/index.html` 与 `index.manifest.json`（供 `check` 使用）；指定外部 `--out <路径>.html` 时默认只输出单个 HTML（加 `--manifest` 可同时输出清单）。
- **`--from-spec` 单文件起盘**：传入 `{app?, pages: {id: pageObj}, data?: {id: rows}, components?: {name: jsCode | {code, cssCode?, dependencies?}}}`，自动拆盘并首次构建。

## app.json 与页面分组

```json
{
  "version": 1,
  "title": "设备管理",
  "workspace": "资产运营中心",
  "user": "林晓",
  "userRole": "资产管理员",
  "style": "ocean",
  "density": "compact",
  "shell": "sidebar",
  "startPage": "devices",
  "pages": {"devices": "pages/devices.json"},
  "data": {"devices": "data/devices.json"},
  "assets": {"logo": "assets/logo.png"}
}
```

页面 JSON 可选字段：`icon`（内置 SVG 图标名：`dashboard/list/table/form/users/user/settings/check-circle/clock/chart/folder/tree/tag/bell/shield/file/kanban/layers`）、`group`（侧栏分组名）、`badge`（侧栏角标）、`eyebrow`（默认不显示，避免重复占位）。

## 内置 19 个组件

| 分类 | 组件 | 主要 props / slots |
|---|---|---|
| 核心 | `field` | `field:{key,label,type?,options?,required?,default?,placeholder?,help?,readonly?,disabled?,width?,align?,wide?}`；支持 `text/search/email/date/number/select/textarea/checkbox/switch/radio/tags` |
| 核心 | `form` | `fields` 或 `sections:[{title,description?,fields}]`、`columns:1..3`、`panel`、`record`、`submitLabel`、`data/rowKey`；插槽 `before/after` |
| 核心 | `detail` | `fields`、`record`、`panel`、`title`；抽屉中自动读 `ctx.row`；插槽 `before/after` |
| 核心 | `alert` | `title`、`text`、`tone: neutral\|primary\|success\|warning\|danger` |
| 核心 | `image` | `src` 或 `asset`（`app.assets` 键名）、`alt`、`caption` |
| 数据 | `table` | `data`、`fields`、`formFields`、`columns`、`filters`、`pageSize`、`rowKey`、`title`、`description`、`actions`、`rowActions`、`batchActions`；插槽 `before/after/toolbar/form/detail/cell:<key>` |
| 数据 | `stats` | `items:[{label,value?,data?,field?,equals?,hint?,change?,trend?:up\|down,tone?,icon?,action?}]` |
| 数据 | `tree` | `title`、`items:[{id,label,count?,icon?,children?}]`、`searchable`、`allLabel`、`target`（目标表格 ID）、`filterField`、`matchValue: label\|id` |
| 数据 | `kanban` | `title`、`data`、`groupField`、`columns:[str\|{value,label,tone?}]`、`titleField`、`tagField`、`metaFields` |
| 数据 | `empty` | `icon`、`title`、`text`、`action` |
| 布局 | `panel` | `title`、`description`、`columns:1..4`；插槽 `default/actions` |
| 布局 | `split` | `columns`（如 `[7,5]` 或 `["260px","minmax(0,1fr)"]`）；每个命名插槽自动渲染为一栏 |
| 布局 | `tabs` | `items:[{key,label}]`；每个 `key` 对应同名插槽 |
| 布局 | `steps` | `title`、`current`（0 起始）、`panel`、`items:[str\|{title,description?}]` |
| 布局 | `cards` | `title`、`items:[{title,description?,icon?,badge?,tone?,action?,actionLabel?}]` |
| 图表 | `bar-chart` | `title`、`unit`、`items:[{label,value,display?,tone?}]` 或 `data` + `groupBy` 动态聚合 |
| 图表 | `line-chart` | `title`、`summary`、`change`、`trend`、`labels:[str]`、`values:[num]` |
| 图表 | `timeline` | `title`、`panel`、`items:[{title,time?,description?,tone?}]` 或绑定 `data` |
| 图表 | `progress` | `title`、`items:[{label,value:0..100,hint?,tone?}]` |

## 操作协议

| type | 字段与效果 |
|---|---|
| `create` / `edit` | 打开表单抽屉/弹窗，保存后新增或更新本地数据集 |
| `detail` | 打开详情抽屉 |
| `update` / `approve` | `values:{字段:值}` 更新单行或批量行；带 `confirm` 时弹出 `<dialog>` 确认框 |
| `delete` | 弹出 `<dialog>` 确认框后删除单行或批量行 |
| `filter` | `target`（目标表格 ID）、`field`、`value`（或 `values`）、可选 `reset:true`，联动筛选表格 |
| `navigate` | `page`：切换到目标页面 |
| `open` | `target`：打开页面 `views` 中定义的视图，可选 `mode: drawer\|dialog` |
| `toast` | `message`：显示底部气泡提示 |

## 自定义组件与独立 CSS

可用 `add-component --dir <工程> --name my-card --deps panel --css` 一键生成脚手架并注册到 `components.json`：

```json
{"my-card": {"file": "components/my-card.js", "css": "components/my-card.css", "dependencies": ["panel"]}}
```

`ctx` 上下文除 `state/data/setData/slot/child/action/open/close/navigate/notify/asset/escape/refresh` 外，还提供：
- `ctx.icon(name, cls?)`：渲染内置内联 SVG 图标。
- `ctx.confirm(message, {title?, confirmLabel?, danger?})`：Promise 异步确认弹窗。
- `ctx.setFilter(targetId, patch, reset?)` / `ctx.getFilter(targetId)`：跨组件联动筛选表格。
- `ctx.pageState` / `ctx.setPageState(key, value)`：当前页面级共享状态。

## 源码包与恢复

HTML 惰性 `<script id="ucd-source">` 内嵌 ZIP+Base64 源码与双 SHA256 摘要，恢复过程不执行 JS。工程格式固定为 `format: 1`，当前引擎版本 `1.1.0`。
