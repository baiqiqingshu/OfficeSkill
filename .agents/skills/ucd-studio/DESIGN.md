# DESIGN.md — ucd-studio 视觉系统

> 权威契约：`docs/frontend-redesign-r4.md` §1/§2。本文件为持久摘要；前三轮（含 r3"暖纸工作台"）规范已全部作废。

## 设计世界

"霁蓝瓷面"（Porcelain Sapphire）：冷调瓷白工作区 + 蓝宝石品牌实色 + 磨砂玻璃顶栏。
质感来自两层弥散阴影、留白与 pill 形态；白色面板仅以阴影浮于瓷面，不描边。
中性阶一律带各主题色相（ocean 为蓝灰 slate 系，不用纯灰）。

## Tokens（styles.json 每主题）

- `radius` 14px（面板/卡片/弹窗/井区）；控件 `--control-radius` 10px；`--r-pill` 999px
  （导航项、徽章、tabs 容器、chip、开关、toast）。
- 中性阶：`bg` 瓷面底（ocean `#f4f6f9`）、`surface` 内容面（`#ffffff`）、`surface-2`
  凹陷面（侧栏轨道、表头、看板井区、骨架底、分段控件槽）、`border` 1px 低对比边界、
  `line-strong` 控件 hover 描边、`ink`/`muted` 带蓝灰色相的正文与辅助文字。
- 高度：`shadow` 两层弥散（`0 1px 2px ink/.04` + `0 16px 40px -16px ink/.12`，rgb 取各主题
  ink 色相）；`shadow-pop` 浮层加深至 ≤.22（dialog/toast/hover）。面板与卡片只用阴影不描边；
  输入、分隔线、details 只用 1px `border`。
- `ring` 聚焦光环（primary 透明化，浅色 .26、midnight .35、contrast .32）；
  `scheme` light/dark 驱动原生控件 color-scheme 与 option 配色。
- 语义色柔和可辨：success/warning/danger 各有文字 + `-soft` 背景对。

## Rules

- 标题阶：页面标题 21px/650/-0.015em、面板 15px/600、次级 14px/600、弹窗 17px/640；
  正文 14px/1.65、控件 13px、辅助 12px muted；表头 12px/600 + letter-spacing .02em +
  `surface-2`；数字 `tabular-nums`；KPI `.stat-value` 28px/640。层级靠字重 + 灰度。
- 间距 4px 基准：comfortable 面板头 20px 24px / 内容 24px、栅格 gap 24px、表格单元格
  12px 24px；compact 12px 16px / 16px、10px 16px；760px 统一 14px 16px / 16px。
  过渡 `var(--motion)`（180ms cubic-bezier(.3,.7,.3,1)）。
- 骨架：224px 侧栏（`surface-2` 凹陷轨道，全站统一）+ 52px 磨砂顶栏
  （`blur(14px) saturate(1.45)` + `bg` 76% 不透明底 + 底部 2px 品牌渐变发丝线）；
  1180px 收紧 200px；760px 侧栏转横向 pill 导航。
- 侧栏导航一律 pill：hover 中性浅底，active 浮起 `surface` 白 pill + 双层微阴影 +
  primary 图标；`.workspace-label` 带成功点 chip；`.user` 为 `surface` 浮起小卡
  （`var(--shadow)`）；`.avatar` soft 底 primary 字；`.brand-mark` 是全站唯一大面积渐变
  （135° 双色），hover 加深投影。
- `.btn` 一律实色：`btn-primary` 实色 `var(--primary)`，hover `color-mix` 混 ink 12% +
  `translateY(-1px)` + 品牌色投影，active 混 20% 回落；次按钮 surface + 1px border +
  微投影，hover 中性染底 + `line-strong`。**任何按钮/控件/卡片禁渐变**；渐变仅限
  `.brand-mark` logo、`:focus-visible` 光环、顶栏发丝线；磨砂玻璃仅限顶栏与窄屏抽屉。
- 交互卡（`.task`/`.item-card`）hover `translateY(-2px)` + 阴影加深；`.task` 圆角
  `radius-2px`=12px；`.stats-grid` 独立卡片阵列（surface + 14px + shadow）。
- 控件：input/select/textarea 10px 圆角、hover `line-strong`、focus `border:primary` +
  `3px ring`；select 统一 `.select-wrap` + `.select-chevron` SVG（`appearance:none`），
  option 继承 ink/surface；`.input-wrap:focus-within` 放大镜染主色；
  `input[role=switch]` 38×22 pill 开关（knob 位移 16px，checked 用 primary，禁用 50%）。
- `.badge` pill + 同族浅底 + `inset 0 0 0 1px` currentColor 18% 描边；
  `.tab-list` 为 `surface-2` 分段控件容器，选中项浮起 surface pill + 双层微阴影；
  `details/summary` 自绘 chevron 旋转 + hover 变色；面包屑 `.crumb-sep` SVG；
  `.help-button` 为无边框文字按钮，hover 中性染底。
- 表格行 hover `soft` 55% 染底、`th[aria-sort]` `soft` 45% 标出排序列；时间线首点
  primary + `soft` 4px 光晕；骨架扫光 `surface-2`↔`surface` 渐变 1.6s。
- `dialog` 14px 圆角 + `shadow-pop` + 蓝调 `rgb(10 18 32/.52)` 遮罩（含 2px backdrop 模糊）；
  `.toast` ink 实底 pill；`.empty` 56px soft 圆角 16 图标块；`.alert` soft 底 +
  primary 24% 1px 描边（无宽色条）；`progress`/`bar-track` `surface-2` 槽 + primary 实填
  （含 `-moz-` 填充规则）。
- 浏览器表面全接管：滚动条 thin + muted 半透明圆头拇指、`::selection` primary 14% 染底、
  `caret-color:primary`、placeholder/禁用态用 muted 与 `surface-2`、`option` 随 scheme 配色。
- 图标全内联 SVG（stroke 1.6、currentColor、aria-hidden）；禁 emoji、禁 Unicode 当图标、
  禁渐变文字、禁紫粉渐变、禁玻璃卡片、禁 CSS `url(`、禁远程资源。
- 保留：全部类名与 `data-*` 钩子、`dense`、1180/760px 断点、760px 44px 触达、
  `prefers-reduced-motion`、`component:` 注释块（stats→dialog 17 块顺序）、CSP、
  单文件离线产物、shell.html `$` 占位符。

## 8 主题主色与中性阶倾向

| 主题 | primary | 中性阶色相 |
|---|---|---|
| ocean 霁蓝 | `#1f4fd8` | 蓝灰（bg `#f4f6f9` / ink `#101c2c` / muted `#55637a`） |
| slate 岩灰 | `#475569` | 冷岩灰蓝（bg `#f4f5f7` / ink `#1a212c`） |
| jade 青绿 | `#0e7358` | 青绿灰（bg `#f3f7f5` / ink `#14241e`） |
| plum 堇紫 | `#6a48a8` | 紫灰（bg `#f6f5fa` / ink `#1f1a2b`） |
| warm 赤陶 | `#96481e` | 暖米灰（bg `#f7f5f0` / ink `#2a2118`） |
| rose 酒红 | `#a23c5b` | 玫瑰暖灰（bg `#f7f4f6` / ink `#291b22`） |
| midnight 雾蓝暗色 | `#8fb2fa`（primary-ink `#0d1830`） | 墨蓝暗色（bg `#0e1420` / ink `#e8eef7`） |
| contrast 高对比 | `#0f3ba8` | 冷灰高对比（border `#8892a2` ≥3:1） |

## 对比度核验（temp/contrast-check-r4.py，读 data/styles.json 实测）

每主题核验 15 组文字对（ink/muted×surface/bg/surface-2、primary-ink/primary、
primary×soft/surface/bg/surface-2、success/warning/danger×soft/surface），全部 ≥4.5:1：

| 主题 | 文字对最低值 | 对应组合 |
|---|---|---|
| ocean | 5.12:1 | danger/danger-soft；muted/surface-2 5.37 |
| slate | 5.12:1 | danger/danger-soft；muted/surface-2 5.19 |
| jade | 5.00:1 | primary/soft；muted/surface-2 5.34 |
| plum | 5.12:1 | danger/danger-soft；muted/surface-2 5.47 |
| warm | 5.00:1 | muted/surface-2 |
| rose | 5.17:1 | warning/warning-soft；muted/surface-2 5.20 |
| midnight | 5.92:1 | primary/soft |
| contrast | 6.80:1 | success/success-soft；全对 ≥6.8 |

非文字边界（`border`/`line-strong` 细线）常规主题为低对比发丝线（设计意图）；
`contrast` 主题描边 ≥3:1（border/surface 3.14、line-strong/surface 4.46）。
