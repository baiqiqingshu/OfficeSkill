# DESIGN.md — 「砚松」视觉系统

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
Operate 模式的现代 SaaS 工具质感：暖纸底 + 石墨墨黑主按钮 + 松绿实色强调的「砚松」（Inkstone Pine）世界。柔和弥散阴影、卡片悬停上浮、渐变仅用于 logo 方块、聚焦光环与顶栏发丝线（按钮一律实色）、顶部导航磨砂玻璃。圆角卡片、内联 SVG 图标、全中文文案。反 AI 感：无紫粉渐变、无渐变文字、无 emoji、玻璃仅限导航/移动抽屉。

## Tokens（权威值）
- 中性：`--bg #f3f2ee`（暖纸）、`--paper #fff`、`--paper-2 #f6f5f1`、`--ink #20242c`、`--muted #5b6370`、`--faint #969da9`、`--line #e4e2db`、`--line-strong #c5cad2`
- 品牌：`--brand-from #0a5a48` → `--brand-to #13a07c`（135°，仅 logo/聚焦/发丝线）；`--primary #1f2430`、`--primary-hover #38404e`（墨黑主按钮）；`--accent #0d6e55`、`--accent-deep #0a5843`、`--accent-soft #e9f4f0`、`--accent-line #bcdfd2`、`--ring rgb(13 110 85/.25)`
- 状态：`--danger #bf4234`、`--warning #8f5f0e`、`--success #2e7d58`（各带 soft/line 变体）
- 阴影：sm/md/lg 三级弥散 `rgb(33 36 44/…)`，浮层只用阴影不描边
- 圆角：6/9/12/16/pill；动效：`cubic-bezier(.22,.8,.32,1)`，140-200ms
- 字体：`"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`（离线，禁 webfont）

## Rules
- 高度二选一：浮层=柔和阴影无描边；平面元素=1px `--line` 无阴影。
- 主按钮 `.button-dark`=`--primary` 实色白字，hover `--primary-hover`+`translateY(-1px)`+`--shadow-sm`；`.button-accent`=`--accent` 实色，hover `--accent-deep`；outline=白底描边；quiet=透明；disabled 用 `color-mix` 淡化、无投影无位移。`--gradient-brand` 仅 `.brand-mark` 与顶栏 2px 发丝线（`::after`）。
- 图标：24 viewBox、stroke 1.6–1.7、currentColor、round caps、aria-hidden；select 箭头=`.select-wrap`+`.select-chevron` 内联 SVG（`appearance:none`，禁 `url(` 背景）。
- 下拉统一用 `src/VSelect.vue`（用法同原生 `<select>`：`v-model`/`v-model.number` 或 `:value`+`@change`，插槽写 `<option>`/`<optgroup>`）：真实 select 隐藏保留为数据/校验层，自绘触发按钮+`fixed` 弹层（选中态 `--accent-soft`，分组标题 `--faint`），支持键盘导航、typeahead、翻转会出界时向上展开。
- 聚焦：`outline 2px var(--accent)` + `box-shadow 0 0 0 4px var(--ring)`。
- 磨砂玻璃仅 `.studio-header`（`blur(14px) saturate(1.4)` + `rgb(255 255 255/.74)`）与窄屏抽屉；`::selection`=`--accent-soft`。
- 禁：渐变文字、>1px 彩色边条、emoji 图标、装饰性玻璃、远程资源、紫色系、`url(`。
- 保留：`prefers-reduced-motion`、打印样式、DOM 钩子（`.uml-*`、`data-editor-key`、按钮文案）。
