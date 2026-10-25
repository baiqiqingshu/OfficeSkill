# 安装与连接

## Python 与项目服务

Python 3.10+。默认 HTTP、SQLite、原生 MCP 客户端只用标准库，无需 pip 安装 Playwright、mcp SDK 或 Chromium。仅有 HTTP/SQL 的 suite 不连接浏览器。

Java/Maven/Gradle、Vue/Node 及包管理器版本以目标项目文档、wrapper、lockfile 为准；内网使用已有镜像及离线缓存。

## 默认：Lightpanda 原生 MCP

使用具备 HTTP MCP、独立会话及所需工具的 Lightpanda。官方：[安装](https://github.com/lightpanda-io/browser#quick-start)、[MCP 参数](https://lightpanda.io/docs/reference/cli/mcp)、[工具](https://lightpanda.io/docs/reference/mcp-tools)。核对实际版本和 mcp --help；nightly/latest 会变化，复现时固定已核验二进制或镜像摘要。

Linux x86_64（glibc）或 Windows 的 WSL2 中：

```sh
curl -L -o lightpanda https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-x86_64-linux
chmod a+x ./lightpanda
./lightpanda version
LIGHTPANDA_DISABLE_TELEMETRY=true ./lightpanda mcp --host 127.0.0.1 --port 8000 --load-resources stylesheet
```

Docker Linux 容器可另起服务。镜像默认 CDP serve，需覆盖命令：

```text
docker run -d --name lightpanda-mcp -p 127.0.0.1:8000:8000 -e LIGHTPANDA_DISABLE_TELEMETRY=true lightpanda/browser:latest /bin/lightpanda mcp --host 0.0.0.0 --port 8000 --load-resources stylesheet
docker logs lightpanda-mcp
```

```json
{"browser": {"backend": "lightpanda", "mcp_url": "http://127.0.0.1:8000/mcp"}}
```

```text
python SKILL_DIR/scripts/webtest.py run --suite cases/suite.json --frontend-url http://HOST:5173 --mcp-url http://127.0.0.1:8000/mcp
```

省略 backend 和地址时使用上述默认值。initialize 获取独立 Mcp-Session-Id，拒绝共享 default；结束只关闭自有会话。ws://HOST:9222 是 CDP，不能写为 mcp_url，也不能假定同端口存在 /mcp。原生服务可在已有 CDP 旁新增，两者页面、cookie、storage 独立。mcp --port 与 --cdp-port 不能组合，共用监听器；两种服务需不同进程和端口。

同机默认绑定 127.0.0.1。远端访问需在 Lightpanda 主机显式使用 --host 0.0.0.0 并开放指定端口；代理鉴权可用 browser.mcp_token_env 指定 bearer token 的环境变量名，不把凭据写入 URL。

Windows 无官方原生二进制，可用已有 Linux 主机、Docker Desktop Linux 容器或 WSL2；不自动安装虚拟化环境。macOS 可用 brew install lightpanda-io/browser/lightpanda；ARM64 使用对应架构包。PandaScript 在有 Lightpanda 二进制的环境运行，见 [浏览器执行层](browser-control.md)。

## 可选：保留 Playwright＋CDP

仅显式使用该后端时安装客户端：

```text
python -m pip install "playwright>=1.55,<2"
```

连接已有 CDP，或另起服务：

```sh
./lightpanda serve --host 127.0.0.1 --port 9222
```

```json
{"browser": {"backend": "playwright", "cdp_url": "ws://127.0.0.1:9222"}}
```

```text
python SKILL_DIR/scripts/webtest.py run --suite cases/suite.json --frontend-url http://HOST:5173 --browser-backend playwright --cdp-url ws://HOST:9222
```

旧 suite 只有 cdp_url 时补 backend=playwright。chromium.connect_over_cdp 在此是协议客户端，不启动 Chromium；无需 playwright install chromium。失败不自动切换后端；storage/请求头注入差异见 [服务配置](services.md)。

## 地址可达性

frontend-url 必须能被 Python 和 Lightpanda 同时访问。容器 127.0.0.1 指容器自身；推荐共用宿主局域网 IP（如 http://192.168.1.10:5173），按需配置 Vite host、allowedHosts、代理和 CORS。host.docker.internal 通常仅容器内可解析，不能假定宿主 Python 同样可用。

WSL2 localhost 转发及反向访问 Windows 取决于网络模式。分别核对 Python→MCP/CDP、Python→前端/API、Lightpanda→前端/API，不能以协议连接成功推定页面可达。

## 数据库驱动

SQLite 无额外依赖。MySQL/PostgreSQL 按需选择一组：

```text
python -m pip install "sqlalchemy>=2,<3" pymysql
python -m pip install "sqlalchemy>=2,<3" "psycopg[binary]>=3,<4"
```

用 suite 的 url_env 环境变量传入 URL，密码需 URL 编码。内网可先准备对应 wheels，再 python -m pip install --no-index --find-links WHEELS ...。requirements.txt 仅含可选说明，默认原生路径无需安装它们。
