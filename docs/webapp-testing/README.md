# Web 项目功能验证 Skill

此 skill 安装在 [`.agents/skills/webapp-testing`](../../.agents/skills/webapp-testing/SKILL.md)，用于 Spring Boot + Vue 真实服务功能验证。它提供可复用 Python 执行器和 Lightpanda 浏览器适配；由 agent 结合项目源码和业务需求编写用例。无需为目标项目引入 JUnit 或前端测试框架。

## 给 agent 的常用请求

```text
使用 $webapp-testing 分析当前项目，把简短业务知识、约束、核心实体、技术栈和启动方法输出到 docs/testing-context。

使用 $webapp-testing 根据 docs/需求.md 和暂存区变更补充后端功能用例。先用真实接口创建数据，验证成功、边界和权限场景，数据库检查按业务主键定位。

使用 $webapp-testing 执行 tests/functional/suite.json。启动本地前后端，保持服务供我观察，输出前端访问地址和用例报告。

使用 $webapp-testing 把功能用例导出到 delivery/order-tests，包含前后端步骤、数据库预处理和统一 run.py。我希望提供前端地址和 token 就能重跑。
```

## 快速开始

下述命令在仓库根目录执行，目标业务项目可以在任何目录。Python 建议 3.10+；纯 HTTP + SQLite 无需额外 Python 依赖。Lightpanda、MySQL、PostgreSQL 的可选依赖和启动说明见 [安装指南](../../.agents/skills/webapp-testing/references/install.md)。

```text
python .agents/skills/webapp-testing/scripts/webtest.py analyze --project /path/to/business-project --output temp/project-context --staged
python .agents/skills/webapp-testing/scripts/webtest.py init --output temp/functional-cases
```

先由 agent 阅读现状和需求，把模板改为项目实际接口、响应结构、控件 ID 和数据库表。项目扫描产物是源码线索，业务规则与约束需要基于证据补充；未确认内容应保留为待确认。扫描不复制真实配置凭据；需求和暂存区内容会尽力脱敏，分享前仍需复核，也不应将 token 写入套件。

```text
python .agents/skills/webapp-testing/scripts/webtest.py run --suite temp/functional-cases/suite.json --frontend-url http://127.0.0.1:5173 --token YOUR_TOKEN
python .agents/skills/webapp-testing/scripts/webtest.py export --suite temp/functional-cases/suite.json --output temp/delivery
python temp/delivery/run.py --frontend-url http://127.0.0.1:5173 --token YOUR_TOKEN
```

token 可用环境变量 `WEBTEST_TOKEN` 提供。前端地址默认作为 API 同源代理入口，`api_base` 默认 `/api`。无同源代理时，在用例包中预设实际后端地址，或使用 `--api-url`。数据库 URL、Lightpanda CDP 和浏览器 token 存储位置都在生成包内配置好，因此日常重跑只需前端地址与 token；依赖服务与数据库凭据仍须提前就绪。

## 真实服务与用户观察

服务启动命令由 agent 从项目实际 Maven/Gradle/Vite 配置中确定，写入 suite 的 `services`。工具不会猜测并执行任意仓库启动脚本。服务配置包括 argv、工作目录、环境和健康检查地址。

```text
python .agents/skills/webapp-testing/scripts/webtest.py services start --suite temp/functional-cases/suite.json
python .agents/skills/webapp-testing/scripts/webtest.py services status --suite temp/functional-cases/suite.json
python .agents/skills/webapp-testing/scripts/webtest.py run --suite temp/functional-cases/suite.json --frontend-url http://127.0.0.1:5173 --start-services
python .agents/skills/webapp-testing/scripts/webtest.py services stop --suite temp/functional-cases/suite.json
```

默认保留启动的服务，用户可以用普通浏览器访问同一前端和后台数据。测试使用独立浏览器上下文，不会控制用户当前浏览器。用户观察的是业务数据变化；Lightpanda 不渲染页面，不证明样式、截图或视觉正确性。Docker 中的浏览器与宿主 Python 应共用双方可达的前端地址，例如宿主局域网 IP。停止命令仅管理本工具启动的服务。若只需一次执行，可使用 `--stop-services`。

鉴权优先沿用真实 token；关闭鉴权使用本地测试 profile 和明确授权。控件缺少 ID 时先列出具体补充项，取得同意后增加稳定唯一 ID。数据库预处理优先真实业务接口，必要 SQL 用绑定参数和本次测试标记定向写入/清理。

## 输出与维护

现状目录保存简短项目线索；用例目录保存 `suite.json`、SQL 文件和可复现步骤；执行目录保存 JSON/Markdown 报告及服务日志。服务日志来自目标服务本身，可能包含目标服务输出的敏感信息，应按项目日志规则处理。

报告中的失败与执行错误均以非零退出码体现，未执行步骤明确标记跳过。HTTP JSON、SQL 查询和 DOM 断言提供互补证据，报告的通过状态仅覆盖实际执行的断言。

实现方案见 [design.md](design.md)，本轮实际验证与限制见 [validation.md](validation.md)。
