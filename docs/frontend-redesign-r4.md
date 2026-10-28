# 前端重设计第四轮：ucd-studio "霁蓝瓷面" 新视觉世界

> 前三轮见 `frontend-redesign.md`、`frontend-redesign-r2.md`、`frontend-redesign-r3.md`。
> 本轮用户反馈"当前 demo 页面太丑，推翻重来"，并指定基于 `.agents/skills/impeccable` 与
> `.agents/skills/ui-ux-pro-max` 重做：r3 的"暖纸工作台"视觉体系整体作废，更换为
> **"霁蓝瓷面"（Porcelain Sapphire）**——冷调瓷白工作区 + 蓝宝石品牌实色 + 磨砂玻璃顶栏。
> 管线与契约（DOM 钩子、离线、生成方式）保留。

## 1. 保留（管线契约，不可破坏）

- 渲染管线：`scripts/ucd.py`/`render.py` 内联 `assets/base.css`（`/* component: X */` 注释切分）、
  `assets/shell.html`（`$tokens/$css/$nav/$title/$product/$description/$action/$density/$script` 占位符）、
  `assets/runtime.js`、`data/styles.json` → 离线单文件 HTML。
- `data/styles.json` 8 主题键与 token 键结构（可改色值、可加键，validate() 只认已定义键）；
  主题 title 保留原文（测试断言 jade 生成文档含"青绿"）。
- `assets/base.css` 中 `/* component: stats/table/... */` 注释块**标记与顺序不变**，每个组件的
  CSS 必须留在自己的块内（`render.py` 按标记抽取，`ucd show` 输出依赖；测试断言 `.data-table`）。
- `assets/runtime.js` 依赖的全部类名与 `data-*` 钩子、`dense` 密度模式、1180/760px 断点、
  `prefers-reduced-motion`、CSP、`audit()`（禁 `url(`、禁外联）、单文件离线产物形态。
- `shell.html`/`components/*.html` 的**类名词表不变**（base.css 是唯一样式权威）；
  `gallery.html` 为自含 CSS，门户结构与类名可由 `make_demo.py` 面板标记同步重构。
- `python scripts/make_demo.py` 再生成 + `python -m unittest discover -s tests -v` 必须通过；
  demo/ 9 页 + `demo/index.html` 门户同步重做。

## 2. 新视觉世界："霁蓝瓷面"（Porcelain Sapphire）

参考 ui-ux-pro-max `--design-system` 检索结论（Minimalism & Swiss Style，企业工具倾向：
`#1E3A5F`/`#2563EB` 蓝系 + slate 冷灰）校准。实施者可在内微调色值，不另行请示。

### 2.1 质感与色彩

- **底色**：冷调瓷白 `bg #f4f6f9`（带蓝灰倾向），内容面 `surface #ffffff`，凹陷面
  `surface-2 #edf1f7`（侧栏轨道、表头、看板井区、骨架底），`border #e3e8f0`，
  `line-strong #c2cddf`；`ink` 深岩蓝黑（slate-900 系，`#101c2c` 附近），`muted` 蓝灰
  （slate-500 系，`#55637a` 附近）。**中性阶必须带蓝灰色相，不用纯灰。**
- **主色（ocean 默认主题）**：蓝宝石实色 `#1f4fd8` 附近（饱和适中、对白底与 primary-ink
  对比度 ≥4.5:1）；`soft` 同族浅底 `#e7eefc` 附近；`ring` primary 22–28% 透明。
- **渐变纪律**：仅 `.brand-mark` logo（135° 双色）、`:focus-visible` 光环、顶栏底部
  1–2px 品牌渐变发丝线、门户 hero 区极小面积点缀。**一切按钮/控件/卡片禁渐变**。
- **磨砂玻璃**：仅 sticky 顶栏与窄屏抽屉（`blur(14–16px) saturate(1.4–1.5)` + 表面
  70–78% 不透明底）。卡片不用玻璃拟态。
- **阴影**：弥散两层 `0 1px 2px rgb(ink/.04)` + `0 16px 40px -16px rgb(ink/.12)`；
  浮层 `shadow-pop` 加深至 ≤.22；色彩随各主题 ink 校准。
- **8 主题重校**：ocean 霁蓝 / slate 岩灰 / jade 青绿 / plum 堇紫 / warm 赤陶 /
  rose 酒红 / midnight 雾蓝暗色 / contrast 高对比——中性阶全部带各自色相，
  语义色 success/warning/danger 柔和可辨，正文对比 ≥4.5:1 逐主题核验并写入 design-system.md。

### 2.2 形态与排版

- 圆角：面板/卡片 `radius 14px`，控件 `--control-radius 10px`，`--r-pill 999px`
  （导航项、badge、tabs 容器、chip、开关）。
- 排版：页面标题 21–22px/650/-0.015em、面板 15px/600、正文 13–14px/1.65、辅助 12px muted、
  表头 12px/600 大写感（letter-spacing .02em 可选）、数字 `tabular-nums`、KPI 28px/640。
  层级靠字重+灰度，不靠大跨度字号。
- 动效：`--motion` 180ms cubic-bezier(.3,.7,.3,1)；卡片 hover `translateY(-2px)` + 阴影加深；
  按钮 hover 实色加深（color-mix ink 10–14%）+ `translateY(-1px)` + 品牌投影。
- 图标：全内联 SVG（stroke 1.6、currentColor、aria-hidden）；禁 emoji/Unicode 图标/
  渐变文字/紫粉渐变。

### 2.3 骨架与隐藏组件（全部重设计到位）

- 侧栏：`surface` 白面或 `surface-2` 凹陷轨道（二选一，全站统一），导航项 pill；
  `.brand-mark` 渐变方块为页面唯一大面积渐变；`.workspace-label` chip；`.user` 浮起小卡。
- 顶栏：≤56px 磨砂玻璃 + 面包屑；底部 1–2px 品牌渐变发丝线；`.environment` chip +
  `.help-button` 文字按钮。
- **下拉框与隐藏元素**：`select` 统一 `.select-wrap` + `.select-chevron` SVG
  （`appearance:none`）；`option` 颜色继承（hover 底色随系统 scheme）；`dialog` 14px 圆角 +
  `shadow-pop` + 遮罩；`details/summary` 自绘 chevron 旋转 + hover 变色；`.toast` ink 实底 pill；
  骨架屏 `surface-2`↔surface 扫光；`.empty` 56px soft 图标块；禁用态 `surface-2`；
  滚动条 thin + 半透明圆头拇指；`::selection` primary 14%；表格行 hover `soft` 染底、
  `th[aria-sort]` 排序列标识；`input`/`textarea` focus `border:primary` + `3px ring`。
- `tab-list`：surface-2 分段控件容器，选中项浮起 surface pill + 微阴影。
- `badge`：pill + 同族浅底 + inset 细描边。

### 2.4 门户 `gallery.html` + `demo/index.html`（本轮重点）

现状痛点：灰度线框缩略图+平铺列表，无品牌感、无质感。重做方向（Operate 模式，
克制而精确，不做营销大首屏）：

- 顶部磨砂玻璃栏 + 渐变品牌标 + 右侧环境说明。
- 头部区：左标题/说明 + 右主操作（实色按钮）——或两栏式"标题 + 模板拼贴示意"，
  避免对称居中营销布局；文案为真实业务口吻。
- 模板卡：精修 mini-wireframe（浏览器顶栏三点 + 内容骨架条用主题色点缀），
  标题+一句话描述+布局标签 chip；hover `translateY(-3px)` + 阴影加深 + 顶部浮现
  primary 细条或箭头揭示；整卡可点。
- 主题区：swatch 彩点 + 主题名 chip 网格；工具区列组件页/库模式/可编辑模式入口。
- 页脚一行说明（离线、无远程资源）。
- `make_demo.py` 中 `$panels` 面板标记可随门户 CSS 一并重构（保持 `layout/title/description`
  数据正确，`names[layout]["title"]` 不变）。

### 2.5 减少 AI 感

克制装饰：无渐变文字、无彩虹渐变按钮、无 emoji、无玻璃卡、无大面积插画块；
文案为真实业务口吻（不写"赋能/打造"类营销词）；布局功能优先、适度留白。

## 3. 任务分解（子代理并行）

| 代理 | 负责文件 | 任务 |
|---|---|---|
| A design-core | `assets/base.css`、`data/styles.json`、`DESIGN.md` | 按 §2 整文件重写 base.css（保标记/顺序/类名）；8 主题 token 重校；DESIGN.md 重写 |
| B chrome-portal | `assets/shell.html`、`assets/gallery.html`、`assets/components/*.html`、`scripts/make_demo.py` | 骨架/门户/组件片段重设计；门户 CSS 自含于 gallery.html；类名词表不变 |
| C file-slim | `.agents/skills/archify/`、`.agents/skills/uml-studio/`、`.agents/skills/temp/` | 每 skill git 跟踪文件数降到 ≤96（合并不需要的小文件）；清理 temp 临时产物 |
| D regen-sync（A+B 完成后） | `demo/**`、`references/design-guidelines.md`、`scripts/ucd.py` | 运行 make_demo.py 再生成 demo；同步参考文档与文案；修复断裂 |
| E verify（D 完成后） | 只读 | 跑测试、`ucd.py check`、审计与文件数核验、视觉抽查 |

## 4. 文件数约束

- 全部 `.agents/skills/*` git 跟踪文件 ≤100（目标 ≤96 留余量）：
  archify 100→≤96、uml-studio 99→≤96、ucd-studio 82→≤100（本轮允许变动）。
- `.agents/skills/temp/`（未跟踪，100 个浏览器临时产物）确认可弃后删除。

## 5. 验收清单

1. `python -m unittest discover -s tests -v` 16 项全过；`make_demo.py` 再生成成功；
   抽样 `ucd.py check --dir demo/<x>` 通过。
2. 生成物 0 `url(`、0 外联（CSP meta 除外）、0 emoji；按钮无渐变（实色+color-mix hover）。
3. git ls-files 各 skill ≤100（目标 ≤96）。
4. 视觉抽查：门户与 ≥3 个 demo 页明显区别于 r3 暖纸世界（冷瓷底、霁蓝主色、磨砂顶栏、
   弥散阴影、pill 形态、隐藏组件样式到位）。
5. 提交并推送；本文件为现行记录（追加实施结果）。

## 6. 实施结果（2026-10-28 完成）

- **A 设计核心**：`assets/base.css` 整文件重写（17 个 `component:` 标记全保留），
  `data/styles.json` 8 主题重校（ocean `#1f4fd8`、bg `#f4f6f9`、surface-2 `#edf1f7`、
  ink `#101c2c`、muted `#55637a`，中性阶带蓝灰色相），`DESIGN.md` 重写并附逐主题
  对比度核验表（每主题 15 组文字对全部 ≥4.5:1，脚本 `temp/contrast-check-r4.py`）。
- **B 骨架门户**：`gallery.html` 推翻重做（磨砂顶栏+渐变发丝线、browser-wireframe
  模板卡、主题 swatch、工具入口）；`shell.html` 精修（占位符/钩子/类名全保，
  caption 移至用户卡之下）；`components/*.html` 8 片段对齐新规范；`make_demo.py`
  面板标记与 `banner()` PNG 配色同步重构。
- **C 文件精简**：archify 100→95（删死代码/孤儿 README/冗余示例并修引用）、
  uml-studio 99→94（合并 4+1 入门示例到 scenarios，README/SKILL.md 引用同步）、
  `.agents/skills/temp/` 浏览器残留产物整体删除。
- **D 再生成同步**：`make_demo.py` 重生成 demo/ 9 页+门户；`design-guidelines.md`/
  `validation.md` 同步新世界表述；`ucd.py` design_doc 文案修正；base.css 微调 1 处
  （`.sidebar-caption` 间距适配 B 的 markup 顺序）。
- **E 验收**：unittest 16/16 全过；`tests/browser.mjs`（Playwright）28 页 66 视口
  0 外网请求 0 错误，dialog/toast/分页/筛选/排序/三态/tabs/kanban/表单全断言通过；
  9/9 页 `ucd.py check` ok；审计 0 `url(`、0 外联、0 emoji、按钮 0 渐变
  （linear-gradient 仅存于 .brand-mark/.topbar::after/骨架扫光）；`demo/preview.png`
  已按新门户重截；各 skill git 跟踪文件数全部 ≤96（ucd-studio 82）。
- **遗留说明**：demo 数据含 `↑↓→` 文本箭头（既有 catalog/examples 内容，非 emoji）；
  kanban 演示页用 slate 主题属有意安排；验收复核截图见 `temp/r4-verify/`。
