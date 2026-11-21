---
name: ucd-studio
description: 用配置和可定制组件创建、修改内网后台管理系统的离线 UCD 原型，交付单 HTML 并可恢复源工程。适用于管理列表、表单、详情和工作台；Python 标准库与原生 JS，无需联网、安装依赖或前端构建环境。
---

# UCD Studio

以小型配置工程编辑原型，以单 HTML 交付。Python 3.10+，原生 JS，纯离线。生成的 HTML 携带压缩源码包，接手单个 HTML 时可恢复工程。

## 默认流程：配置工程

先创建可交互的后台管理原型，再按需求修改对应小文件：

```text
python <skill>/scripts/ucd.py project --out output/approval --title "申请管理" --style ocean
```

- `app.json`：系统标题、主题、密度、导航、页面/数据/素材路径。
- `pages/*.json`：页面结构、字段、筛选、操作和命名插槽。
- `data/*.json`：脱敏示例数据，记录使用稳定 `id`。
- `components/*.js`：所用内置组件快照与自定义组件，一组件一文件。
- `runtime/`、`build.py`：随工程固定版本的运行时与独立构建器，无需让模型阅读或重写。

已有配置目录可用 `project --config <配置目录>/app.json --out <新目录>` 导入。只复制配置引用的页面、数据、组件和素材，不扫描整个业务项目。

修改后构建：

```text
python <skill>/scripts/ucd.py build --dir output/approval
```

构建命令补齐所用内置组件的显式依赖，复制源码到临时目录，在临时目录执行工程构建器，产出 `index.html`。CSS、JS、图片、字体和源工程均内嵌；交付只需 HTML。

已知局部修改，直接按稳定节点 ID 定位：

```text
python <skill>/scripts/ucd.py patch --dir output/approval --file pages/requests.json --node requests --set props.pageSize=10
python <skill>/scripts/ucd.py patch --dir output/approval --set style=jade
```

`--set` 支持对象路径及现有数组索引，如 `props.fields.0.label=事项名称`；`--json/--patch` 为对象递归合并、数组整体替换。大块字段或复杂逻辑直接编辑对应 JSON/JS 小文件。

## 接手 HTML 与继续编辑

```text
python <skill>/scripts/ucd.py unpack --html approval.html --out output/approval-edit
python <skill>/scripts/ucd.py summary --dir output/approval-edit
python <skill>/scripts/ucd.py build --dir output/approval-edit
```

只支持恢复携带源码包的工程模式 HTML。HTML 存在外部手改时默认拒绝；`unpack --allow-modified` 只恢复原内嵌源码，不合并外部修改。解包目录必须为空或不存在。

工程脱离 skill 后，可用 `python <工程>/build.py` 独立重建；新增尚未快照的内置组件时，用 skill 的 build 命令补齐依赖。

## 组件与定制

内置管理列表 `table` 已封装筛选、排序、分页、选择、新建/编辑表单、详情抽屉、确认删除和批量更新。另有 `field/form/detail/stats/panel/tabs/alert/image`。

- 优先用配置表达字段、布局和常见操作，用插槽组合；特殊区域写独立 JS 组件，不重写整页或框架。
- 节点协议为 `{component, id?, props?, slots?}`。容器和页签支持嵌套节点。
- 自定义组件在 `components.json` 声明 `file/dependencies`，用 `UCD.register(name, {render, mount?, css?})` 注册；使用组件自身 root 和 context，无需全局选择器。
- `python <skill>/scripts/ucd.py components` 返回内置组件及依赖速查；仅在定制配置/组件时读取 [工程协议](references/workspace.md)。
- 主题：`ocean/nordic/indigo/slate/jade/plum/warm/rose/midnight/contrast`；支持 `shell: sidebar|topnav`、`density: compact|comfortable` 和 tokens 覆盖。

## 兼容已有原型

目录只有 `page.json` 时，继续使用旧版 `quick/init/patch/build`；其配置见 [page-spec.md](references/page-spec.md)，旧版模式和手改规则见 [output-modes.md](references/output-modes.md)、[editing.md](references/editing.md)。旧版 HTML 无源码包时不支持自动恢复为新工程。不要因为新任务而重建用户已有原型。

按本地项目源码提取字段时读取 [source-workflow.md](references/source-workflow.md)；需要额外设计决策时读取 [design-guidelines.md](references/design-guidelines.md)。

## 约束

不访问外网、CDN、远程字体或图片。浏览器交互使用本地演示数据，刷新后恢复；不连接生产后端。交付带 CSP。任意自定义 JS 的行为仍需按需求检查；打包摘要用于识别改动，不代表源码可信认证。
