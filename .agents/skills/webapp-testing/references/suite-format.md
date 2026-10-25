# Suite v1 用例格式

JSON 顶层 `version: 1`、`name`、`cases`；其余字段按需提供。`cases` 需要至少一个用例，每个用例有唯一 `id`、可选 `name` 和非空 `steps`。`setup` 在全部用例前执行，`teardown` 在结束或失败后尽力执行。setup 失败则跳过全部业务用例；单个用例中步骤失败后跳过其后步骤，其它用例继续。

## 变量

`variables` 保存非秘密业务参数。`${var}` 为整个值时保留原类型，嵌入字符串时转为字符串。`${token}` 来自运行时 token。HTTP `capture` 可把真实响应数据保存为变量，再用于后续 path、body、SQL 参数和浏览器输入。缺失变量报错，不变成空字符串。变量作用域为整个 suite；独立用例使用不同变量名避免意外依赖。

```json
{
  "version": 1,
  "name": "创建后查询",
  "api_base": "/api",
  "auth": {"mode": "token", "header": "Authorization", "prefix": "Bearer "},
  "variables": {"test_name": "webtest-demo"},
  "cases": [{"id": "create-read", "steps": [
    {"type": "http", "method": "POST", "path": "/items", "json": {"name": "${test_name}"}, "expect": {"status": 201, "json": {"$.data.name": "${test_name}"}}, "capture": {"item_id": "$.data.id"}},
    {"type": "http", "path": "/items/${item_id}", "expect": {"status": 200, "json": {"$.data.name": "${test_name}"}}}
  ]}]
}
```

## HTTP

`type: http`；`method` 默认 GET，支持 GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS；`path` 追加到 API base。`query` 为 URL 查询参数，`headers` 为请求头，`json` 编码 JSON 请求体，`body` 为文本请求体，`timeout` 为秒（默认 20，上限 300）。`auth: false` 仅对该请求关闭 suite token 注入，适合验证未登录拒绝。默认不跟随重定向，显式验证 3xx 或使用目标最终路径。

`expect.status` 为整数或允许的状态列表（默认 200）；`expect.json` 为 JSONPath → 精确预期值；`expect.text` 为包含的子串；`expect.headers` 为响应头 → 精确值。JSONPath 支持 `$`、`.field`、`[index]`，不支持过滤、通配符或递归查找。`capture` 为变量名 → JSONPath。

```json
{"type": "http", "method": "POST", "path": "/orders", "auth": false, "json": {"name": "${test_name}"}, "expect": {"status": 401}}
```

可使用绝对 URL，但 suite token 不会跨 API origin 发送。业务断言应检查状态码以外的数据/状态，错误用例应明确预期错误响应和无副作用。

## SQL

在顶层 `databases` 配置名称到 `{ "url_env": "TEST_DATABASE_URL" }` 的映射。步骤指定 `type: sql`、`database`（默认 main），以及 `sql` 或 `file` 二选一。`file` 相对 suite 目录，单文件一条 SQL；多语句拆为多个步骤。`params` 使用 `:name` 命名参数绑定，不把变量内插到 SQL 字符串。

```json
{"type": "sql", "database": "main", "sql": "SELECT status FROM orders WHERE id = :id", "params": {"id": "${order_id}"}, "expect": {"row_count": 1, "rows": [{"status": "APPROVED"}]}}
```

`expect.row_count` 比较查询返回行数，`expect.rows` 比较完整行列表（每行是列名到值的映射），`expect.scalar` 比较第一行第一列。需要稳定顺序时 SQL 明确 `ORDER BY`。SQL 预处理和清理沿用相同步骤；写入立即提交，不承诺 suite 级回滚。数据库状态验证针对实际后端连接的测试库。

## 浏览器

顶层 `browser`：`cdp_url` 默认 `ws://127.0.0.1:9222`，`timeout_ms` 默认 10000，可配置 `storage.localStorage`、`storage.sessionStorage`。同一次运行创建独立浏览器 context，多个 browser 步骤复用同一页面；结束关闭自己的 context，保留 Lightpanda CDP 服务。

```json
{
  "type": "browser",
  "actions": [
    {"action": "goto", "path": "/orders"},
    {"action": "fill", "selector": "#order-search", "value": "${test_name}"},
    {"action": "click", "selector": "#order-search-submit"},
    {"action": "assert_text", "selector": "#order-list", "text": "${test_name}"}
  ]
}
```

支持动作：

| action | 字段与含义 |
|---|---|
| goto | `path`，仅配置前端同源导航，等待 DOMContentLoaded |
| fill | `selector` + `value`，设置输入值并派发 input/change 事件 |
| click | `selector`，DOM click，拒绝禁用或隐藏控件 |
| select | `selector` + `value`（字符串/数组），仅原生 select；自定义 Vue 下拉用 click 对应控件/选项 ID |
| check | `selector` + `checked`（默认 true），checkbox/radio |
| wait_for | `selector` + `state`（attached/detached/visible/hidden，默认 attached） |
| assert_text | `selector` + `text`；默认包含，可设 `exact: true` |
| assert_value | `selector` + `value`，精确值 |
| assert_visible | `selector`，DOM 可见语义 |

每动作可设 `timeout_ms`。selector 仅一个 `#ID`，必须唯一；ID 以字母或下划线起始，后续支持字母数字 `_ . : -`。重复 ID 明确失败。执行不依赖像素坐标，不承诺完整模拟真实硬件输入，无法证明布局、颜色和视觉可见性。针对 Vue 复杂组件应检查实际事件模型并补充业务结果断言，不能仅以 DOM click 成功认定功能通过。

## 报告与独立包

返回状态 pass/fail/error/skipped，并生成 JSON 和 Markdown 报告。成功返回退出码 0，业务失败返回 1，参数/配置等失败可返回 2。报告脱敏但不替代用户对业务数据的审查。

`export` 校验 suite、复制引用 SQL 和运行模块。导出后 `python run.py --frontend-url URL --token TOKEN`；需要时追加 `--api-url`、`--output`、`--start-services`、`--stop-services`。更多环境约定见 [服务配置](services.md)。
