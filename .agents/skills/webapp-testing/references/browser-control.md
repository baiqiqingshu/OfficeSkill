# 浏览器执行层与内网模型

模型理解业务、编写和修正用例；Python 确定性执行会话、等待、交互和断言。默认通过 HTTP 调用 Lightpanda 原生 MCP，无需 Playwright、Node 或运行时模型。HTTP、浏览器和 SQL 保持同一 suite、同一报告。

## 选择执行方式

| 方式 | 使用场景 | 依赖与会话 |
|---|---|---|
| Python → 原生 MCP（默认） | HTTP＋浏览器＋数据库交替执行 | Python 标准库＋独立 MCP 服务；全 suite 复用自有会话 |
| Python → Playwright → CDP | 保留 CDP；需要前导航 storage 或同源请求头注入 | 显式选择 playwright 并安装 Python 客户端；全 suite 复用自有 context |
| PandaScript | 超长、连续的纯前端阶段；逐动作网络往返成为瓶颈 | 在 Lightpanda 主机运行 lightpanda run；每次独立新会话 |

失败不自动切换后端。MCP 与 Playwright 使用同一 JSON 动作格式，原生键盘等事件行为可能不同，切换后需回归目标控件。PandaScript 不接续混合 suite 的 cookie、storage、页面或变量。

```json
{"browser": {
  "backend": "lightpanda",
  "mcp_url": "http://127.0.0.1:8000/mcp",
  "timeout_ms": 10000,
  "step_timeout_ms": 60000
}}
```

省略 backend 和 mcp_url 时使用上述默认值。`mcp_token_env` 可指定 MCP 服务/代理 bearer token 的环境变量名，与业务 WEBTEST_TOKEN 分开。支持 HTTP POST /mcp 的 JSON 或 SSE 响应，不支持旧式 SSE GET 握手、stdio 或 Cloud 专用传输。

显式保留 CDP 配置：

```json
{"browser": {"backend": "playwright", "cdp_url": "ws://127.0.0.1:9222"}}
```

```text
python SKILL_DIR/scripts/webtest.py run --suite cases/suite.json --frontend-url http://HOST:5173 --mcp-url http://HOST:8000/mcp
python SKILL_DIR/scripts/webtest.py run --suite cases/suite.json --frontend-url http://HOST:5173 --browser-backend playwright --cdp-url ws://HOST:9222
```

旧 suite 只有 cdp_url 时先补 backend: playwright；不会把 CDP 端口猜成 MCP。服务启动见 [安装与连接](install.md)，鉴权差异见 [服务配置](services.md)。

## 编写、等待与失败定位

1. 从 Vue 源码、需求和 analyze 的 ID 线索确认真实控件。使用唯一稳定 ID，动态列表可用 `#order-row-${order_id}`。给能力有限的模型提供当前阶段的源码、ID 清单和动作格式。
2. 改写 [前端示例](../assets/browser-suite.json)，一次提交明确的动作批次。按“填写 → 提交并验证 → 后续操作”分业务阶段，每阶段断言业务结果；多个 browser 步骤复用页面。
3. 先 validate，再 run。结构检查不连接服务，不验证 ID 存在、鉴权或业务预期。模型无需拼 MCP/CDP 报文、反复读取整页 DOM 或维护易失效节点 ref。
4. 失败时读取对应 case/step 的 failed_action.index（从 1 起）、last_state 和限量结构快照，再回查源码及业务结果，不盲重跑已经提交的业务。

动作预算 timeout_ms 默认 10000（1–300000ms），动作可单独覆盖；整个 browser 步骤含首次连接预算 step_timeout_ms 默认 60000（1–600000ms）。失败快照另有最多 1 秒，关闭自有 MCP 会话最多 3 秒；Playwright context/客户端分别最多 3 秒。取消客户端等待不代表服务端撤销动作。

原生 MCP 先只读检查唯一性、DOM 可见、启用、可编辑及选项存在等前置；未就绪时用服务端 waitForScript 等待，再调用官方 click/fill/selectOption/setChecked/press/scroll 一次。文本和值在页面内比较。poll_interval_ms（20–1000ms，默认 100）仅控制 Playwright 轮询；原生使用服务端事件循环等待。

连接核验工具能力并保存 initialize 返回的 Mcp-Session-Id，拒绝共享 default 会话；结束只关闭自有会话，不停止服务。goto 等待 DOMContentLoaded，检查 HTTP 状态、加载超时和最终前端 origin；缺少可验证 HTTP 状态的旧服务报错，需升级。随后仍等待具体业务控件/文本，不以 networkidle 替代业务断言。

重复 ID、错误控件类型及不支持的操作立即失败。点击/输入异常或超时后停止当前批次，该 case 后续步骤跳过；其它 case 与 teardown 遵循 suite 规则。MCP 传输失败后会话标为不确定，拒绝后续浏览器动作，不重连重放。先查 HTTP/数据库核对结果，再决定恢复方式。

报告保留动作类型、序号、selector、耗时和 engine。失败快照最多 20 个结构节点；显式 snapshot 默认 30、上限 80，可限定 ID 子树。省略正文、输入值、HTML、cookie/storage 和原生工具回显。

## 交互边界

动作字段见 [用例格式](suite-format.md)。当前支持顶层普通 DOM；iframe、Shadow DOM、文件上传、拖拽和原生弹窗需要额外适配。Vue 自定义下拉按 ID 点击展开按钮/选项，并断言应用绑定结果。select 数组通过共享 DOM helper 多选，原生 selectOption 仅接受单值。

原生 press 使用官方工具，Enter 可能触发表单默认行为；Playwright 后端只派发 DOM keydown/keyup。两者都不承诺完整硬件输入或 isTrusted。优先点击明确提交按钮并检查业务结果。

suite scroll.x/y 为增量；原生工具为绝对偏移，适配层读取当前位置后换算并核对移动。目标优先使用 scroll 的 selector，旧 schema 通过 waitForSelector 解析 backendNodeId，仅本次动作使用、不缓存。偏移不变明确失败；移动也不证明视觉、虚拟列表、IntersectionObserver 或无限滚动正确。

## PandaScript 独立长流程

从 [脚本示例](../assets/frontend-batch.js) 改写真正的路径、唯一 ID 和预期，在 Lightpanda 所在主机运行：

```text
python SKILL_DIR/scripts/webtest.py pandascript --script cases/frontend-batch.js --executable lightpanda --timeout 120 --output reports/frontend-batch.json
```

执行 lightpanda run SCRIPT.js，不启动 LLM。通过 new Page() 访问动作，只有 goto 需要 await，其余方法同步阻塞。脚本上下文没有 Node、document 或数据库驱动；页面检查用 page.evaluate/waitForScript。进程环境设置 LP_FRONTEND_URL、LP_TOKEN，动作参数使用 $LP_* 占位符。

脚本顶层 return 一个带 status: pass 或 fail 的 JSON 对象，stdout 只输出该对象；调试使用 console.error。包装器要求零退出码及明确业务状态，脱敏后生成独立 JSON 报告，不发布原始 stdout/stderr。超时（1–600 秒）停止直接子进程，不重放；wrapper 启动的远端进程树不保证同步停止。当前不提供 PandaScript 与混合 suite 的共享会话桥接，跨系统 HTTP/SQL 断言继续用 suite。

## 开源参考与维护验证

参考 [agent-browser skill](https://github.com/vercel-labs/agent-browser/blob/main/skills/agent-browser/SKILL.md) 的批次、持续会话、紧凑状态模式，以及 [Lightpanda 官方 skill](https://github.com/lightpanda-io/agent-skill) 和 [PandaScript 子 skill](https://github.com/lightpanda-io/agent-skill/blob/main/pandascript/SKILL.md) 的原生路线。agent-browser 可用于探索，执行本 suite 无需安装。没有复制上游源码或修改全局 MCP 配置。

协议依据（2026-10-26 核对）：[HTTP MCP](https://lightpanda.io/docs/usage/mcp)、[工具参考](https://lightpanda.io/docs/reference/mcp-tools)、[PandaScript](https://lightpanda.io/docs/reference/pandascript)。记录实际版本，核对 mcp --help 及 tools/list；原生 MCP 减少 Python 依赖，PandaScript 减少逐动作往返，速度须在目标页面和网络上实测。

```text
python -m unittest discover -s SKILL_DIR/tests -p test_*.py -v
npm install --prefix temp/webtest-dom --no-save --ignore-scripts jsdom@27
```

```powershell
$env:NODE_PATH = (Resolve-Path temp/webtest-dom/node_modules).Path
node SKILL_DIR/tests/test_browser_dom.cjs
$env:WEBTEST_LIGHTPANDA_MCP = 'http://127.0.0.1:8000/mcp'
# 可选，安装 Playwright 客户端后同时回归 CDP
$env:WEBTEST_LIGHTPANDA_CDP = 'ws://127.0.0.1:9222'
$env:WEBTEST_LIGHTPANDA_HOST = '192.168.1.10'
python -m unittest discover -s SKILL_DIR/tests -p test_lightpanda.py -v
```

真实冒烟只启动并关闭临时 HTTP fixture，不管理 Lightpanda。HOST 必须同时可被 Python 与浏览器访问。未设置对应端点时明确 skipped；本地协议 fixture/jsdom 通过不等于真实 Lightpanda 或目标业务通过。
