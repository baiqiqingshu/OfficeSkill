# Tech Poster JSON Schema 参考

本文档定义 `tech-poster` 的完整输入结构、4 套主题和 10 种栏目规范。

## 顶层结构

```json
{
  "version": 1,
  "theme": "blueprint",
  "background": "everest-blue",
  "width": 1080,
  "brand": {
    "kicker": "内网基础架构 · 技术分享",
    "badge": "v2.4 · 内部公开",
    "org": "平台工程部"
  },
  "title": "ArkGateway 统一 API 网关架构与接入指南",
  "subtitle": "面向内网微服务集群的高性能流量入口，集动态路由、统一鉴权、熔断限流与全链路观测于一体",
  "meta": [
    { "label": "适用对象", "value": "后端研发 / SRE / 架构师" },
    { "label": "运行环境", "value": "内网 K8s 集群 · 离线部署" },
    { "label": "文档版本", "value": "2026.11" }
  ],
  "tags": ["微服务网关", "动态路由", "零信任鉴权", "可观测性"],
  "sections": [ ... ],
  "footer": {
    "left": "平台工程部 · 内部技术分享材料（请勿外传）",
    "right": "维护群：内网 IM #arch-gateway · 文档编号 ARCH-GW-2026"
  }
}
```

### 顶层字段说明
- `title`（必填）：海报主标题。
- `subtitle`（可选）：一句话副标题，解释框架或组件的核心价值。
- `theme`（可选）：`"blueprint"`（默认）| `"slate-dark"` | `"paper-tech"` | `"emerald-ops"`。
- `background`（可选）：`"everest-blue"`（默认：珠峰蓝）| `"everest-night"` | `"blueprint-grid"` | `"dot-matrix"` | `"circuit-board"` | `"topo-contour"` | `"aurora-mesh"` | `"clean-slate"`。
- `width`（可选）：逻辑画布宽度（px），默认 `1080`，建议 `900`~`1200`。
- `brand`（可选）：顶栏眉标 `{ kicker, badge, org }`。
- `meta`（可选）：顶栏元数据键值对数组 `[{ label, value }]`。
- `tags`（可选）：顶栏关键词标签字符串数组。
- `sections`（必填，至少 1 项）：栏目数组，每个栏目共享基础字段：
  - `id`（可选）：栏目锚点标识
  - `kicker`（可选）：栏目英文/分类副眉（不填则自动用类型标签）
  - `title`（必填）：栏目标题
  - `subtitle`（可选）：栏目简短说明
  - `type`（必填）：栏目类型（见下表）
  - `imageFile`（可选）：本地图片相对/绝对路径，构建时自动 Base64 内联
  - `imageCaption`（可选）：内联图片的图注
- `footer`（可选）：底部信息 `{ left, right }`。

---

## 栏目类型详述

### 1. `overview` — 概览与核心指标

```json
{
  "type": "overview",
  "title": "为什么建设 ArkGateway",
  "summary": "替代分散在各业务线的 Nginx 手工配置，收敛入口治理，降低接入与排障成本。",
  "metrics": [
    { "value": "120k+", "label": "单集群峰值 QPS", "note": "P99 < 4.2ms" },
    { "value": "< 2s", "label": "配置热生效耗时", "note": "无连接中断" },
    { "value": "38 个", "label": "已接入核心业务域", "note": "覆盖 96% 内网流量" },
    { "value": "0 依赖", "label": "内网完全离线运行", "note": "无外网调用" }
  ],
  "highlights": [
    "声明式路由 CRD：配置即代码，支持 GitOps 审批与一键回滚",
    "插件热插拔：鉴权、限流、灰度发布按路由粒度动态编排"
  ]
}
```

### 2. `cards` — 特性 / 模块能力卡片网格

```json
{
  "type": "cards",
  "title": "核心能力矩阵",
  "columns": 2,
  "items": [
    {
      "badge": "ROUTING",
      "title": "多维度动态路由",
      "desc": "支持按 Host、Path、Header、Cookie 权重分流，原生兼容金丝雀与蓝绿发布。",
      "tags": ["前缀/正则匹配", "按比例灰度", "秒级生效"],
      "accent": "primary"
    }
  ]
}
```
- `columns`: `2`（默认）或 `3`。
- `accent`: `"primary"` | `"secondary"` | `"success"` | `"warn"`（可选）。

### 3. `layers` — 分层架构图

```json
{
  "type": "layers",
  "title": "系统分层架构",
  "layers": [
    {
      "name": "流量接入层",
      "desc": "四层负载均衡与 TLS 卸载",
      "tone": "primary",
      "modules": [
        { "name": "LVS / Keepalived", "detail": "VIP 高可用" },
        { "name": "TLS 终结", "detail": "内网国密/RSA 证书" }
      ]
    },
    {
      "name": "数据面核心",
      "desc": "请求编排与插件执行链",
      "tone": "secondary",
      "modules": [
        { "name": "路由匹配器", "detail": "RadixTree O(k)" },
        { "name": "鉴权插件", "detail": "JWT / mTLS / RBAC" },
        { "name": "限流熔断", "detail": "令牌桶 + 异常摘除" }
      ]
    }
  ],
  "sidebars": [
    {
      "name": "横切支撑体系",
      "items": ["Prometheus 指标", "OpenTelemetry 追踪", "结构化审计日志", "配置中心同步"]
    }
  ]
}
```

### 4. `flow` — 内置离线 SVG 流程图

零外部依赖的纯 SVG 流程图引擎，支持水平（`LR`）和竖向（`TB`）两种布局、节点类型区分和分支回环连线：

```json
{
  "type": "flow",
  "title": "请求处理主链路",
  "direction": "LR",
  "steps": [
    { "id": "client", "title": "内网调用方", "subtitle": "HTTP/gRPC", "kind": "start" },
    { "id": "auth", "title": "统一鉴权", "subtitle": "校验 Token/权限", "kind": "process" },
    { "id": "check", "title": "触发限流？", "subtitle": "QPS/并发阈值", "kind": "decision" },
    { "id": "reject", "title": "返回 429", "subtitle": "记录限流日志", "kind": "end" },
    { "id": "route", "title": "动态路由转发", "subtitle": "负载均衡/重试", "kind": "service" },
    { "id": "upstream", "title": "上游微服务", "subtitle": "业务处理", "kind": "db" }
  ],
  "edges": [
    { "from": "client", "to": "auth" },
    { "from": "auth", "to": "check", "label": "通过" },
    { "from": "check", "to": "reject", "label": "超限", "style": "warn" },
    { "from": "check", "to": "route", "label": "放行", "style": "success" },
    { "from": "route", "to": "upstream" }
  ],
  "caption": "注：鉴权失败直接返回 401/403，不进入下游限流与路由阶段。"
}
```
- `kind`: `"start"` | `"process"` | `"decision"` | `"service"` | `"db"` | `"end"`。
- `edges[].style`: `"default"` | `"success"` | `"warn"` | `"dashed"`。
- 自动分层排布（支持主链路与分支节点并列，超过单行宽度自动换行或用 `TB` 竖排）。

### 5. `diagram` — 现成图表 / 图片嵌入（SVG / PNG / JPG / WebP）

适合将已有的架构图、流程图、时序图、泳道图、界面截图等现成本地图片直接嵌入海报。本 skill 独立运行，不依赖任何第三方绘图工具；构建时 `.svg` 默认清洗后直接内联矢量代码（也可 `embedMode: "datauri"`），`.png`/`.jpg`/`.webp` 自动转为 Base64 Data URI 写入 HTML，确保单文件离线分发不丢图。

单图模式：
```json
{
  "type": "diagram",
  "title": "配置热更新时序图",
  "file": "./diagrams/config-sync.svg",
  "surface": "light",
  "caption": "控制面推送至全集群数据面平均耗时 < 800ms，支持版本校验与失败自动回滚。"
}
```

多图并排模式（最多 2 列）：
```json
{
  "type": "diagram",
  "title": "核心交互与部署视图",
  "columns": 2,
  "surface": "light",
  "items": [
    { "file": "./diagrams/flow.png", "title": "请求转发流程", "caption": "入口校验与限流" },
    { "file": "./diagrams/deploy.svg", "title": "双活部署拓扑", "caption": "同城双机房容灾" }
  ]
}
```
- `file`：本地图片路径（支持 `.svg`、`.png`、`.jpg`、`.jpeg`、`.webp`；相对路径基于输入 JSON 所在目录解析，禁止 `http://`/`https://` 远程地址）。
- `svg`：也可直接传入内联 `<svg>...</svg>` 字符串。
- `surface`：画框背景 `"auto"`（默认，跟随主题）| `"light"`（强制纯白画框，适合在 `slate-dark` 暗夜主题下嵌入白底 PNG/SVG 图表，避免白底黑字突兀或透明底文字看不清）| `"transparent"`。
- `maxHeight`：可选限制最大展示高度（px，如 `680`），防止超大图撑爆版面。

### 6. `timeline` — 编号时间轴 / 阶段步骤

```json
{
  "type": "timeline",
  "title": "业务服务接入四步法",
  "items": [
    {
      "step": "01",
      "title": "注册服务与健康检查",
      "tag": "5 分钟",
      "desc": "在内网控制台登记 Upstream 集群与探活路径。",
      "bullets": ["支持 K8s Service 自动发现", "配置主动/被动摘除阈值"]
    }
  ]
}
```

### 7. `compare` — 对比矩阵表

```json
{
  "type": "compare",
  "title": "与传统 Nginx 手工维护对比",
  "headers": ["对比维度", "传统 Nginx 配置", "ArkGateway（推荐）"],
  "highlightCol": 2,
  "rows": [
    { "cells": ["路由变更方式", "SSH 改配置 + reload", "控制台/GitOps 声明式热更新"] },
    { "cells": ["鉴权与限流", "各业务重复造轮子", "统一插件链，分钟级复用"], "emphasis": true }
  ]
}
```

### 8. `code` — 代码 / 配置示例（内置离线高亮）

```json
{
  "type": "code",
  "title": "声明式路由配置示例",
  "language": "yaml",
  "filename": "route-order-api.yaml",
  "code": "apiVersion: gateway.internal/v1\nkind: HttpRoute\nmetadata:\n  name: order-service-route\nspec:\n  hosts: [\"order.internal.corp\"]\n  plugins:\n    jwtAuth: { enabled: true }\n    rateLimit: { qps: 2000, burst: 400 }",
  "annotations": [
    { "title": "统一域名规范", "desc": "所有内网服务走 *.internal.corp，由网关自动下发内网证书。" },
    { "title": "声明式插件", "desc": "无需改业务代码即可启用鉴权与令牌桶限流。" }
  ]
}
```

### 9. `callout` — 最佳实践与避坑指南

```json
{
  "type": "callout",
  "title": "生产上线避坑指南",
  "items": [
    {
      "tone": "tip",
      "title": "推荐做法",
      "points": ["所有写接口必须配置幂等 Key 与合理超时时间", "灰度发布先切 5% 流量观察 10 分钟"]
    },
    {
      "tone": "warn",
      "title": "常见风险",
      "points": ["禁止对非幂等 POST 请求开启自动重试", "单路由响应体超过 20MB 需走对象存储直传"]
    }
  ]
}
```
- `tone`: `"info"` | `"tip"` | `"warn"` | `"danger"`。

### 10. `qa` — 常见问题速查

```json
{
  "type": "qa",
  "title": "高频问题速查",
  "items": [
    { "q": "配置发布后旧连接会被强行断开吗？", "a": "不会。路由表采用双缓冲原子切换，长连接与在途请求平滑完成。" }
  ]
}
```
