# UCD Studio 轻量化提效与 PPTX Builder 默认 Demo 美化实施记录

> 状态：已完成实现与验证（2026-11-19）

## 一、`ucd-studio` 优化与框架升级（版本 1.2.0）

### 1.1 针对内网本地 AI 模型的流程提效
- **极简单页速查入口（`.agents/skills/ucd-studio/SKILL.md`）**：精简为核心命令与全量单页速查表（6 布局、10 主题、2 外壳模式、16 区块 schema），本地模型读一次即可直接生成，无需多轮检索或反复读写多个参考文档。
- **一步命令与零临时文件（`.agents/skills/ucd-studio/scripts/ucd.py`）**：
  - 新增 `quick` 子命令：支持 `--json '<JSON>'` 内联参数、`--config -` 标准输入、`--set key=value` 点路径赋值、`--shell sidebar|topnav`、`--density compact|comfortable`，以及对已托管目录的安全更新。
  - 增强 `init`：支持 `--json`、`--shell`、`--density`、`--set` 与 `--force`。
  - 增强 `patch`：支持 `--json` 与 `--set key=value`（不再强制先写临时补丁文件）。
  - 新增 `presets` 子命令：单次输出紧凑 JSON 速查表。
  - 新增 `kit` 子命令：导出轻量独立 `ucd.css`、`ucd.js` 与 `index.html` 骨架，方便直接手写语义化 HTML 原型。
- **容错规范化（`normalize_spec`）**：
  - 支持 `blocks` 传入对象数组（自动转为有序字典并补齐稳定 ID）。
  - 自动补全缺失区块默认中文 `title`、将 `stats.items[].value` 数字转为字符串、自动探测 `table.statusColumn`。

### 1.2 更美观的现代 UCD 框架
- **可读结构化样式（`.agents/skills/ucd-studio/assets/base.css`）**：重构为清晰可读样式表，保留 17 个 `/* component: ... */` 提取锚点；增加面板细边界 + 弥散阴影分层、状态徽章小圆点、KPI 卡片顶部指示点与涨跌语义胶囊（`.stat-change.up/.down`）。
- **双外壳与丰富交互（`assets/shell.html`、`assets/runtime.js`、`scripts/render.py`）**：
  - 支持 `shell: "sidebar" | "topnav"`（新增清爽粘性顶部导航栏模式）。
  - 表格行支持点击或「详情」操作打开右侧滑出详情抽屉（`#detail-drawer`），含本地审批通过/退回交互反馈；精简表格底部状态预览切换器。
  - 折线图增加半透明主色面积填充与数据点圆环标记（无 `url()`，完全符合离线 CSP 审计）。
  - 支持顶层 `actions`（次级按钮）、`workspace`、`user`（`name`/`role`）定制。
- **新增主题与重生成示例（`data/styles.json`、`data/catalog.json`、`examples/`、`demo/`）**：
  - 新增 `indigo`（深靛 · 研发平台）与 `nordic`（极简白 · 清爽现代），共 10 套主题。
  - 更新 `examples/admin.json`、`examples/dashboard.json` 并重新生成全部 `demo/` 页面。

### 1.3 验证结果
- `python -X utf8 -m unittest discover -s .agents/skills/ucd-studio/tests -v`：17 项单元测试全部通过。
- `node .agents/skills/ucd-studio/tests/browser.mjs`：28 页 × 66 视口全部通过，0 外部请求，0 页面错误，375px 移动端无横向溢出。
- Playwright 专项验证：详情抽屉打开/审批操作与 `shell-topnav` 375px 响应式无溢出均通过。

---

## 二、`pptx-builder` 默认 Demo 美化与设计元素补充

### 2.1 新增内置设计元素（`assets/libraries/builtin/library.json`、`samples.json`、`master_regions.py`）
内置库由 66 个扩展至 **73 个**（配合 `studio` 库共 **87 个**），全部使用规范色板 Token 以支持 8 套主题即时换色：
- `builtin/cover-dark`：1280×720 全幅深主色封面（`region: full`，自动识别）。
- `builtin/header-bar`：1152×76 现代正文页头（右侧分类胶囊 + 页标，自动识别为 `title` 区域）。
- `builtin/bar-metric`：552×260 四行横向条形指标卡。
- `builtin/pillars`：1152×340 三栏支柱架构卡（一次完成三栏能力/架构域排版）。
- `builtin/process-4step`：1152×190 一体化四步横向流程条（含编号与箭头衔接）。
- `builtin/roadmap-4col`：1152×250 四阶段横轴路线图。
- `builtin/highlight-quote`：1152×130 重点金句/洞察横幅卡。

### 2.2 默认 Demo 与画廊美化（`scripts/pptx_builder/demo.py`、`examples/*.json`）
- **升级 4 套默认示例**：
  - `examples/modern-elements.json`：扩展为 8 页旗舰展示稿（深色封面、洞察、三栏支柱、KPI + 条形指标、对比决策、四步流程 + 路线图、状态跟踪、结论与行动），并设为 `library-demo.html` 默认首屏选中项。
  - `examples/technical-report.json`、`examples/requirements-review.json`、`examples/solution-review.json`：从简陋 3 页纯文本/表格升级为 5 页完整现代汇报结构。
- **重绘默认占位图与画廊视觉**：
  - 重绘 `demo.py` `_draw_placeholder_image()` 与 `assets/libraries/builtin/images/placeholder.png` 为现代分层架构与数据指标示意图（替换原线框叉号占位图）。
  - 优化 `library-demo.html` 顶部卡片与排版，重新生成 `assets/demo/library-demo.html`（7 份示例、75 页、87 个组件、8 套主题）。

### 2.3 验证结果
- 全部 7 份 `examples/*.json` 通过 `ppt_tool.py validate --strict-layout`（0 问题）。
- 4 份升级示例通过 `ppt_tool.py render --strict-layout` 生成原生可编辑 PPTX 与 HTML 预览（0 布局问题）。
- `ppt_tool.py starter --strict-layout` 与 Playwright 检查 `assets/demo/library-demo.html`（87 张组件卡，默认选中「现代汇报 · 综合方案评审示例」，0 页面错误，0 外部请求）全部通过；技能目录文件总数保持 91（≤ 100）。
