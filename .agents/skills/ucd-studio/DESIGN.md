# DESIGN.md — ucd-studio 视觉系统

> 权威契约：`docs/frontend-redesign.md` §0/§2、`docs/frontend-redesign-r2.md` §2。本文件为持久摘要。

## Tokens（styles.json 每主题）
- `radius` 10px（面板/卡片）；控件圆角 `--control-radius` 8px；`--r-pill` 999px。
- 扩展 token：`surface-2`（凹陷面：表头、井区、骨架底）、`line-strong`（hover 描边）、`shadow`（卡片/面板弥散阴影）、`shadow-pop`（dialog/toast 浮层）、`ring`（聚焦光环 = primary 透明化，浅色 .28，midnight .35）。

## Rules
- 标题阶：页面标题 20px/650（窄屏同）、面板 15px/600、次级 14px/600；正文 14、控件 13、辅助 12px muted；表头 12px/600 + `surface-2`；数字 `tabular-nums`；KPI `.stat-value` 30px/650。
- 间距 4px 基准：comfortable 面板头 16px 24px / 内容 24px、栅格 gap 24px、表格单元格 12px 24px；compact 12px 16px / 16px、10px 16px；760px 统一 12px 16px / 16px。过渡统一 `var(--motion)`（160ms ease-out）。
- 高度二选一：面板/卡片/浮层 `box-shadow:var(--shadow*)` 不描边；输入、行分隔、details 用 1px `var(--border)` 无阴影。
- 顶栏 sticky + `backdrop-filter` 磨砂（仅顶栏允许磨砂）；侧栏实色。
- `.btn-primary` 实色 `var(--primary)`，hover `color-mix` 加深 + `translateY(-1px)` + 品牌色投影；渐变仅限 `.brand-mark` logo 方块。
- 交互卡（`.task`/`.item-card`）hover `translateY(-2px)` + 阴影加深；`.stats-grid` 整卡阴影不逐格上浮。
- select 统一 `<span class="select-wrap">` + chevron SVG（`appearance:none`）；搜索框 `.input-wrap` + 放大镜 SVG；`details/summary` 自绘 chevron 旋转；面包屑用 `.crumb-sep` SVG 分隔符。
- 图标全内联 SVG（stroke 1.6、currentColor）；`focus-visible` outline + `var(--ring)` 光环；滚动条 thin；`::selection` 用 `soft`。
- badge 五类语义色收敛：默认 primary / `.success` / `.warning` / `.danger` / `.neutral`，pill + 12px/500。
- 禁：emoji 图标、渐变文字、业务内容渐变、远程资源、CSS `url(`。
- 保留：全部类名与 `data-*` 钩子、`dense`、1180/760px 断点、44px 触达、`prefers-reduced-motion`、`component:` 注释块。
