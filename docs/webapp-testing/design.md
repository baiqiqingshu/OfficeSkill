# Web 项目功能验证 Skill 实施方案

## 目标与范围

新增 `.agents/skills/webapp-testing`，指导 agent 对 Java Spring Boot + Vue 项目进行真实服务功能验证。优先调用多个业务接口构造数据、执行操作、查询结果，再以浏览器操作和数据库断言补足证据。此次交付可运行原型，不新增回归测试代码；由独立测试 agent 做临时功能验收。

支持输入现有功能用例、用户需求、Git 暂存区变更，按证据补充后端/前端/数据库用例；模型负责业务推理，脚本负责收集线索、执行和导出，不宣称自动理解全部业务。

## 交付结构

- `SKILL.md`：模式选择、分析/编写/执行/导出流程、鉴权和补充控件 ID 的约定。
- `scripts/webtest.py`：统一 CLI；`runtime.py`：HTTP、SQL、生命周期、报告执行器；`browser.py`：通过 Playwright CDP 连接 Lightpanda；`project.py`：项目现状/暂存区收集与测试包导出。
- `references/`：依赖安装、运行配置、用例格式、业务分析与用例生成指南。
- `assets/example-suite/`：可编辑用例示例。导出的目录包含独立 `run.py`、运行模块、`suite.json`、依赖清单及简短执行说明。
- `docs/webapp-testing/`：本方案、使用说明、验收记录。

## 命令契约

```text
python scripts/webtest.py analyze --project PATH --output DIR [--requirements FILE] [--staged]
python scripts/webtest.py init --output DIR
python scripts/webtest.py run --suite FILE --frontend-url URL [--token TOKEN] [--api-url URL] [--start-services] [--stop-services] [--output DIR]
python scripts/webtest.py export --suite FILE --output DIR
python scripts/webtest.py services start|status|stop --suite FILE [--state-dir DIR]
python EXPORTED/run.py --frontend-url http://HOST:5173 --token TOKEN
```

`--frontend-url` 接受完整 URL，也接受 `IP:PORT`（补 http）；后端默认走前端同源代理，可用 suite 的 `api_base`（默认 `/api`）或 `--api-url` 指向独立后端。无需服务启动配置即可连接已运行服务。token 也可通过 `WEBTEST_TOKEN` 传入。报告不持久化 token、鉴权头或数据库连接密码。

## Suite v1 数据契约

使用 JSON（版本 `version: 1`）。顶层字段：`name`、`api_base`、`auth`、`variables`、`browser`、`databases`、`services`、`setup`、`cases`、`teardown`。未提供的可选字段有合理默认值。

```json
{
  "version": 1,
  "name": "订单功能",
  "api_base": "/api",
  "auth": {"mode": "token", "header": "Authorization", "prefix": "Bearer "},
  "variables": {"test_name": "webtest-order"},
  "browser": {"cdp_url": "ws://127.0.0.1:9222", "storage": {"localStorage": {"token": "${token}"}}},
  "databases": {"main": {"url_env": "TEST_DATABASE_URL"}},
  "services": {},
  "setup": [],
  "cases": [{"id": "order-create", "name": "创建后可查询", "steps": [
    {"type": "http", "id": "create", "method": "POST", "path": "/orders", "json": {"name": "${test_name}"}, "expect": {"status": 200, "json": {"$.code": 0}}, "capture": {"order_id": "$.data.id"}},
    {"type": "http", "method": "GET", "path": "/orders/${order_id}", "expect": {"status": 200, "json": {"$.data.name": "${test_name}"}}},
    {"type": "browser", "actions": [{"action": "goto", "path": "/orders"}, {"action": "fill", "selector": "#order-search", "value": "${test_name}"}, {"action": "click", "selector": "#order-search-submit"}, {"action": "assert_text", "selector": "#order-list", "text": "${test_name}"}]},
    {"type": "sql", "database": "main", "sql": "SELECT name FROM orders WHERE id = :id", "params": {"id": "${order_id}"}, "expect": {"row_count": 1, "rows": [{"name": "${test_name}"}]}}
  ]}],
  "teardown": []
}
```

- `${var}` 全值替换保留原数据类型，字符串内插转为字符串；变量来自顶层 variables、token、HTTP capture。缺失变量立即报错。
- HTTP：真实网络请求，超时有界；JSONPath 支持 `$`、`.field`、`[index]`，断言必须明确。`capture` 指向响应 JSON。返回非 2xx 可用 `expect.status` 验证错误路径。
- SQL：命名参数绑定，`sql` 或相对 suite 文件的 `file`；查询支持 `row_count` / `rows`。SQL 预处理和清理也用同样步骤；SQLite 零额外依赖，MySQL/PostgreSQL 为可选驱动。数据库 URL 只引用环境变量。写操作逐步提交以便用户观察。
- 浏览器：按 ID 定位；支持 goto、fill、click、select、check、wait_for、assert_text、assert_value、assert_visible。通过 Lightpanda 的 CDP 连接，不默默切换为 Chromium；缺依赖/服务明确失败。Lightpanda 为无渲染浏览器，不承诺截图或视觉正确性。
- 生命周期：服务 command 为 argv 数组，cwd 相对 suite；可设 env（支持环境引用）、ready_url、startup_timeout。只管理本工具启动的进程，日志和状态写入运行目录；默认保留前后端运行，给用户 URL，支持显式停止。
- 结果：JSON + Markdown，区分 pass/fail/error/skipped，记录断言与耗时；失败返回非零。setup 失败跳过业务执行，teardown 尽力执行；某用例失败不阻断其它独立用例，失败步骤后的本用例步骤跳过。

## 业务与授权约定

1. 优先保留鉴权并使用用户提供的 token；缺少凭据时先完成分析、用例和可运行包，再请求必要信息。
2. 关闭鉴权仅限明确的本地测试 profile 和已有授权；不得将 permitAll 写入默认/生产配置。没有开关时提出具体局部修改供用户授权。
3. 缺少稳定按钮/输入框 ID 时列出具体补充项；用户同意后补充，已有授权不重复询问。列表行 ID 必须唯一。
4. 数据库预处理说明作用范围；使用测试业务标记/主键定向清理，不自动清空库表。用例可通过真实业务接口预处理。
5. 现状目录控制体积：索引、业务知识与约束、核心实体/关系、技术栈/启动方式、影响范围。附源码路径和待确认点，不复制全量源码和秘密配置。

## 并行分工与验收

- 执行器开发 agent：`runtime.py`、`webtest.py`、可选依赖清单。
- 工具与 Skill 开发 agent：`project.py`、`browser.py`、SKILL、references、示例和 UI metadata；遵循此契约，与执行器协调模块接口。
- 独立测试 agent：先核实 Lightpanda 接口和安装方式，随后在临时目录验收真实 HTTP、多业务调用、SQL、导出包、服务启停、暂存区和上下文收集；可用条件允许时验证真实 Lightpanda。不提交测试代码。
- 主 agent：方案与 docs 管理、接口协调、审阅验收、组织修复与自动 Git 提交。

## 当前限制

仓库本身不是 Spring Boot + Vue 业务应用，无法在本仓库证明某个真实业务项目的用例覆盖率。验收使用临时服务和小型项目夹具；实际业务需求到用例的映射仍由调用本 skill 的 agent 基于目标源码完成。
