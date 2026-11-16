# GordenPPTSkill 架构分析与 pptx-builder 小模型适配方案

日期：2026-11-17。分析对象：`skills_hub/GordenPPTSkill`（github.com/GordenSun/GordenPPTSkill，v1.0.20，21 套模板）。目的：提炼其"对小模型友好"的机制，对照 `.agents/skills/pptx-builder` 给出可执行的借鉴清单。skills_hub 不提交 git，本文件只记录架构结论。

## 一、GordenPPTSkill 架构要点

### 1.1 任务分解：模型的决策面极小

驱动模型只需做三类决策，全部以 JSON 产出：

| 决策 | 产出 | 依据文件 |
| --- | --- | --- |
| 选哪套模板 | 1 个 slug | `templates/INDEX.md`（slug/名称/页数/主色/一句话 + 按主色/场景/规模三张快筛表）→ `intro.md`（浓缩简介）→ `preview.png`（用户看图拍板） |
| 用哪几页 | `selected_slides` 页码数组 | `detail.json` 的 `page_roles`（cover/agenda/section_divider/content/ending 索引）、`skip_pages`、每页 `role`+`use_for`+`text_density` |
| 每个文本位写什么 | `edits.json`：`{slide, slot_id, new_text}` | `detail.json` 每槽的 `role`/`guidance`/`max_chars`/`language`/`current_text`/`editable` |

模型**不接触**坐标、字号、颜色、形状、组件选择；`build_pptx.py` 按 `address`（`shape_id`+`paragraph`+`run`）做 run 级文本替换，排版 100% 来自模板。未选页被删除并重排（`prune_slides`，`scripts/build_pptx.py:179-196`）。

### 1.2 模板 + detail.json + edits.json 三段式：把"生成"降维成"填空"

| 层 | 角色 | 关键设计 |
| --- | --- | --- |
| `template.pptx` | 排版事实 | 设计师手工 PPTX，位置/字体/颜色/动画全部冻结 |
| `detail.json` | 机器可读契约（维护者预生成） | 每槽：`address` 物理寻址、`slot_id` 语义 ID、`current_text`（sanity check 用）、`max_chars`/`chars_per_line`/`max_lines`/`box_cm`/`wrap`/`autofit`/`font_size_pt`（由 `compute_capacity.py` 从真实几何+继承字号算出）、`guidance`（写法提示+示例）、`editable`（装饰序号标 false）、`level`（`type_scale` 字号层级）；每页：`role`/`layout`/`use_for`/`cautions`；模板级：`editing_rules`、`page_roles`、`recommended_pages_for_short_deck`、`shape_caution_pages`、`data_charts`、`type_scale` |
| `edits.json` | 模型唯一产出 | 仅 `template_slug`+`selected_slides`+`edits[]`；槽位二选一寻址（`slot_id` 走 detail.json，或显式 `address`+`expected_text` 走裸 PPTX） |

降低出错面的机制：

- **生成自由度≈0**：只能改文字，"破坏排版"在结构上不可能发生。
- **强约束可校验**："editable=true 的槽必须全部出现在 edits 里"（`references/pptx-edit-schema.md` 强约束第 2 条），占位文字残留可被机械检查发现。
- **契约双向校验**：`expected_text`/`current_text` 让构建脚本能发现"模板被换过/detail.json 过期"（`build_pptx.py:155-159`）。
- **元数据随数据走**：`editing_rules`、`cautions`、`shape_caution_pages`（装饰图形不会随文字联动）把坑直接写在模型必读的 JSON 里，不依赖提示词记忆。

### 1.3 QA 闭环：advisory 为主、不阻断

`build_pptx.py` 的三层检查（`scripts/build_pptx.py`）：

| 检查 | 实现 | 处置 |
| --- | --- | --- |
| 出框检测 | `check_overflow`（94-119）：视觉宽度（CJK=1/ASCII≈0.5/空格≈0.35）对比容量预算；容量已含 20% 校准余量（`compute_capacity.py:174` TOLERANCE=1.2） | **只提示不阻断**；`--strict` 也不因此拒存。提示含"视觉宽度 X > 容量 Y（约需 N 行/可容 M 行, Zpt, 每行≈C 字）"——模型一次就知道该删多少 |
| 省略号截断告警 | 结尾是 `.../…/等等` 即告警（290-305） | 提示"这是最差的结果，改成完整精炼表达" |
| `expected_text` 一致性 | strict 模式下 run/paragraph 原文不符即报错（155-171） | 防"改错位置"和"模板漂移" |

另有 `render_slides.py`（soffice→pdf→pdftoppm 每页 PNG）供模型自检遗留占位、省略号、章节名不一致；workflow.md A7 给出"改 edits.json → 重跑"的修复回路。

**关键教训（CHANGELOG 1.0.17）**：容量上限写成硬规则会诱导模型"砍半句加 `...`"凑数——比轻微超框更丑。故改为软上限 + 专门的省略号检测。**校验过强会制造新的失败模式**，这是对小模型最重要的洞察之一。

### 1.4 manifest/updates 自更新机制

- `manifest.json`：每个文件的 `sha256`/`size`/`version_added`/`last_modified`（`build_manifest.py` 重建）。
- `updates.json`：`latest_version` + `update_source` + `history[]`（每版本 `added`/`modified`/`removed` 文件名集合）。
- `check_update.py`：只算 delta 不下载；`apply_update.py`：按 delta 增量拉取（HTTP 逐文件 GET，或 `git+` 源浅克隆 + `GIT_LFS_SKIP_SMUDGE` 跳过大文件），写后校验 sha256，最后更新 `VERSION`+本地 `updates.json`。
- SKILL.md 把它设为"启用 skill 后第一个 tool call"，靠提示词强制拉新。

内网不能联网更新，可借鉴的是其**机制本身**：文件级 sha256 清单 + 版本化 delta 描述 + "先 check 出计划再 apply"的两段式。对应内网场景即"管理员发新包 → 本地校验完整性"，见 §三-E。

### 1.5 其他值得注意的设计

- **SKILL.md 写法**：三种模式且"默认走模式 A"；"编辑铁律"9 条编号硬约束；"一些常见误区"负面清单；workflow.md 末尾"失败兜底"表（现象→处理）。决策用规则表而非散文。
- **选模板交互**：拿不准时必须给"正好 3 个候选 + preview.png + 『都不满意换一批』"，防止模糊匹配自作主张（SKILL.md 72-79）。
- **角色缺失不强造**：`page_roles.cover` 为空就从内容页开始，不允许拿内容页冒充封面——"模板有什么角色就用什么角色"（SKILL.md 铁律 #8，workflow.md A4）。
- **同级字号一致**：`type_scale` 把"同级标题不改字号"表达成数据（每槽 `level`），配合"用精炼措辞控长度，不要改字号"（铁律 #9）。
- **few-shot 极小**：SKILL.md 内嵌 5 行 edits.json 骨架即可，不需要整份示例。
- **模式 B 兜底**：用户自带 PPT 时渲染 PNG + 现场跑 python-pptx 探查 shape/run，用 explicit `address` 写 edits——同一套输出格式，只是寻址方式降级。
- **模式 C 兜底**：完全原创给一份"不要做的事/推荐版式表/代码模板"（`original-design-guide.md`），约束为"一页 ≤4 元素、1 主色"。

## 二、与 pptx-builder 的决策面对比

| 维度 | GordenPPTSkill | pptx-builder（现状） |
| --- | --- | --- |
| 风格选择 | 21 套模板 INDEX 三表快筛 | `theme` 6 选 1 |
| 页面结构 | 挑页码 | 每页自组 elements（≤300） |
| 版式 | 整页冻结，零决策 | 每元素 `box:{x,y,w,h}` 4 个数 + `region` + `masterRegions`，组件 66 个 |
| 文字产出 | `slot_id→new_text` 纯字符串 | `inputs`：字符串/runs/list(带 level)/table 多形态 |
| 样式 | 不可改 | run 级 `bold/fontSize/color/fontFamily` 全开 |
| 容量提示 | 每槽 `max_chars`+`guidance`，随 detail.json 预发 | `catalog` 现算 `capacity`（`charsPerLine×lines≈approxChars`/`itemCharsPerLine`/`rowCharsPerLine`，`components.py:339-389`），但 box 缩放后实际容量会变 |
| 校验 | 出框/省略号/expected_text，全 advisory | `textOverflow/tableOverflow/overlap/outOfPage/reservedRegion/smallFont` + 已存 PPTX 原生对象复查（`layout_checks.py`），report.json 带 `suggestions` |
| 典型残留风险 | 漏填槽位、超字数、章节名不一致 | JSON/schema 错、组件 ID 错、box 几何错、溢出、小字号——**几何是最大出错源** |

结论：GordenPPT 的强项不是检查更强（pptx-builder 检查明显更强），而是**把最难的决策（几何、样式）从模型手里拿走**。pptx-builder 的小模型化方向应是"在保留强校验的前提下压缩决策面"，而不是照搬模板。

## 三、可借鉴点（落到具体机制）

### A. 整页"页面配方"槽位填充模式（最大杠杆，对应 detail.json 的页级设计）

现状模型要为每个元素写 `box` 坐标——这是全部出错面里最大的一块。借鉴 detail.json 的"页 = 角色 + 命名槽位"思路，新增**页面配方（preset）层**：

- `assets/libraries/builtin/` 新增页面配方清单（如 `page-layouts.json` 或在 `library.json` 加 `pageLayouts` 段）：每个配方 = `id`/`role`（cover/agenda/section/content/ending）/`use_for`/`text_density`/`cautions` + 固定的元素排布（box 全部写死）+ 命名输入槽。
- `components.py`：配方展开为普通 elements 走既有 compile/audit 管线，不新增渲染路径。
- `cli.py::prepare`：`pages[]` 接受 `{preset, inputs}` 形态（schema 放宽，`deck.schema.json` 同步）；模型产出变为 `{"preset":"title-bullets","inputs":{"title":"…","items":[…]}}`——语义上等价 edits.json。
- `catalog` 输出配方段：每槽容量（固定 box 下 capacity 变成**精确值**，不再是估算参考）+ `guidance`（仿 detail.json 写法提示）+ `role/use_for`。
- 首批 10–15 个配方覆盖内网场景：封面/目录/章节页/标题+要点/标题+表格/双栏/KPI 横条/对比/结论/致谢，素材直接复用现有组件与 `examples/*.json` 的成熟排布。
- 配方级"角色索引"（哪些配方是 cover/agenda/ending）+ 推荐骨架（仿 `recommended_pages_for_short_deck`，如"短汇报骨架：cover+agenda+3×content+ending"）。

### B. edits.json 式"只改文本"（retext）模式

对应 GordenPPT 的核心形态。内网高频场景"把去年/旧版汇报 PPT 换成新内容"，现有 `extract`→`deck.json`→`render` 路径会把不支持对象留在母版并重画正文，保真度有损；直接 run 替换则是零失真：

- 新增 `scripts/pptx_builder/retext.py`：`slots source.pptx --out slots.json` 枚举每页文本 run 生成 detail.json 式结构（`slide/shape_id/paragraph/run/current_text/editable 推断/容量估算`）；`retext source.pptx edits.json --out out.pptx` 按 address 替换并保留 run0 格式（直接借鉴 `build_pptx.py:139-173` 的替换语义与 `prune_slides` 选页重排）。
- `expected_text` sanity check 照抄；溢出用既有 `_text_required_height` 估算做 advisory 提示；`selected_slides` 删页重排可复用其 `sldIdLst` 手法。

### C. catalog/输入槽元数据补全

- `capacity` 已有，缺**写法提示**：`library-format.md` 的 input `description` 字段已支持，把各组件关键槽补成 detail.json `guidance` 风格（写什么、示例、字数预期）。
- 配方模式下增加 `role`/`use_for`/`cautions`/`editing_rules`（随配方走的强约束，仿 detail.json 同名字段）。
- `type_scale` 对应物：组件字号本来固定，跨页一致性主要靠"同组件不要缩成不同字号"（见 §四-D 校验侧）。

### D. 校验报告与 lint 增补

- **省略号/截断 lint**：`audit_layout`（`components.py`）或 `prepare` 阶段扫描 inputs 文本结尾的 `.../…/等等/等。`，产出新 issue kind（如 `truncationHint`），建议"重写为完整精炼表达，不要截断"。直接移植 `build_pptx.py:290-305`。
- **溢出文案改成软容量口径**：`textOverflow` detail 已有"约需 X px / box 仅 Y px"，补一个字数级换算（超出≈N 字）+ 一句"容量为估算，宁可轻微超框勿加省略号截断"（1.0.17 教训：硬指标诱导截断）。
- **跨页同组件字号一致性**：同组件在不同页有效字号差异过大时提示（仿 `type_scale`/铁律 #9 的"同级不改字号"），中低优先级。
- `--strict-layout` 语义保持现状（可选项），与 GordenPPT 弃用 `--strict` 的经验一致：默认不阻断，避免诱导截断。

### E. manifest/verify：离线完整性校验（只借机制，不借联网）

- 仿 `build_manifest.py`：生成 `manifest.json`（每文件 sha256+size+version_added/last_modified）+ `VERSION`/`CHANGELOG.md` 纪律；新增 `ppt_tool.py verify` 对清单校验——内网拷贝/分发后防缺文件、防手改。
- `updates.json` 的 `history[].added/modified/removed` delta 格式可用于管理员在内网发增量包；"check 出计划 → apply 执行"的两段式交互值得保留。`update_source` 只允许本地路径/内网共享盘，不做 `git+`/公网 HTTP。
- 与"文件总数 ≤100"的现有维护约束配合：manifest 也让文件数变更可审计。

### F. SKILL.md 写法（对小模型的提示词形态）

- **第一件事确定化**：现有第 1 步已是 `catalog`，升级为 GordenPPT 式红框式"必须第一个执行"。
- **模式化**：改为"模式 A 页面配方（默认）/ 模式 B 自由元素（现形态）/ 模式 C retext 既有 PPT"，给小模型一条默认路径。
- **规则编号化**：现有约束散在段落里，提炼成"编辑铁律"编号清单：先配方后自由排布；capacity 是软参考；禁止省略号截断；同级标题不逐处改 fontSize；改了目录章节名要同步改对应页（仿铁律 #7）。
- **决策表**：扩展现有"场景→页型→组件"表为"场景→配方"表；模板/主题选择规则写成决策树（用户指定→唯一强匹配→列 3 个候选让用户选）。
- **常见误区/失败兜底**：现有失败表保留并纳入新 issue kind；加"一页一个主题、先写大纲表 `页|配方|标题|要点` 再填 JSON"的计划先行要求（ppt-studio §2 的 storyline-first 也值得抄）。
- **few-shot 前置**：最小 preset 配置示例放最前，比自由 JSON 简单一个量级。

### G. 自检回路

- `preview.html` 已覆盖内容预览；可选加 `render-slides` 式诊断（仅当本机有 LibreOffice/PowerPoint 时可用），不作为默认流程——多数内网小模型无视觉能力，结构化 report 仍是主回路。

## 四、不适合借鉴的部分

| 项 | 原因 |
| --- | --- |
| `apply_update/check_update` 的联网更新（`git+` 浅克隆、HTTP 文件镜像、SKILL.md 强制首调用） | 内网离线；只借 manifest/delta/verify 机制（§三-E） |
| 21 套内置模板本身 | 非商业授权、禁止二次分发（SKILL.md 声明，skills_hub 已入 .gitignore）；可借鉴"真实设计师 PPTX + 槽位"机制，让用户自带企业模板走 retext |
| `render_slides.py` 的 LibreOffice+poppler 依赖 | 内网 Windows 未必安装；仅作可选诊断（§三-G） |
| 模式 B"渲染 PNG + 目测推断页面角色" | 依赖视觉能力，本地小模型（尤其纯文本部署）做不了；走 extract/retext 结构化路径替代 |
| preview.png 看图选模板 | 同样需要视觉；保留 INDEX/文字 catalog，preview 位由 `library-demo.html` 承担 |
| ppt-studio 的 COM/pywin32 渲染 QA（`check --com`） | 依赖本机安装 PowerPoint，重且不可移植；与 pptx-builder 的纯 python-pptx 约束冲突 |
| ppt-studio"写一个 build.py 脚本"模式 | 自由度最大 = 出错面最大，与本目标相反；声明式 JSON 契约严格占优 |
| GordenPPT 模式 C 裸 python-pptx 原创 | pptx-builder 已有受限组件约束，不退回自由代码生成；其"≤4 元素/1 主色"原则可作为配方设计准则 |
| 装饰图形随文字联动的暗示 | GordenPPT 用 `shape_caution_pages` 标记"不能联动"——这个"标注不能做什么"的做法要借（§三-C cautions），联动本身不做 |

## 五、结论：按优先级的改进清单

| 优先级 | 改进项 | 落点 | 预期收益 |
| --- | --- | --- | --- |
| P0 | **页面配方（preset）整页槽位填充**：10–15 个写死 box 的配方，`pages[].preset+inputs` 形态，catalog 输出配方容量/guidance/role | `assets/libraries/builtin/page-layouts.json`（新）、`components.py`（preset 展开）、`cli.py::prepare`、`deck.schema.json`、`catalog` | 消除坐标决策——小模型最大出错源；capacity 从估算变精确值 |
| P1 | **SKILL.md 三模式化改写**：配方默认/自由元素/retext，铁律编号化、场景→配方决策表、常见误区、few-shot 前置、"先写大纲表" | `SKILL.md`（+recipe 落地后） | 默认路径最短化，决策从散文变规则表 |
| P1 | **省略号截断 lint + 溢出文案软容量化**：新 issue kind、字数级超出换算、"勿截断加省略号"提示 | `components.py::audit_layout`/`_LAYOUT_SUGGESTIONS`、SKILL.md 铁律 | 堵住"为凑容量砍半句"的小模型典型失败（GordenPPT v1.0.17 实证） |
| P2 | **retext 只改文本模式**：`slots` 提取 + `retext` 应用 + `expected_text`/`selected_slides` | `scripts/pptx_builder/retext.py`（新）、`cli.py` 子命令、`references/` 新 schema 文档 | 覆盖"旧 PPT 换内容"高频场景，零失真，产出格式对小模型最简 |
| P2 | **配方/组件元数据补全**：input `guidance`、配方 `role/use_for/cautions/editing_rules`、推荐页序骨架 | `library.json`/`page-layouts.json`、`library-format.md` | 元数据随数据走，减少提示词依赖 |
| P3 | **manifest + `verify` 命令**：sha256 清单、VERSION/CHANGELOG 纪律、（可选）内网增量包 delta 格式 | `scripts/pptx_builder/manifest.py`（新）、`cli.py`、根目录 `manifest.json`/`VERSION` | 内网分发完整性可校验，文件变更可审计 |
| P3 | **跨页同组件字号一致性检查** | `components.py::audit_layout` | 仿 type_scale，防逐页缩字号破坏一致性 |
| P4 | **可选 render-slides 诊断**（检测本机 LibreOffice 才启用） | `scripts/pptx_builder/render_slides.py`（新，可选） | 有视觉/有 Office 环境时的补充自检，不进默认流程 |

实施建议顺序：P0 配方机制先行（它决定 SKILL.md 怎么改写），P1 两项随之，P2 retext 独立可并行，P3/P4 后置。所有新增保持现有约束：纯本地、JSON 契约、检查默认 advisory、`--strict-layout` 可选。
