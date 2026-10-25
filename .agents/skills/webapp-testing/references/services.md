# 服务、鉴权与运行配置

## 地址与 token

`--frontend-url` 接受 `http://HOST:5173` 或 `HOST:5173`；后端默认使用前端同源 `/api` 代理，suite 的 `api_base` 可改。独立后端使用 `--api-url http://HOST:8080/api`。HTTP step 的 `path` 追加至 API 基地址。

```text
python SKILL_DIR/scripts/webtest.py run --suite cases/suite.json --frontend-url http://127.0.0.1:5173 --token TOKEN
```

推荐环境变量 `WEBTEST_TOKEN`，避免命令历史存储；未传 CLI token 时执行器读取它。`auth` 定义 `mode`（token/none）、`header`、`prefix`。无需鉴权时显式设 `mode: none`，不要用假 token。

浏览器可用 `browser.storage.localStorage` 或 `sessionStorage` 设置 `${token}`，按实际 Vue 项目的 token 键及序列化格式修改。执行器在前端同源请求上按 auth 添加请求头；跨域 API 的鉴权应由前端应用自身的 token 注入逻辑处理，避免将 token 发送给其它站点。遇到 HttpOnly cookie/复杂登录流程，应通过目标项目已有登录接口或页面完成，不宣称 token 存储能替代所有登录方式。

若需要关闭鉴权，先查项目已有 local/test profile。只有用户明确授权且目标为隔离测试环境时才启用；新增绕过应限制于该 profile、带明确默认关闭开关。不要修改默认 SecurityFilterChain、生产配置或全局 `permitAll`。无此授权时保留鉴权并要求 token。

## 启停服务

顶层 `services` 为名称到配置的映射。仅在指定 `--start-services` 或 `services start` 时启动，默认运行后保留。

```json
{
  "services": {
    "backend": {
      "command": ["./mvnw", "spring-boot:run", "-Dspring-boot.run.profiles=local"],
      "cwd": "../backend",
      "env": {"SPRING_PROFILES_ACTIVE": "local"},
      "ready_url": "http://127.0.0.1:8080/actuator/health",
      "startup_timeout": 120
    },
    "frontend": {
      "command": ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"],
      "cwd": "../frontend",
      "ready_url": "http://127.0.0.1:5173",
      "startup_timeout": 60
    }
  }
}
```

路径相对 suite 所在目录。Windows 使用项目的 `mvnw.cmd`/`gradlew.bat` 和 `npm.cmd`，例如后端 `command: ["cmd.exe", "/c", "mvnw.cmd", "spring-boot:run", "-Dspring-boot.run.profiles=local"]`，前端 `command: ["cmd.exe", "/c", "npm.cmd", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]`。先在对应 cwd 验证 wrapper 路径，命令以 argv 数组表达。`ready_url` 选择项目已有健康检查或无副作用可访问 URL；需要 token 的探针应调整为项目许可的本地就绪端点。启动前装好项目依赖，不把安装命令塞进每次启动。

```text
python SKILL_DIR/scripts/webtest.py services start --suite cases/suite.json
python SKILL_DIR/scripts/webtest.py services status --suite cases/suite.json
python SKILL_DIR/scripts/webtest.py services stop --suite cases/suite.json
```

使用相同 suite 和 `--state-dir` 管理同一批服务；不按端口清杀进程。告知用户前端/后端访问地址、数据标记、服务日志、状态目录和报告目录。仅本工具创建的进程受 stop 管理，连接已有服务不会取得它们的所有权。

## 数据库

连接信息使用环境变量：

```json
{"databases": {"main": {"url_env": "TEST_DATABASE_URL"}}}
```

URL 示例：`sqlite:///./feature-test.db`、`mysql+pymysql://USER:PASSWORD@HOST:3306/DB`、`postgresql+psycopg://USER:PASSWORD@HOST:5432/DB`。具体相对路径按执行器解析规则确认；跨目录复现建议 SQLite 使用绝对路径。

SQL 步骤支持单条命名参数语句，放在 setup、cases 或 teardown。查询通过 `row_count`/`rows` 检查持久化状态。每条写操作提交以便用户同时观察，整个 suite 不自动事务回滚；teardown 只执行显式写出的定向清理。业务操作失败时清理仍尽力执行，清理失败会使报告失败。

## 导出

```text
python SKILL_DIR/scripts/webtest.py export --suite cases/suite.json --output delivery/feature
python delivery/feature/run.py --frontend-url http://HOST:5173 --token TOKEN
```

导出包含执行入口/模块、suite、引用的 SQL、依赖说明和 RUN.md。目标目录需为空。SQL 文件必须是 suite 目录内部的 `.sql`，导出会拷贝并重写路径。不会复制目标 Java/Vue 应用、数据库或密码。服务 cwd 转为源项目绝对路径，同机器可启动；跨机器默认连接已启动服务，或先调整 services 路径。

导出拒绝常见凭据字段的字面量、带密码 URL 与私钥；这不等于完整数据分类。仍需检查请求体、SQL 文件是否包含敏感数据。不要通过跳过校验把实际 token 放入包。
