# 安装与连接

## Python 与项目服务

Python 3.10+。默认 HTTP、SQLite、原生 MCP 客户端只用标准库，无需 pip 安装 Playwright、mcp SDK 或 Chromium。仅有 HTTP/SQL 的 suite 不连接浏览器。

Java/Maven/Gradle、Vue/Node 及包管理器版本以目标项目文档、wrapper、lockfile 为准；内网使用已有镜像及离线缓存。

## 默认：内置 obscura 原生 MCP

`SKILL_DIR/bin/obscura` 已内置 obscura v0.2.7（Windows x86_64，no-render 变体；版本与归档哈希见 `bin/obscura/VERSION.txt`）。它是 Rust＋V8 的无头浏览器，通过 HTTP MCP 提供 `browser_*` 工具，无需 Chromium、Node 或人工下载。官方：[仓库](https://github.com/h4ckf0r0day/obscura)、[MCP 文档](https://github.com/h4ckf0r0day/obscura/blob/main/docs/Use-the-MCP-server.md)。

`mcp_url` 默认 `http://127.0.0.1:8000/mcp`。回环地址无人监听时执行器自动拉起内置二进制（`obscura mcp --http --host 127.0.0.1 --port PORT`），并设置 `OBSCURA_ALLOW_PRIVATE_NETWORK=1` 以允许访问 localhost/局域网被测服务；进程随会话结束终止，日志在 `SKILL_DIR/.webtest/`。已有服务监听同端口时直接连接，tools/list 校验能力，不抢占、不停止外部进程。

```json
{"browser": {"backend": "obscura", "mcp_url": "http://127.0.0.1:8000/mcp"}}
```

```text
python SKILL_DIR/scripts/webtest.py run --suite cases/suite.json --frontend-url http://HOST:5173
```

省略 backend 和地址时使用上述默认值。obscura MCP 是单浏览器服务：没有 Mcp-Session-Id，隔离来自独立进程。连接自启动的外部实例时，结束会调用 `browser_close` 关闭其全部标签页——请使用专用实例。

自动拉起只在回环 mcp_url 生效；`browser.auto_start: false` 关闭。二进制解析顺序：`browser.obscura_bin` → `WEBTEST_OBSCURA_BIN` → `SKILL_DIR/bin/obscura` → PATH。Linux/macOS 需从 [Releases](https://github.com/h4ckf0r0day/obscura/releases) 取对应平台资产放入上述任一位置；内置包可按需替换为渲染变体（截图/PDF 才需要 render 构建）。

手工运行或跨主机部署时：

```sh
obscura mcp --http --host 127.0.0.1 --port 8000 --allow-private-network
```

不带 `--allow-private-network`（或 `OBSCURA_ALLOW_PRIVATE_NETWORK=1`）时 obscura 按 SSRF 防护拒绝 localhost/私网地址。非回环绑定需 `OBSCURA_MCP_TOKEN`（≥32 字节），执行器经 `browser.mcp_token_env` 指定承载 token 的环境变量名，不把凭据写入 URL。CDP 的 `ws://HOST:9222` 不能写为 mcp_url；`obscura serve`（CDP）与 `obscura mcp`（MCP）需不同进程和端口。

## 可选：外部 Lightpanda 原生 MCP

既有 Lightpanda 服务继续可用：`backend: lightpanda` + `mcp_url`。它使用 `goto/evaluate/waitForScript/session_close` 工具名与 Mcp-Session-Id 独立会话；storage 注入走首个 goto 的同源写，没有 `browser_set_storage_state` 的前导航注入。官方：[安装](https://github.com/lightpanda-io/browser#quick-start)、[MCP 参数](https://lightpanda.io/docs/reference/cli/mcp)、[工具](https://lightpanda.io/docs/reference/mcp-tools)。

```sh
LIGHTPANDA_DISABLE_TELEMETRY=true ./lightpanda mcp --host 127.0.0.1 --port 8000 --load-resources stylesheet
```

```json
{"browser": {"backend": "lightpanda", "mcp_url": "http://127.0.0.1:8000/mcp"}}
```

Windows 无官方 Lightpanda 原生二进制，需 Linux 主机、WSL2 或 Docker；PandaScript 只在有 Lightpanda 二进制的环境运行，见 [浏览器执行层](browser-control.md)。

## 可选：保留 Playwright＋CDP

仅显式使用该后端时安装客户端：

```text
python -m pip install "playwright>=1.55,<2"
```

连接已有 CDP，或用内置二进制另起服务：

```sh
SKILL_DIR/bin/obscura/obscura serve --host 127.0.0.1 --port 9222 --allow-private-network
```

```json
{"browser": {"backend": "playwright", "cdp_url": "ws://127.0.0.1:9222"}}
```

```text
python SKILL_DIR/scripts/webtest.py run --suite cases/suite.json --frontend-url http://HOST:5173 --browser-backend playwright --cdp-url ws://HOST:9222
```

旧 suite 只有 cdp_url 时补 backend=playwright。chromium.connect_over_cdp 在此是协议客户端，不启动 Chromium；无需 playwright install chromium。失败不自动切换后端；storage/请求头注入差异见 [服务配置](services.md)。

## 地址可达性

frontend-url 必须能被 Python 和浏览器同时访问。同机默认 127.0.0.1；浏览器在容器或其它主机时，推荐共用宿主局域网 IP（如 http://192.168.1.10:5173），按需配置 Vite host、allowedHosts、代理和 CORS。host.docker.internal 通常仅容器内可解析，不能假定宿主 Python 同样可用。

WSL2 localhost 转发及反向访问 Windows 取决于网络模式。分别核对 Python→MCP/CDP、Python→前端/API、浏览器→前端/API，不能以协议连接成功推定页面可达。

## 数据库驱动

SQLite 无额外依赖。MySQL/PostgreSQL 按需选择一组：

```text
python -m pip install "sqlalchemy>=2,<3" pymysql
python -m pip install "sqlalchemy>=2,<3" "psycopg[binary]>=3,<4"
```

用 suite 的 url_env 环境变量传入 URL，密码需 URL 编码。内网可先准备对应 wheels，再 python -m pip install --no-index --find-links WHEELS ...。requirements.txt 仅含可选说明，默认原生路径无需安装它们。
