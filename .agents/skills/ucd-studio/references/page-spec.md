# page.json 数据协议

普通任务优先 init --config small.json：只写与模板不同的字段，无需拼整份配置或先读模板。init/patch/build 已执行结构与离线检查。

例如替换列表业务字段（statusColumn 从 0 起，与列数一起调整）：

```json
{"title":"资产台账","blocks":{"records":{"title":"设备记录","columns":["设备","责任人","状态"],"rows":[["测试笔记本","示例成员",{"text":"在用","tone":"success"}]],"statusColumn":2},"metrics":null}}
```

执行 `init --layout admin --config small.json --out output/assets` 即可；完整 page.json 由工具补齐。后续已知字段直接 patch；仅需要了解现状时用 summary --dir，再按需 --block records。

需要脱离模板自行组织页面时，以下是完整最小配置：

```json
{
  "version": 1,
  "title": "申请管理",
  "product": "团队工作台",
  "description": "快速定位需要处理的申请。",
  "layout": "admin",
  "style": "ocean",
  "audience": "部门审批人",
  "goal": "及时处理申请并了解上下文",
  "primaryTask": "筛选待审批事项",
  "assumptions": ["审批权限由真实系统处理，本原型只展示界面"],
  "sources": ["src/views/requests.vue：提供列表字段；错误状态为原型补充"],
  "blocks": {
    "records": {
      "type": "table",
      "title": "待处理申请",
      "span": "full",
      "columns": ["名称", "申请人", "状态"],
      "rows": [["环境申请", "示例成员", {"text": "待审批", "tone": "warning"}]],
      "statusColumn": 2,
      "pageSize": 5
    }
  }
}
```

可选顶层：action（主按钮）、eyebrow（仅保留旧配置兼容，不再渲染）、density（comfortable/compact，内置模板默认 compact）、tokens（覆盖语义 token）、successCriteria（字符串数组）、assets（明确的本地素材声明）。禁止原始 HTML、任意脚本或任意 CSS 注入字段。

style 有 ocean/slate/jade/plum/warm/rose/midnight/contrast；默认 ocean 已确定，无需检索，只有需要其他风格时才按需查询。tokens 只允许已有颜色键与 radius，如 `{"primary":"#2455aa","radius":"8px"}`；颜色必须六位 HEX。density 只影响留白，不改变字号或信息结构；省略时为 comfortable，内置布局明确指定 compact。生成规范记录当前主题合并 token 及部分实色对比度，覆盖品牌色后仍需复查实际页面。详细语义、密度尺寸与状态扩展见 [design-guidelines.md](design-guidelines.md)。

layout 决定网格规则，blocks 定义内容和顺序。block ID 为小写字母开头、字母数字连字符，不超过 48 字符；不要使用 main/toast/create-dialog/dialog-title。通用属性 type/title/description/span，span=half/full；half 表示参与布局，工作台与表单会按组件职责分配实际列数，full 始终跨 12 列。生成规范会列出每个区块的桌面实际跨度。最多 30 区块；小模型任务通常用 3–6 个区块即可。

| type | 主要属性 | 用途 |
|---|---|---|
| stats | items: label/value/change?/hint? | 关键指标 |
| table | columns, rows, statusColumn?, pageSize? | 筛选、排序、分页列表 |
| bar-chart | items: label/value（0–100） | 占比横条 |
| line-chart | labels, values, summary?, change? | 趋势（2–30 个非负数） |
| activity | items: title/time?/description? | 动态时间线 |
| form | fields: label/type?/required?/placeholder?/value?/options?/help?; submit? | 原生校验表单 |
| detail | items: label/value | 属性详情 |
| cards | items: title/description?/action? | 入口卡片 |
| kanban | columns: title/items，每项 title/owner?/tag? | select 切换任务状态 |
| steps | items: 字符串数组；current?（从 0 起） | 步骤指示，不自动跨步骤提交 |
| accordion | items: title/content | 原生折叠面板 |
| alert | text | 提示条 |
| empty | text, heading?, action? | 空状态 |
| progress | items: label/value（0–100） | 进度条 |
| image | src, alt, caption? | assets 内本地图片 |
| tabs | items: label/content | 键盘可操作页签 |

表格单元格与 detail.value 可用文本或 `{"text":"已通过","tone":"success"}`。tone=primary/neutral/success/warning/danger，状态文字不可省略。表格 rows 可为空；列数 1–12，最多 500 行。form.type=text/email/date/number/select/textarea，select 必须有 options。

新增区块时用 `show ID --example` 取单项 JSON；默认 show 仅返回元数据。按钮、input、select、textarea、badge、switch、breadcrumb、dialog 另有可查询 HTML 片段，属于 primitive，不是合法 blocks.type；仅在手工扩展时通过 `show ID --code` 读取。重名时加 `--kind component` 或 `--kind layout`。公共样式与行为在 assets/base.css、assets/runtime.js，普通模板任务不需要读取。

大模型无需加载所有示例：`search "审批 筛选" --kind component --limit 2` 返回少量元数据；`show table --code` 返回一个组件。`--max-chars` 控制结果预算，超限时退回元数据并提示，不把 JSON 截成无效片段。新主题可扩展 data/styles.json 和 catalog.json，新布局同时添加 examples/、layouts.json 与 catalog.json。
