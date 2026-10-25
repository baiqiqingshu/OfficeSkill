# 安装与连接

## Python 与后端快速接口验证

要求 Python 3.10+。HTTP 使用 `urllib`，SQLite 使用 `sqlite3`，无需第三方包。仅执行后端接口时直接运行 suite；不要为了此功能安装浏览器或替换项目原有构建工具。

```text
python SKILL_DIR/scripts/webtest.py run --suite cases/suite.json --frontend-url http://127.0.0.1:5173 --api-url http://127.0.0.1:8080/api --token TOKEN
```

后端 Java 与 Maven/Gradle 版本以目标项目文档/wrapper 为准，Vue 的 Node 版本和包管理器同理。首次准备依赖可运行项目已有的 `mvnw`/`gradlew` 和 lockfile 对应安装命令。内网使用已有 Maven/npm/Python 镜像和离线缓存，不依赖本 skill 自带 Java/Node。

## Lightpanda

官方来源（2026-10-26 核对）：[仓库安装说明](https://github.com/lightpanda-io/browser#quick-start)、[Playwright CDP](https://lightpanda.io/docs/usage/cdp/playwright)、[Docker 镜像](https://hub.docker.com/r/lightpanda/browser)。nightly/latest 会变化；复现环境应记录实际版本并固定镜像摘要或已核验二进制。

Python 客户端只安装 Playwright 包，不下载 Chromium：

```text
python -m pip install "playwright>=1.55,<2"
```

Docker（Linux 容器）快速启动：

```text
docker run -d --name lightpanda -p 127.0.0.1:9222:9222 -e LIGHTPANDA_DISABLE_TELEMETRY=true lightpanda/browser:latest
docker logs lightpanda
```

Linux x86_64（glibc）或 Windows 的 WSL2 中：

```sh
curl -L -o lightpanda https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-x86_64-linux
chmod a+x ./lightpanda
./lightpanda version
LIGHTPANDA_DISABLE_TELEMETRY=true ./lightpanda serve --log-format pretty --log-level info --host 127.0.0.1 --port 9222
```

Windows 没有官方原生二进制。WSL2 未安装时，用户可按 [Microsoft 文档](https://learn.microsoft.com/en-us/windows/wsl/install) 安装，或使用 Docker Desktop 的 Linux 容器；skill 不自动安装系统虚拟化环境。macOS 可用 `brew install lightpanda-io/browser/lightpanda`。ARM64 使用官方对应架构包。

连接配置为 `browser.cdp_url: "ws://127.0.0.1:9222"`。Playwright 的 `chromium.connect_over_cdp` 是协议客户端，本 skill 没有启动 Chromium。Lightpanda 的 CDP/DOM 实现仍可能与目标 Vue 控件不兼容；报告具体失败，不把替代浏览器结果冒充 Lightpanda 通过。

### 宿主、容器与前端 URL

传入的 `--frontend-url` 必须同时可被 Python 客户端和 Lightpanda 访问。Docker 的 `127.0.0.1` 指向容器自身；推荐使用双方均可访问的宿主局域网 IP，例如 `http://192.168.1.10:5173`，并让 Vue/Vite 监听可访问地址。`host.docker.internal` 通常仅容器内可解析，不能假定宿主 Python 同样可访问；只有客户端也能解析且访问该域名时才共用它。Linux Docker 可加 `--add-host=host.docker.internal:host-gateway`。按目标项目需要配置 Vite `server.host`、allowedHosts、代理和 CORS。

WSL2 通常将其 localhost CDP 转发给 Windows 客户端。反向访问 Windows 前端受 WSL 网络模式影响，必要时使用宿主 IP。Python、Lightpanda、前端与后端的地址可达性要分别核对，不能仅凭 CDP 连接成功推定前端可达。

## 数据库驱动

SQLite 无额外依赖；MySQL 与 PostgreSQL 通过 SQLAlchemy 可选连接：

```text
python -m pip install "sqlalchemy>=2,<3" pymysql
python -m pip install "sqlalchemy>=2,<3" "psycopg[binary]>=3,<4"
```

按需选择其中一组。连接字符串通过 suite 中 `url_env` 指向的环境变量配置，例如 `mysql+pymysql://...`、`postgresql+psycopg://...`；密码需要 URL 编码。只连接用户指定的测试数据库。URL 与密码不写入用例文件。

内网可在联网环境准备 wheel，再执行 `python -m pip install --no-index --find-links WHEELS -r requirements.txt`；该文件中可选依赖按说明启用或单独安装。HTTP/SQLite 路径不要求安装全部可选依赖。
