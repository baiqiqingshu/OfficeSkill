# Tech Poster 背景与主题体系

> 合并自《内置背景重设计》与《背景-主题联动 + 芯片半导体背景》两份实施文档。代码为唯一事实，本文描述当前实现。

## 1. 目标与演进
- **R1 背景重设计**：参考稿定/Canva 科技长图（玻璃浪潮、3D 柱群城市、光环星球光柱、雪峰主视觉），背景由 9 套简陋纹理删减重绘为 5 套；新增「全局一体」构图；去掉 Hero 与正文之间的 `.hero-curve` 接缝。
- **R2 主题联动 + 半导体**：切换背景时自动切换到配套内容主题（缺失的新增）；新增 4 套芯片/半导体背景与主题。

## 2. 构图模式
- **split 分体**：Hero 自带渐变 + 主视觉插画；插画底部用「画布色 → 不透明」渐变遮罩融合，正文 `margin-top` 负值上移叠压，首卡压在主视觉上，无接缝。
- **unified 一体**：Hero 透明，渐变/星野/浪带/走线全部画在 `.poster-canvas` 上；浅色一体背景通过 CSS 变量把 Hero 文字改为深色渐变。

CSS 变量：`--hero-art-h`（主视觉高度）、`--hero-pad-b`（Hero 底部留白，保证主视觉不压文字）、`--body-lift`（正文上移量）、`--hero-meta-bg/-border`、`--footer-text/-border`。

## 3. 背景 → 配套主题
| 背景 | 模式 | 视觉 | 配套主题 |
|---|---|---|---|
| `everest-blue`（默认） | split | 深蓝晨光 + 低多边形珠峰雪顶 + 远山云雾 | `blueprint` |
| `skyline-tech` | split | 亮蓝天空 + 3D 柱群城市 + 透视网格光环 + 侧向光束 | `sky-azure` |
| `starfield` | unified | 深空蓝 + 光环星球 + 光柱 + 星野星云 | `cosmos-night` |
| `glass-aurora` | unified | 浅蓝紫 + 玻璃浪带 + 悬浮 `</>` 晶片 + 细线圆环 | `lavender-glass` |
| `clean-slate` | unified | 浅色纸面 + 顶部色条 | `ink-print` |
| `chip-die` | unified | 深青黑 + 等轴测芯片封装/引脚/电路网格晶核 + 放射走线焊盘 + 上升光束 | `silicon-dark` |
| `wafer-fab` | split | 靛紫渐变 + 虹彩透视晶圆（晶粒网格、缺口、高光）+ 照明光束 | `wafer-iris` |
| `pcb-trace` | split | 深绿 PCB + 俯视 SoC + 四边引脚 + 金色扇出走线/过孔 + 贴片元件丝印 | `pcb-gold` |
| `euv-litho` | unified | 深紫 + EUV 光源 → 多层反射镜 → 掩模版 → 投影光锥 → 晶圆曝光光斑 | `litho-violet` |

通用主题 `slate-dark` / `paper-tech` / `emerald-ops` 保留，仅手动选择。

旧背景 id 兼容：`everest-night`/`nebula-tech` → `starfield`，`pixel-summit` → `skyline-tech`，`glass-wave`/`aurora-mesh` → `glass-aurora`，`blueprint-grid`/`topo-contour` → `everest-blue`，`circuit-board` → `pcb-trace`，`dot-matrix` → `clean-slate`。

## 4. 联动规则
- `BACKGROUNDS[id].theme` 声明配套主题，`themeForBackground(id)` 读取（Node 与浏览器共用）。
- JSON 只写 `background`：主题 = 配套主题；同时写 `theme`：尊重 `theme`。
- CLI：`--bg` 或 `--set background=` 改了背景、且同一命令未给 `--theme` / `--set theme=` → 主题跟随背景。`--presets` 输出背景与主题配对。
- HTML 工作台：工具栏切背景 → 同步切主题下拉框并 toast 提示；之后可手动改主题。`TechPoster.setBackground(bg, { keepTheme: true })` 可保留当前主题。
- 背景 CSS 只负责画布与 Hero，不再覆盖卡片 `--surface` 等主题变量。

## 5. 代码落点（`.agents/skills/tech-poster/scripts/`）
| 文件 | 职责 |
|---|---|
| `backgrounds.mjs` | 背景清单（mode/theme）、别名、`resolveBackground()`、`themeForBackground()`、通用 5 套 Hero 主视觉 |
| `backgrounds-chip.mjs` | 4 套半导体 Hero 主视觉（等轴测 slab/grid 工具函数） |
| `backgrounds-css.mjs` / `backgrounds-chip-css.mjs` | 画布 CSS（仅 Node 构建内联） |
| `themes-css.mjs` | 8 套扩展主题 CSS 变量；`poster-core.mjs` 的 `THEMES` 同步登记名称 |
| `render.mjs` | 拼装 CSS；浏览器内联包按 `backgrounds-chip → backgrounds → poster-core → client-app` 顺序打包并剥离 import/export |
| `poster.mjs` / `client-app.js` | CLI 与工作台联动逻辑 |

所有装饰均为内联 SVG / CSS 渐变，SVG id 统一 `tpbg-` 前缀，零外链。

## 6. 验证
- `node .agents/skills/tech-poster/tests/smoke.test.mjs`：含背景自动匹配主题（4b）、工作台切背景联动主题断言。
- 9 套背景 CLI 导出与浏览器端 DOM→PNG 管线均已目视检查。
