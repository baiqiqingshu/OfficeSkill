# DESIGN.md — 「澄海工作台」视觉系统

> 权威设计令牌与规则见 `docs/uml-studio-redesign.md`（本文件为其持久摘要；冲突以该文档为准）。

## Direction
Operate 模式的现代 SaaS 工具质感：克制中性色 + 单一海洋蓝→青碧品牌色族。柔和弥散阴影、卡片悬停上浮、渐变仅用于品牌区/主按钮/聚焦态、顶部导航磨砂玻璃。圆角卡片、内联 SVG 图标、全中文文案。反 AI 感：无紫粉渐变、无渐变文字、无 emoji、玻璃仅限导航/移动抽屉。

## Tokens（权威值）
- 中性：`--bg #eef2f6`、`--paper #fff`、`--paper-2 #f4f8fb`、`--ink #1b2b3a`、`--muted #54697d`、`--faint #8ba0b3`、`--line #dbe4ec`、`--line-strong #b9c9d6`
- 品牌：`--brand-from #1668b0` → `--brand-mid #0e93ad` → `--brand-to #0fa79e`（135°）；`--accent #0f6fa3`、`--accent-deep #0b5b87`、`--accent-soft #e9f4fa`、`--accent-line #b8d9ea`、`--ring rgb(14 159 180/.30)`
- 状态：`--danger #c2404f`、`--warning #96650f`、`--success #2e7d5b`（各带 soft/line 变体）
- 阴影：sm/md/lg 三级弥散，浮层只用阴影不描边
- 圆角：6/9/12/16/pill；动效：`cubic-bezier(.22,.8,.32,1)`，140-200ms
- 字体：`"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`（离线，禁 webfont）

## Rules
- 高度二选一：浮层=柔和阴影无描边；平面元素=1px `--line` 无阴影。
- 主按钮=品牌渐变+白字+彩色投影；outline=白底描边；quiet=透明。
- 图标：24 viewBox、stroke 1.7、currentColor、round caps、aria-hidden。
- 聚焦：`outline 2px var(--accent)` + `box-shadow 0 0 0 5px var(--ring)`。
- 禁：渐变文字、>1px 彩色边条、emoji 图标、装饰性玻璃、远程资源、紫色系。
- 保留：`prefers-reduced-motion`、打印样式、DOM 钩子（`.uml-*`、`data-editor-key`、按钮文案）。
