# 原型验收记录

验收日期：2026-10-26。由独立验证子代理在 `temp/webapp-testing-validation/` 创建临时 HTTP 服务、SQLite 数据库和项目夹具，调用实际 Python CLI 验证。临时验证脚本不纳入版本控制；未新增持久测试代码。

## 已验证行为

- 真实 HTTP 多接口业务链：创建 → 查询 → 修改 → 删除 → 再查询返回 404；响应捕获值用于后续请求，并通过 SQLite 查询核对每步数据。
- 服务默认保留运行，执行结束后 `services status` 仍显示运行，符合用户观察数据变化的需求。
- 缺失变量导致当前用例错误，其后步骤跳过，其它独立用例继续；报告退出码非零。
- setup 失败时业务用例全部跳过，整体状态为 error；teardown 首步失败后，后续清理仍执行并正确记录 pass。
- 用例语法预校验在 setup 写入前拒绝空浏览器 actions，数据库未发生该预处理写入。
- 缺少必需 token 时拒绝运行；报告中的 token 和 URL 鉴权参数脱敏。
- 导出包搬移目录后，`run.py` 仅传前端地址和 token 即可执行；不同源目录的同名 SQL 文件导出后不会冲突。
- 项目分析生成 6 个短文件，包含实体、技术栈和暂存区线索；需求及暂存区中的常见凭据已脱敏。
- 服务重复 start 保留原 PID；检测到进程身份不匹配时 stop 保留该进程；suite 被改坏后仍可停止此前启动的自有服务。就绪超时会生成错误报告并停止本次新启动的进程。
- 敏感响应字段的失败断言和 capture 后改名变量不泄漏密码；修复前该场景会将密码拼入错误信息，修复后已复验通过。
- 非法 suite 和 suite 目录之外的 SQL 在导出创建目录前被拒绝；token capture 的 JSONPath 声明可以正常导出。
- 缺少 Playwright 时浏览器步骤明确报 error，同一 suite 的独立 HTTP 用例继续通过；没有替代浏览器回退。
- Skill 格式校验、全部 Python 脚本编译、完整/纯 HTTP 示例加载、init/export 和文档本地链接检查通过。Windows UTF-8 模式下真实服务启停已复验，修复系统命令中文输出的解码问题。

## 实施与验证产物

入口为 `scripts/webtest.py`，提供 `analyze`、`init`、`run`、`export`、`services`。项目分析与执行包分别由 `project.py` 和 `runtime.py` 负责，浏览器由 `browser.py` 通过 CDP 连接。完整业务链和纯 HTTP 示例均为演示契约，须依据实际项目改写。

临时功能证据和详细验收报告在 `temp/webapp-testing-validation/validation-report.md`，执行器每次运行生成独立 JSON/Markdown 报告；开发子代理的初始化/导出检查位于 `temp/webtest-tools-smoke/`。这些目录均不提交，保留在当前工作区便于复查。全部验收夹具服务已停止，没有残留进程。

## 验证边界

本机为 Windows，未提供 Docker、WSL2 或 Lightpanda；浏览器实际执行尚未验证。Lightpanda 官方仅提供 Linux/macOS 平台支持，Windows 安装指南使用 Docker 或 WSL2；适配器不自动切换到其它浏览器。独立验证已核对 [官方仓库](https://github.com/lightpanda-io/browser) 和 [Playwright CDP 文档](https://lightpanda.io/docs/usage/cdp/playwright)。

本轮没有目标 Spring Boot + Vue 业务应用或 MySQL/PostgreSQL 实例。HTTP/SQL 执行能力使用真实临时 HTTP 服务和 SQLite 验证；不代表完成某个业务项目的需求覆盖或 Spring Security profile 验证。MySQL/PostgreSQL 为可选驱动支持，尚未连接实际实例。

Lightpanda 无图形渲染。浏览器适配使用 DOM 事件与断言，不能证明布局、视觉样式、像素或真实鼠标行为；此类验收需补充普通浏览器检查。
