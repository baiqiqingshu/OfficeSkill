# page.json 数据协议

优先 init 后修改示例。以下是可完整生成的最小配置：

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

可选顶层：action（主按钮）、eyebrow（标题眉题）、density（comfortable/compact）、tokens（覆盖语义 token）、successCriteria（字符串数组）、assets（明确的本地素材声明）。禁止原始 HTML、任意脚本或任意 CSS 注入字段。

style 有 ocean/slate/jade/plum/warm/rose/midnight/contrast，先检索再选。tokens 只允许已有颜色键与 radius，如 `{"primary":"#2455aa","radius":"8px"}`；颜色必须六位 HEX。density 只影响密度，不改变信息结构。覆盖品牌色后要重新确认对比度。

layout 决定网格规则，blocks 定义内容和顺序。block ID 为小写字母开头、字母数字连字符，不超过 48 字符；不要使用 main/toast/create-dialog/dialog-title。通用属性 type/title/description/span，span=half/full。最多 30 区块；小模型任务通常用 3–6 个区块即可。

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

按钮、input、select、textarea、badge、switch、breadcrumb、dialog 另有可查询 HTML 片段；属于 primitive，不是合法 blocks.type。通过 `show ID --code` 获取当前组件的 HTML/CSS 和依赖约定。重名时使用 `show form --kind component --code` 或 `--kind layout` 区分。组件公共基础样式和行为分别在 assets/base.css、assets/runtime.js；只在手工扩展时按需读相关片段。

大模型无需加载所有示例：`search "审批 筛选" --kind component --limit 2` 返回少量元数据；`show table --code` 返回一个组件。`--max-chars` 控制结果预算，超限时退回元数据并提示，不把 JSON 截成无效片段。新主题可扩展 data/styles.json 和 catalog.json，新布局同时添加 examples/、layouts.json 与 catalog.json。
