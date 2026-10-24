# Obot 内网部署记录

## 部署信息

| 项 | 值 |
|---|---|
| 服务器 | `root@107.155.15.79`（Debian，Docker 29.4.2 + Compose v5.1.3） |
| 访问地址 | http://107.155.15.79:8080 |
| 版本 | v0.27.0（≥ v0.24.0，支持私有 git 仓库 skill 同步） |
| Compose 文件 | `/opt/obot/docker-compose.yml` |
| Bootstrap token | `9cc49901dbb0905ed50721ad98e7f746f4d040dc2816f577`（同时存于 `/root/obot-token.txt`） |
| 数据卷 | `obot-data`（内置 PG + 平台状态） |
| docker.sock | 已挂载，containerized 类型 MCP server 可作为 sibling 容器托管运行 |

## docker-compose.yml

```yaml
services:
  obot:
    image: ghcr.io/obot-platform/obot:latest
    container_name: obot
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - obot-data:/data
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      OBOT_SERVER_ENABLE_AUTHENTICATION: "true"
      OBOT_BOOTSTRAP_TOKEN: "<bootstrap-token>"
      # 必须带 http:// scheme：不带 scheme 时 Obot 会默认补 https://，
      # 导致 bootstrap cookie 带 Secure 标志，HTTP 部署下浏览器拒存、无法登录
      OBOT_SERVER_HOSTNAME: "http://107.155.15.79:8080"
volumes:
  obot-data:
```

## 部署中修复的问题

服务器 `~/.docker/config.json` 中存在一条**失效的 ghcr.io 凭据**，导致 `docker pull ghcr.io/...` 返回 `error from registry: denied`（token 交换 403）。已移除该条认证条目，匿名拉取恢复正常。

## 首次使用

1. 打开 http://107.155.15.79:8080，使用 bootstrap token 登录（自动成为 owner）
2. 尽快配置正式 auth provider（Local 账号密码 / OIDC），bootstrap 登录仅作初始手段
3. Admin → **Skills** → 添加 git 仓库 URL 为 Skill Source
   - 私有仓库：配置 Personal Access Token，或设 `GITHUB_AUTH_TOKEN` 环境变量兜底
   - 支持任意 HTTPS git host（GitHub/GitLab/Gitea/自建）
   - 仓库大小上限默认 100MB，可调 `OBOT_SERVER_GIT_MAX_REPO_SIZE_MB`
4. Admin → MCP Servers → **Git Source URLs** → 添加 MCP catalog 仓库
   - 可先指向官方 `github.com/obot-platform/mcp-catalog` 体验
   - 每个 `*.yaml`/`*.json` 文件定义一个 MCP server entry
   - 凭证（token 等）不进 git，由用户连接时在 Obot 中填写，存入 credential store

## 仓库结构建议（skill + MCP 单仓库混放）

```
repo/
├── skills/
│   ├── skill-a/SKILL.md
│   └── skill-b/SKILL.md
├── catalog/              # MCP server 定义，每文件一个 entry
│   ├── jira.yaml
│   └── wiki-search.yaml
└── .obotcatalogs         # 限定 MCP catalog 扫描范围: catalog/*.yaml
```

注意：MCP catalog 会递归扫描 `*.yaml`，务必用 `.obotcatalogs` 限定范围或 `.ignoreobotcatalogs` 排除 `skills/`，避免 skill 目录中的 yaml 被误识别为 catalog entry。

## 架构说明

- **git 仓库** = 唯一 source of truth：管"有什么、怎么接"（声明式定义 + PR 评审 + 版本）
- **Obot** = 控制面：管"谁能看、谁在用、凭证托管、流量代理"，周期性 pull 仓库同步
- **Agent/用户**：只认 Obot 一个入口
  - 人：Admin UI 浏览、`obot mcp search` CLI 检索
  - Agent：连接 Obot MCP Gateway 统一 endpoint，按权限聚合所有可用 server 的工具
- **vMCP**：可把多个 server 的选定工具合成一个虚拟 MCP server

## 注意事项

- `OBOT_SERVER_HOSTNAME` 已设为 `http://107.155.15.79:8080`（含 scheme）。若后续上域名/HTTPS 必须同步修改此变量为 `https://...`，否则 auth 回调和 MCP 连接 URL 会错误
- 已知问题：bootstrap 登录 cookie 的 `Secure` 标志取决于 serverURL 是否以 `https://` 开头（`pkg/bootstrap/bootstrap.go`）。纯 HTTP 部署必须给 HOSTNAME 显式带 `http://` 前缀，否则浏览器拒存 cookie 导致登录循环
- Docker 单容器模式适合评估/小团队；Power User 角色用户可在宿主机运行任意容器（等价宿主机权限），生产多租户建议迁移 K8s 部署
- Skill/MCP 同步为**定时 pull**，非 webhook push，改动不会立即生效；Admin UI 可手动触发刷新
- CI 中可用 `obot mcp validate-catalog .` 校验 catalog entry
