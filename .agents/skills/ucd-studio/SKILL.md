---
name: ucd-studio
description: 用配置和可定制组件创建、修改内网后台管理系统的离线 UCD 原型，交付单 HTML 并可恢复源工程。适用于管理列表、左树右表、仪表盘、审批流、系统设置和工作台；Python 标准库与原生 JS，无需联网、安装依赖或前端构建环境。
---

# UCD Studio

以小型配置工程编辑后台原型，以可恢复源码的单 HTML 交付。Python 3.10+ 标准库与原生 JS，纯离线，内置“霁蓝瓷面”视觉规范（自定义下拉框、内联 SVG 图标、统一弹窗/抽屉、10 套主题）。

## 快速起盘：选模板或单份 Spec

```text
python <skill>/scripts/ucd.py project --out output/approval --template crud --title "申请管理" --style ocean
```

- `--template`：`crud`（默认，指标+列表+图表概览）、`tree-table`（左树右表联动筛选）、`dashboard`（指标+趋势/占比图+进度+时间线+看板）、`approval`（步骤条+审批队列+状态看板）、`settings`（分页签分组表单+开关/单选/标签）。
- 一步起盘：已知全部页面与数据时，可用 `project --out output/app --from-spec spec.json`（或内联 JSON / `-` stdin）自动拆分为标准工程目录并构建单 HTML。
- 导入已有配置目录：`project --config <配置目录>/app.json --out <新目录>`，仅复制配置引用的页面、数据、组件和素材。

工程目录结构（模型只改业务小文件，不读不改 `runtime/`、`build.py` 或交付 HTML）：

- `app.json`：标题、主题、密度、导航外壳、页面/数据/素材路径。
- `pages/*.json`：页面结构、图标/分组、组件节点与命名插槽。
- `data/*.json`：脱敏示例数据（记录使用稳定 `id`）。
- `components/*.js`（及可选 `.css`）：所用内置组件按一组件一文件拆出快照，与自定义组件同协议。

## 增量修改与构建

```text
python <skill>/scripts/ucd.py add-page --dir output/approval --id users --title "成员管理" --template tree-table --group "组织权限"
python <skill>/scripts/ucd.py add-component --dir output/approval --name biz-card --deps panel --css
python <skill>/scripts/ucd.py patch --dir output/approval --file pages/requests.json --node requests --set props.pageSize=10 --append props.columns=priority
python <skill>/scripts/ucd.py build --dir output/approval --out delivery/approval.html
```

- `patch` 支持 `--set path=val`、`--append path=val`（数组追加）、`--remove path`（删字段或数组项）与 `--json/--patch`。
- `build` 自动从 skill 内置组件包拆出缺失内置组件为一组件一文件，再将所有源文件复制到系统临时目录执行工程自带 `build.py`，输出单 HTML（外部 `--out` 默认不附带 `.manifest.json`，保持交付目录整洁）。

## 接手单 HTML 继续编辑

```text
python <skill>/scripts/ucd.py unpack --html approval.html --out output/approval-edit
python <skill>/scripts/ucd.py summary --dir output/approval-edit
python <skill>/scripts/ucd.py build --dir output/approval-edit --out approval.html
```

- `unpack` 恢复完整配置工程，重复迭代到已有 UCD 工程目录可加 `--force`。
- 若 HTML 曾被外部手改，默认拒绝覆盖；`unpack --allow-modified` 仅恢复原内嵌源码。
- 工程脱离 skill 后可直接 `python <工程>/build.py` 独立重建。

## 内置 19 个组件与自定义扩展

- 核心：`field`（含 `select` 自定义下拉、`switch`、`radio`、`tags`、`search`）、`form`（支持 `sections` 分组）、`detail`、`alert`、`image`。
- 数据与交互：`table`（搜索/筛选/排序/分页/上下文多选/CRUD 抽屉/确认弹窗）、`stats`（支持点击联动筛选）、`tree`（支持 `target+filterField` 联动过滤表格）、`kanban`（卡片跨列流转）、`empty`。
- 布局与流程：`panel`、`split`（多栏/左树右表）、`tabs`（胶囊分段页签）、`steps`、`cards`。
- 图表与动态：`bar-chart`（支持 `data+groupBy` 动态聚合）、`line-chart`（SVG 面积折线）、`timeline`、`progress`。

查询单组件最小示例而不必通读文档：

```text
python <skill>/scripts/ucd.py components
python <skill>/scripts/ucd.py components table
```

仅在定制高级配置、操作协议或自定义组件 API 时读取 [工程协议](references/workspace.md)。

## 主题与约束

- 10 套离线主题：`ocean/nordic/indigo/slate/jade/plum/warm/rose/midnight/contrast`；`shell: sidebar|topnav`；`density: compact|comfortable`。
- 禁止外网、CDN、远程字体与图片；交付带 CSP；浏览器数据变更仅在内存生效，刷新重置。
- 兼容旧版：仅当目录存在旧版 `page.json`（无 `app.json`）时沿用 `init/quick/patch/build`（见 [page-spec.md](references/page-spec.md)）；新建任务一律使用配置工程。
