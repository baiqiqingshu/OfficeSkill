# skills_hub 集成与 pptx-builder 素材/美化实施文档

日期：2026-11-17。本文档是本轮任务的实施依据：先写方案，再分子代理并行实施。

## 1. 外部 skill 安装（skills_hub/）

| 目录 | 来源 | 方式 |
| --- | --- | --- |
| `skills_hub/html-ppt-skill` | github.com/lewislulu/html-ppt-skill | git clone --depth 1 |
| `skills_hub/frontend-slides` | github.com/zarazhangrui/frontend-slides | git clone --depth 1 |
| `skills_hub/GordenPPTSkill` | github.com/GordenSun/GordenPPTSkill | git clone --depth 1 |
| `skills_hub/competition-ppt-template-first-skill` | github.com/che626/competition-ppt-template-first-skill | git clone --depth 1 |
| `skills_hub/ppt-studio` | `skills_hub/ppt-studio-main.zip` | 已解压，移动到位 |

skills_hub 仅作素材与参考来源，**不提交 git**（GordenPPTSkill 模板禁止二次分发；体积大）。`.gitignore` 增加 `skills_hub/`。

## 2. 素材提取 → 补充元素库（重点参考 ppt-studio）

pptx-builder 的组件 = `assets/libraries/<lib>/library.json` 中声明式 HTML 片段（受限 HTML/CSS 子集，编译为原生 PPTX 形状）。架构支持多库（`"libraries":[...]`，按 `库ID/组件ID` 引用）。

为避免冲突按文件归属拆两个子任务：

- **新库 `assets/libraries/studio/`**（素材子代理）：仿 ppt-studio 的版式与视觉语言新增组件（编号标题条、结论条、问题页、图版、路线/甘特等适合内网汇报的版式），组件 ID 带 `studio/` 前缀。同时把 ppt-studio 的 Lucide 图标（`lucide.json`，1857 个 SVG）中适合汇报场景的一批导出为 PNG 放 `assets/libraries/studio/images/icons/`，组件/示例可引用。提炼 ppt-studio 27 主题中适合内网的配色（科研答辩藏青+红、现代商务蓝等），供主题子任务采纳。
- **内置库美化**（huashu-design 子代理）：只改 `assets/libraries/builtin/`（library.json / samples.json / images）与 `themes.py`、`demo.py`/demo 产物，不动 studio 库。

## 3. huashu-design 美化方向

按花叔规则先出三个方向给用户选（并行任务期间确认）：

- A. 科研答辩风：藏青底/白底密排 + 红强调、编号标题条、图版面（ppt-studio 默认风，密度高）。
- B. 现代商务风：留白卡片、大数字、柔和渐变、细分割线（适合日常汇报/方案）。
- C. 当前 crimson 正式汇报风精修：不换方向，只提升细节（间距、层级、对齐、微渐变/细线）。

## 4. GordenPPTSkill 架构分析 → 小模型适配

探索子代理通读 `skills_hub/GordenPPTSkill`（SKILL.md、references/、scripts/、templates/ 组织），产出 `docs/intranet-ppt-small-model-architecture.md`：其"模板 + edits.json 文本替换 + detail.json + manifest/updates 自更新 + 出框检测"架构哪些可借鉴到 pptx-builder，重点是降低小模型生成难度（更小的输入面、模板槽位、校验闭环）。pptx-builder 的使用场景不变：内网需求/方案汇报，本地小模型可驱动。

## 5. 内网 docx skill 检索与审计

候选：`NousResearch/hermes-agent` 的 `skills/productivity/docx`（MIT、纯 python-docx CLI、离线，为小模型设计）；备选 anthropics/skills docx（需 pandoc/npm）、minimax-docx（依赖 .NET，重）、kklimuk/docx-cli（预编译二进制，审计成本高）。

子代理需**审查源码无外链上传风险**（搜索 requests/urllib/http/socket 调用、遥测、远程模板），给出审计结论，合格后安装到 `.agents/skills/docx`，并把审计报告写入 `docs/`。

## 6. 收尾

- 重新生成 demo：`python .agents/skills/pptx-builder/scripts/ppt_tool.py demo --out output/library-demo --library .agents/skills/pptx-builder/assets/libraries/studio/library.json`（以及不带 studio 的默认 demo）。
- 抽渲染一个 example 校验 `--strict-layout` 不回归。
- 同步 docs：本文件更新为实施结果；GordenPPT 架构分析、docx 审计各自成文。
- git 提交全部代码改动（skills_hub 不提交）。

## 7. 实施结果（2026-11-17 完成）

- **skills_hub**：5 个 skill 已就位（`html-ppt-skill`、`frontend-slides`、`GordenPPTSkill`、`competition-ppt-template-first-skill`、`ppt-studio`）。github.com 主站不通，实际经 `codeload.github.com` zip 归档安装；`skills_hub/` 已加入 `.gitignore`。
- **studio 素材库**（详见 `intranet-ppt-studio-library.md`）：`assets/libraries/studio/` 新增 14 个答辩风组件（num-header/statement/conclusion-band/route-chain/milestone-axis/issue-fix/big-number/figure-points 等）+ 40 枚 128×128 Lucide PNG 图标（自写 SVG→PNG 栅格器，`temp/render_icons.py`）；catalog/render/demo 全部验证通过。
- **builtin 美化**（详见 `intranet-ppt-builtin-beautify.md`）：按用户选定的"科研答辩风、默认红色、多色系"方向，39/66 组件重设计（编号标题、结论条、彩带面板等），修复 `code` 组件 3 个非规范色，全库 0 违规 hex；主题 6→8（新增 `navy` 藏青、`violet` 紫金，`crimson` 保持默认）；`samples.json` 换成"统一认证平台方案评审"真实文案；`demo.py` 侧栏/主题高亮跟随主题色。technical-proposal / modern-elements / ipd-walkthrough / scenario-walkthrough 渲染 `--strict-layout` 全部 0 issue。
- **正式 demo**：`assets/demo/library-demo.html` 已用 `--library studio` 重生成，80 组件 / 8 主题 / 67 页，SKILL.md 已补 studio 库用法说明。
- **架构分析**：`docs/intranet-ppt-small-model-architecture.md` —— GordenPPTSkill 的核心启发是"极小决策面"（选模板+挑页码+edits.json 纯文本替换）；给出 8 项改进清单，P0 为整页 preset 配方（写死 box 的槽位填充模式）。
- **docx skill**：选用 `NousResearch/hermes-agent` 的 microsoft-office 三合一 skill（docx 为主），审计无外联/遥测（详见 `intranet-docx-skill-audit.md`），安装至 `.agents/skills/docx`，冒烟测试通过（python-docx 1.2.0 本机已装）。
