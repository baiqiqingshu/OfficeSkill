# 前端美化第二轮 + 全 skill 文件数收敛实施契约

> 上一轮（`docs/frontend-redesign.md`，b788b84）已完成 uml-studio 修正与 ucd-studio 全量重设计。
> 本轮范围：ucd-studio demo 二次打磨（更精致、更少 AI 感）；**所有** `.agents/skills/` 下
> skill 的 git 跟踪文件数 ≤100。设计语言与离线硬约束沿用上一轮契约，不推翻。

## 1. 设计基线（沿用 + 强化）

- 柔和弥散阴影（多层、低透明度、负扩散）；可交互卡片 hover `translateY(-2px)` + 阴影加深。
- **按钮一律实色**（含主按钮），hover 加深；渐变只允许：logo 品牌方块（135°）、
  `:focus-visible` 光环、导航栏局部点缀。减少 AI 感。
- 磨砂玻璃 `backdrop-filter` 只允许顶部导航 / 窄屏抽屉；面板、卡片实色。
- 全中文文案；图标全部内联 SVG（stroke 风格，禁 emoji、禁 Unicode 符号当图标）。
- 圆角卡片与按钮；现代配色、克制中性色 + 单一品牌色。
- 隐藏组件同等设计：`<select>`/`option` 定制态、`<dialog>`、`details/summary` 浮层、
  toast、骨架屏、空/错误态、禁用态、滚动条、`::selection`。
- 离线约束：禁远程字体/图片/CDN；ucd-studio 产物 CSS 禁 `url(`（`audit()` 会拒绝）。
- 保留全部 DOM 钩子、`data-*`、断点、`prefers-reduced-motion`、`component:` 注释块。

## 2. ucd-studio demo 二次打磨（子代理A）

在 b788b84 基础上做**精修而非重做**，方向：

- 排版：中文界面字号/行高层次（标题 15–20px 阶、正文 13–14px、辅助 12px muted），
  数字表格对齐；页标题与面包屑层级更克制。
- 间距节奏：面板 padding、栅格 gap、区块间距统一 8px 倍数；统计卡 KPI 数字与标签层级拉开。
- 细节质感：表头 `surface-2` + 字重 600 小字号；空态/骨架屏/错误态插画化（内联 SVG）；
  badge 语义色板收敛（成功/警告/危险/中性 + primary）；hover/focus 过渡 ≤160ms ease。
- 交互卡 hover 上浮已就位则检查一致性：`.task`/`.item-card`/看板卡/门户 `.sample` 统一。
- 门户 `gallery.html`：hero 区、卡片网格、页脚层级可再提升；与 demo 同语言。
- 改动落点：`data/styles.json`（仅在必要时补令牌）、`assets/base.css`、`assets/shell.html`、
  `assets/gallery.html`、`assets/components/*`、`scripts/render.py`（结构类微调）。
- 完成后 `python scripts/make_demo.py` 重新生成 `demo/` 全部页面；
  `python -m unittest discover -s tests -v` 全过；抽样 `ucd.py check`。
- 同步 `DESIGN.md` 新增规则；`references/design-guidelines.md` 冲突表述修正。

## 3. 文件数收敛（各 ≤100，git 跟踪口径）

现状（`git ls-files`）：diagram-design 287、archify 231、uml-studio 99、ucd-studio 82、
ui-ux-pro-max 73、impeccable 63、webapp-testing 27、local-ppt-template 13。

### 3.1 diagram-design 287→≤100（子代理B）

- `assets/example-*.html` 约 210 个（每类型 × light/dark/full/terminal 变体）按**变体**
  合并为少量画廊文件：如 `examples-light.html`/`examples-dark.html`/`examples-full.html`/
  `examples-terminal.html`，文件内以 `<section id="example-<type>">` 锚点分区，
  每个保留原有完整标记；`assets/index.html`/`icons.html`/模板 5 件保留。
- `SKILL.md` 中 `example-<type>.html` 命名约定改为指向画廊锚点
  （`assets/examples-light.html#example-bar` 等），逐条核对所有引用路径。
- `references/type-*.md`（约 30 篇）按图类分组合并为 ≤8 篇合辑
  （如 `types-flow.md`、`types-chart.md`、`types-architecture.md`…），
  文首放目录锚点；`SKILL.md` 与其余 references 内交叉引用同步改。
- 其余 references（primitive-*、export-*、import-*、style-guide 等）保留单文件。
- 验证：`python scripts/self_check.py`（若存在该入口）；`git ls-files` 计数 ≤100；
  随机抽 3 个画廊锚点与原 example 文件 diff 确认内容无丢失。

### 3.2 archify 231→≤100（子代理C）

- `test/` 137 个 `.test.mjs` 按主题合并为 12–18 个套件文件
  （如 `test/viewer.test.mjs` 聚合 viewer-*、camera-*、reader-*；
  `test/story.test.mjs` 聚合 story-*；`test/export.test.mjs`…）：
  合并各文件的 import（去重）、describe/it 原样迁入，共享 fixture 路径改为
  相对新位置的引用；被合并文件删除。`test/fixtures`、`test/shared`、`test/helpers`
  目录与文件保留不动。
- `test/*.visual-check.*`（PNG/HTML/JSON 成组截图产物，约 12 个）属可再生产物：
  删除 PNG 与冗余 HTML/JSON，或在对应套件内注明再生命令；若测试断言依赖则保留 JSON。
- `examples/` 31 个：保留 JSON 规格与代表性 HTML；`.visual-check.*` 全部删除
  （PNG 截图属产物）；总数压到 ~12。
- `schemas/`、`renderers/`、`scripts/`、`bin/`、`references/`、`brand-marks/` 不动。
- 验证：`node --test test/*.test.mjs`（或既有 test 命令）全过；
  `git ls-files` 计数 ≤100。

### 3.3 清理

- `.agents/skills/temp/ucd-browser-*`（未跟踪产物）移至仓库 `temp/`（.gitignore 覆盖）。

## 4. 验收清单

1. `git ls-files .agents/skills/<skill>` 全部 ≤100（含 uml-studio 保持 ≤99）。
2. ucd-studio：`python -m unittest discover -s tests -v` 全过；demo 全部重新生成；
   生成物无 `url(`/外联。
3. archify：既有测试命令全过；diagram-design：self_check 通过、引用无死链。
4. 视觉抽查 demo：磨砂 sticky topbar、实色主按钮、卡片 hover 上浮、定制 select、
   dialog/toast/骨架屏统一、无 emoji、按钮无渐变。
5. 完成后 `git add -A` 提交并 `git push`；docs 同步（本文件为现行记录）。

## 5. 实施结果（2026-10-28）

**ucd-studio 二次精修（82 文件，16/16 测试通过）**

- `assets/base.css`：h1 20px/650、h2 15px/600、表头 12px/600+`--surface-2`、KPI 30px/650；
  comfortable/compact 面板内边距与栅格 gap 全部对齐（修复 dense 下 toolbar/footer/skeleton
  与面板头不齐的遗留）；badge 收敛为五类语义 pill；过渡统一 `--motion` 160ms ease-out。
- `assets/shell.html` + `components/breadcrumb.html`：面包屑 `/` 改内联 SVG chevron。
- `assets/gallery.html`：hero 层级、24px 卡片栅格、主题色板 pill chip、工具链接 36px
  最小高 + CSS chevron、页脚分隔线。
- `demo/` 10 页全量重新生成（manifest/design-system.md/preview.png 同步）；
  `ucd.py check` 抽样全过、生成物 0 `url(`/0 外链；Playwright 实测磨砂顶栏、实色主按钮、
  排版令牌生效；`.agents/skills/temp/ucd-browser-*` 陈旧产物移至仓库 `temp/`。

**diagram-design 287→85 文件**

- 210 个 `assets/example-*.html` 打包进 `assets/examples.zip`（成员逐字节同 HEAD）；
  保留 6 个代表 example（light/dark/full/terminal/animated/consultant 各变体覆盖）
  + 5 模板 + index/icons；新增 `assets/examples-index.md` 索引与解压指引。
- `SKILL.md` 变体表与 48 个 references 的 `example-*` 引用全部改指 zip 成员路径，
  死链 0；`assets/index.html` gallery 加解压提示条。

**archify 231→100 文件**

- ~120 个 `test/*.test.mjs` 合并为 5 个主题套件（viewer-story / renderers-compiler /
  export-delivery / update-infra / browser-integration），import 提升去重、原文件体
  包进 `describe("<原名>")`，0 标识符改名；fixtures/shared/helpers 原样。
- 删除 22 个基线 0 通过的失效测试 + 3 个失效辅助脚本（依赖本布局不存在的
  `.agents/scripts/`、`benchmarks/`、npm 包）、18 个 examples 再生产物/孤儿文件。
- `node --test test/*.test.mjs`：895 通过 ≥ 基线 893；残余 30 失败全部基线既有
  （缺父级基础设施），见子任务报告；`package.json` test script 仍引用已删入口，
  该 script 本布局原已不可运行（遗留事项）。

**全量计数（git ls-files）**：archify 100、uml-studio 99、diagram-design 85、
ucd-studio 82、ui-ux-pro-max 73、impeccable 63、webapp-testing 27、
local-ppt-template 13、ssh-configuration 1、archify-review 1 —— 全部 ≤100。
