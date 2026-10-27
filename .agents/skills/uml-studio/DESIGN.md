# DESIGN.md — 「澄海工作台」视觉系统

> 权威设计令牌与规则见 `docs/uml-studio-redesign.md`（本文件为其持久摘要；冲突以该文档为准）。

## Product
UML Studio 是**离线优先的语义化 UML/架构绘图工作台**：输入结构化 JSON，输出可离线编辑的单文件 HTML 与 SVG/PNG/JPEG/WebP 图片。模型负责语义与结构，组件负责布局、图元、样式及导出；不生成坐标或 draw.io XML。

- 形态：Vue 3 + Vite 打包为 `assets/viewer.js/css`，内联进生成的 HTML；Node CLI（`scripts/diagram.mjs`）可脱离浏览器出图。
- 用户与场景：中文工程师/架构师，内网或离线环境；桌面明亮办公为主，生成物常嵌入文档或随邮件分发。
- 品牌承诺：名称 UML Studio，标语「把复杂，画清楚。」；`lang="zh-CN"`；数据不出浏览器（本地工作台）。
- 离线约束：全部资源内联，无 CDN/远程字体/远程图片；字体仅本机栈；`color-scheme: light`；CSS 中禁 `url(`；纹理只用 `radial-gradient` 点阵、`conic-gradient` 棋盘/loading 等非 url 手段。
- 非目标：非 draw.io 替代品——不做自由拖拽画布、不做模型执行/代码逆向、不做任意 SVG/HTML 注入。
- Surface：工作台单页 = 顶部导航 + 图表侧栏 + 预览画布 + 样式面板 + 表单/JSON 编辑器 + 导出工具条；模式 Operate（任务型工具界面）；图表主题（ocean 等 11 套）是数据特性，独立演进。

## Direction
Operate 模式的现代 SaaS 工具质感：克制中性色 + 单一海洋蓝→青碧品牌色族。柔和弥散阴影、卡片悬停上浮、渐变仅用于 logo 方块与聚焦光环（按钮一律实色）、顶部导航磨砂玻璃。圆角卡片、内联 SVG 图标、全中文文案。反 AI 感：无紫粉渐变、无渐变文字、无 emoji、玻璃仅限导航/移动抽屉。

## Tokens（权威值）
- 中性：`--bg #eef2f6`、`--paper #fff`、`--paper-2 #f4f8fb`、`--ink #1b2b3a`、`--muted #54697d`、`--faint #8ba0b3`、`--line #dbe4ec`、`--line-strong #b9c9d6`
- 品牌：`--brand-from #1668b0` → `--brand-mid #0e93ad` → `--brand-to #0fa79e`（135°）；`--accent #0f6fa3`、`--accent-deep #0b5b87`、`--accent-soft #e9f4fa`、`--accent-line #b8d9ea`、`--ring rgb(14 159 180/.30)`
- 状态：`--danger #c2404f`、`--warning #96650f`、`--success #2e7d5b`（各带 soft/line 变体）
- 阴影：sm/md/lg 三级弥散，浮层只用阴影不描边
- 圆角：6/9/12/16/pill；动效：`cubic-bezier(.22,.8,.32,1)`，140-200ms
- 字体：`"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`（离线，禁 webfont）

## Rules
- 高度二选一：浮层=柔和阴影无描边；平面元素=1px `--line` 无阴影。
- 主按钮=实色 `--accent`+白字+彩色投影，hover `--accent-deep`+`translateY(-1px)`，disabled 用 `color-mix(in srgb,var(--accent),var(--paper) 55%)`；`--gradient-brand` 仅保留于 `.brand-mark`（hover 用 `--gradient-brand-hover`）；outline=白底描边；quiet=透明。
- 图标：24 viewBox、stroke 1.7、currentColor、round caps、aria-hidden。
- 聚焦：`outline 2px var(--accent)` + `box-shadow 0 0 0 5px var(--ring)`。
- 禁：渐变文字、>1px 彩色边条、emoji 图标、装饰性玻璃、远程资源、紫色系。
- 保留：`prefers-reduced-motion`、打印样式、DOM 钩子（`.uml-*`、`data-editor-key`、按钮文案）。
