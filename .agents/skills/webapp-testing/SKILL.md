---
name: webapp-testing
description: Verify Spring Boot and Vue application features against running HTTP services, Lightpanda browser sessions and databases. Use for supplied functional cases, requirement or staged-change validation, concise project context, backend case supplementation, and portable Python execution bundles.
---

# Web 项目功能验证

以运行中的 Spring Boot + Vue 服务验证完整业务行为。优先通过真实业务接口串联创建、操作、查询，使用浏览器和数据库断言补足证据。模型负责读源码、理解需求和编写用例；脚本执行已明确的步骤。

`SKILL_DIR` 为本文件所在目录。命令在任意目录执行，路径带空格时加引号。Python 3.10+；首次执行或缺依赖时读 [安装与连接](references/install.md)。

## 按请求选择工作

- **总结项目**：运行 `analyze` 收集有界源码线索，然后回读相关文档、Controller/Service、实体、Vue 页面、配置与迁移，填写输出目录中的业务知识、约束、实体关系和启动方式。扫描结果只是线索，不能把“待 agent 补充”当作已完成的分析。见 [项目上下文与用例生成](references/authoring.md)。
- **传入用例**：保留用户用例 ID、操作与预期，映射为 suite JSON 的 HTTP、browser、SQL 步骤；不擅自弱化断言。
- **需求或暂存区验证**：先收集需求/`git diff --cached`，再依据目标源码补充功能用例，覆盖正常、权限、失败、边界与数据库结果。需求变化而未实现的行为应报告差距。见 [编写指南](references/authoring.md)。
- **补充后端用例**：从需求梳理业务前置、多个真实接口调用、状态变更、失败响应、事务和数据库断言，输出用例包；没有运行环境时仍完成可审阅的用例。
- **运行或导出**：读 [运行配置](references/services.md) 和 [用例格式](references/suite-format.md)，检查操作及数据范围，启动实际服务或连接既有服务，再运行统一 Python 入口；按需导出独立目录。

```text
python SKILL_DIR/scripts/webtest.py analyze --project APP --output APP/docs/testing-context --requirements requirements.md --staged
python SKILL_DIR/scripts/webtest.py init --output APP/functional-cases
python SKILL_DIR/scripts/webtest.py run --suite APP/functional-cases/suite.json --frontend-url http://127.0.0.1:5173 --token TOKEN --start-services
python SKILL_DIR/scripts/webtest.py export --suite APP/functional-cases/suite.json --output delivery/feature-cases
python delivery/feature-cases/run.py --frontend-url http://HOST:5173 --token TOKEN
```

## 执行约定

1. 先确认目标是用户指定的开发/测试环境；按现有授权执行业务写操作。优先通过外部业务接口准备数据，不 mock Service/Repository，不以 HTTP 200 替代业务断言。数据库预处理/清理应有测试标记或精确主键约束，不清空库表。
2. 默认保持鉴权，使用 token（推荐环境变量 `WEBTEST_TOKEN`）。缺 token 时先完成源码分析和用例包，再索取必要信息。若用户已授权关闭本地鉴权，可用现有隔离测试 profile；没有隔离开关时给出具体改动，取得授权后再修改。禁止将 `permitAll` 等绕过写入默认/生产配置。
3. 浏览器以稳定且唯一的 DOM `id` 定位输入框和按钮。缺失时列出所需控件及拟加 ID，取得用户同意后补充；本会话已授权则直接实施。Vue 组件应核实 ID 确实落在可交互 DOM 上，列表行加入稳定业务键以避免重复。
4. 前后端实际运行并保留，告知用户访问 URL、业务数据标记和日志/报告路径，方便观察执行效果。只停止本工具启动的进程；用户要求关闭或显式配置清理时再停止。
5. Lightpanda 通过 CDP 执行 DOM/事件和业务交互。它没有完整图形布局，`assert_visible` 仅检查 DOM 可见语义，不能证明视觉正确性；不承诺像素/截图验收，也不默默改用 Chromium。框架 API 不兼容时保留错误证据并说明受阻范围。
6. 用例、预处理 SQL、执行动作、断言和报告放在一个目录。交付说明覆盖执行命令、环境变量、未运行项与缺口；凭据不写入 suite、文档、Git 或执行报告。导出前审查业务数据与 SQL 中的敏感值。

内置 [完整业务链示例](assets/example-suite/suite.json) 同时展示 API、DOM、DB 断言；[纯 HTTP 示例](assets/http-suite.json) 可作为无需浏览器/数据库的起点。它们是需按目标项目改写的示范，不代表目标业务已经被验证。
