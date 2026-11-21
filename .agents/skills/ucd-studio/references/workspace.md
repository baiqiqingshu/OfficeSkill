# 配置工程协议 v1

默认使用 Python 标准库 + 原生 JS。模型编辑配置/自定义组件，公共运行时和交付 HTML 由构建器维护。可直接打开 [完整示例](../demo/project/index.html)，用 unpack 恢复其工程。

## 文件与命令

```text
python <skill>/scripts/ucd.py project --out output/approval
python <skill>/scripts/ucd.py summary --dir output/approval
python <skill>/scripts/ucd.py build --dir output/approval --out output/approval.html
python <skill>/scripts/ucd.py unpack --html output/approval.html --out output/approval-edit
python <skill>/scripts/ucd.py check --dir output/approval
```

`project` 创建工作目录并首次构建；输出目录必须为空或不存在。`--config path/app.json` 是 app 配置覆盖，页面/数据/组件注册表/素材从该配置旁的相对路径导入。仅导入实际引用的文件；未提供的默认内容继续使用内置示例。自定义组件依赖在配置目录的 `components.json` 中声明。

`build` 将所用配置、组件、依赖、资源和独立构建脚本复制到系统临时目录，在其中运行构建命令，临时文件自动清理。已有组件文件不会被 skill 静默覆盖；新增内置组件的缺失依赖会按注册表补齐。

输出 HTML 旁的 `*.manifest.json` 记录源码与 HTML 摘要，供检查使用，无需一起交付。恢复后的 `python build.py [--out 路径]` 固定使用工程自带构建器，不依赖 skill 或 Node。`check` 检查默认 `index.html` 与当前工程是否一致。

```text
approval/
  app.json                  系统配置
  pages/requests.json        页面配置
  data/requests.json         示例数据
  components.json           组件路径、显式依赖
  components/*.js            一组件一文件
  runtime/runtime.js        公共运行时快照
  runtime/style.css          公共样式快照
  runtime/themes.json        主题快照
  project.json              协议/构建器版本
  build.py                  独立构建器
```

## app.json

```json
{
  "version": 1,
  "title": "设备管理",
  "style": "ocean",
  "density": "compact",
  "shell": "sidebar",
  "startPage": "devices",
  "pages": {"devices": "pages/devices.json"},
  "data": {"devices": "data/devices.json"},
  "assets": {"logo": "assets/logo.png"}
}
```

可选：`workspace`、`user`（显示姓名）、`tokens`（覆盖主题 CSS 变量）。页面与组件名称使用小写字母开头的字母、数字、短横线。数据是对象数组，表格默认每条需要唯一字符串/整数 `id`；可通过 `rowKey` 改名。字段 key 使用字母开头的字母、数字、下划线。

素材通过 `app.assets` 显式声明，或在页面/数据中使用完整 `assets/...` 路径。构建时转为 data URL，源码包同时保留原文件；支持常用图片、SVG、字体。组件可用 `ctx.asset('logo')` 取得 data URL。CSS 素材须在 app.assets 声明，再用 `url(assets/...)`；不支持远程资源和任意目录自动扫描。

## 页面、插槽与稳定 ID

```json
{
  "title": "设备台账",
  "description": "筛选设备并维护领用信息。",
  "content": [{
    "component": "table", "id": "devices",
    "props": {
      "data": "devices", "title": "设备清单", "pageSize": 8,
      "fields": [
        {"key":"name","label":"设备名称","required":true},
        {"key":"owner","label":"领用人"},
        {"key":"status","label":"状态","type":"select","options":["在库","已领用"],"default":"在库","tones":{"在库":"success","已领用":"primary"}}
      ],
      "columns": ["name","owner","status"],
      "filters": ["name","status"],
      "actions": [{"type":"create","label":"新增设备","primary":true}],
      "rowActions": ["detail","edit",{"type":"update","label":"归还","values":{"status":"在库"}},"delete"]
    }
  }]
}
```

节点仅需 `component`，可选 `id/props/slots`。页面内显式 ID 唯一，供 summary 和 patch 定位。`slots` 的值为一个节点或节点数组，可嵌套；命名插槽由组件定义。

```text
python <skill>/scripts/ucd.py patch --dir output/approval --file pages/devices.json --node devices --set props.pageSize=12 --set props.fields.0.label=资产名称
```

`--file` 默认 app.json，`--node` 可省略。配置工程的 --set 支持现有数组索引；--json/--patch 使用对象递归合并、数组整体替换，null 删除对象字段。数据数组建议直接编辑小文件。

## 内置组件

| 组件 | props | slots |
|---|---|---|
| table | data、fields、columns、filters、pageSize、rowKey、title、actions、rowActions、batchActions；formFields 可单独指定编辑字段 | before、after、toolbar、form、detail、cell:字段key |
| form | fields、record、submitLabel；独立使用时可配置 data/rowKey 保存到本地数据集 | before、after |
| field | field、value | 无 |
| detail | fields、record；打开自定义视图时可读取 ctx.row | before、after |
| stats | items:[{label,value,hint?,tone?}]；配置 data/field/equals 时按数据集动态计数 | 无 |
| panel | title、description、columns:1..4 | default、actions |
| tabs | items:[{key,label}] | 每个 key 对应一个同名插槽 |
| alert | title、text、tone | 无 |
| image | src 或 asset（app.assets 的名称）、alt、caption | 无 |

字段支持 text/email/date/number/select/textarea/checkbox，另有 required/default/placeholder/help/hidden/readonly/disabled/min/max/step。select.options 可写字符串数组或 `{value,label}` 数组；筛选使用原始 value，显示使用 label。tones 按原始值映射 badge 色：primary/neutral/success/warning/danger。

表格 `columns/filters` 引用 fields.key；文本筛选为包含匹配，下拉筛选为精确匹配。数据变更会重绘统计与页面，筛选、排序、分页状态在页面切换中保留。rowActions 默认 detail/edit/delete，actions 默认 create，batchActions 默认关闭；传空数组隐藏相应操作。

table 的 form/detail 插槽附加到标准表单/详情之后；cell:key 插槽每行实例可读取 `ctx.row/ctx.valueData/ctx.field`，valueData 是单元格原值。table 的行为依赖 form/detail/field，新增组件时须声明依赖。

## 常用操作

字符串是同名 type 的简写，如 `"edit"`。

| type | 字段与效果 |
|---|---|
| create / edit | 按字段打开表单，保存后新增/更新本地数据 |
| detail | 用记录打开详情抽屉 |
| update | values:{字段:值}，更新当前行或批量选择的记录 |
| approve | 将 statusField（默认 status）设为已通过 |
| delete | 确认后删除当前行或选择记录 |
| navigate | page:页面ID |
| open | target:当前页 views 的名称，可选 mode:drawer/dialog |
| toast | message:提示内容 |

操作可附加 label/primary；update/delete 可设置 confirm 文案。行操作 `when:{field,equals}` 控制显示。通用操作可指定 data 覆盖当前数据集。

页面可定义 `views:{名称:节点}`，配合 open 打开自定义视图；此时组件读取 `ctx.row`。不提供表达式引擎或 eval；复杂逻辑用 JS 组件。

## 自定义组件

在 components.json 声明：

```json
{"my-card":{"file":"components/my-card.js","dependencies":["panel"]}}
```

组件文件：

```javascript
UCD.register('my-card', {
  css: '.my-card-button { margin-top: 12px; }',
  render(props, ctx) {
    return `<section><h2>${ctx.escape(props.title)}</h2>
      ${ctx.slot('default')}<button type="button" class="btn my-card-button">查看记录</button></section>`;
  },
  mount(root, props, ctx) {
    root.querySelector('.my-card-button').addEventListener('click', () => ctx.navigate(props.page));
    // 绑定 root 外的监听器或计时器时，返回清理函数。
  }
});
```

`render(props,ctx)` 返回 HTML 字符串，业务文本使用 ctx.escape。`mount(root,props,ctx)` 在子节点完成渲染后执行，可返回 cleanup；组件重绘、页面切换、抽屉关闭时调用。尽量在 root 内查询 DOM，自定义 CSS 使用组件类名限定。

context：

- `state`：组件实例的会话状态；`refresh()` 仅重绘当前组件。
- `data(name)` / `setData(name,rows)`：读取/替换数据集；替换后重绘页面。
- `slot(name,scope?)`：挂载命名插槽，scope 传给子组件上下文。
- `child(component,props,scope?)`：组合已声明依赖的组件，无需复制其实现。
- `action(type或对象,{row?,rows?})`：执行常用操作。
- `open(node,{title?,mode?,context?})` / `close()`：打开/关闭浮层。
- `navigate(page)` / `notify(text)` / `asset(name)` / `escape(value)`。
- `onSubmit(values)`：浮层表单的保存回调，由打开方通过 context 注入。

组件注册文件可包含多次 UCD.register；注册表条目可共用一个文件，构建器按文件去重。建议工作工程一组件一文件；内置文件已按组件拆分。

## 源码包与恢复限制

HTML 内惰性 script 数据块携带 ZIP+Base64 源码，包含配置、组件、素材、运行时与 build.py。ZIP 摘要和渲染 HTML 摘要分别校验；不执行解包文件来验证工程。

归档路径、重复名称、循环依赖、解压体积、数据引用、表格字段/记录 ID 在构建或解包时检查。输出若存在外部手工修改，build/unpack 默认拒绝；`unpack --allow-modified` 明确表示只恢复保存的源码，外部 DOM/CSS/JS 修改须人工迁移。

工程格式与构建器版本固定在 project.json；engine v1.0.0 与旧版 page.json 生成器 1.2.0 各自独立。旧版 HTML 不含工程包，无法自动反推为工程。数据操作仅保存在浏览器内存，刷新重置，不自动写回源 JSON。
