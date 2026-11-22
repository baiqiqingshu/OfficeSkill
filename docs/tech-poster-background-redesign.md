# Tech Poster 内置背景重设计（实施文档）

## 目标
- 参考稿定/Canva 科技长图（玻璃拟态浪潮、3D 城市柱群、光环星球光柱、雪峰主视觉），提升内置背景的设计感。
- 背景从 9 套删减为 5 套，并新增「全局一体（unified）」背景模式；保留「分体（split）」模式。
- 修复分体背景 Hero 与正文之间渐变断层（旧 `.hero-curve` 与 Hero 渐变不连续，出现明显接缝）。

## 背景清单
| id | 模式 | 视觉 |
|---|---|---|
| `everest-blue`（默认） | split | 深蓝渐变 Hero + 低多边形珠峰主峰/雪面高光 + 多层远山 + 云雾，底部渐隐到正文浅蓝 |
| `skyline-tech` | split | 亮蓝天空 Hero + 3D 立体柱群城市 + 透视地面网格 + 光环 + 侧向光束，底部渐隐 |
| `starfield` | unified | 全画布深空蓝：星野 + 光环星球 + 竖直光柱 + 地平光晕；正文持续星野与星云光晕 |
| `glass-aurora` | unified | 全画布浅蓝紫：玻璃浪带 + 柔光球 + 细线圆环；正文侧边流动丝线，标题深色 |
| `clean-slate` | unified | 纯净浅色纸面 + 极轻点阵角标，打印友好 |

旧 id 兼容映射：`everest-night/nebula-tech → starfield`，`pixel-summit → skyline-tech`，`glass-wave/aurora-mesh → glass-aurora`，`blueprint-grid/circuit-board → everest-blue`。

## 实现要点
- `BACKGROUNDS[id].mode` 标记 `split | unified`，新增 `resolveBackground()` 统一处理默认值与旧 id 别名（Node 与浏览器端共用）。
- 移除 `.hero-curve` 过渡带。分体模式下 Hero 自身渐变最后一档 = 正文画布色，主视觉 SVG 底部用「画布色 → 透明」渐变遮罩融合，正文上移叠压（`margin-top` 负值）形成卡片压图效果，彻底消除接缝。
- 一体模式下 Hero 背景透明，渐变/纹理全部绘制在 `.poster-canvas` 上，Hero 主视觉仅作前景插画；浅色一体背景通过 CSS 变量覆盖 Hero 文字色与元数据卡样式。
- 全部装饰为内联 SVG / CSS 渐变，零外链；SVG 内 id 加 `tpbg-` 前缀避免与栏目图冲突。

## 代码落点
- `scripts/backgrounds.mjs`：背景清单、旧 id 别名、`resolveBackground()`、5 套 Hero 主视觉 SVG（浏览器内联包也会打入，`render.mjs` 打包时剥离 import/export）。
- `scripts/backgrounds-css.mjs`：5 套画布 CSS（仅 Node 端构建时内联），通过 `--hero-art-h / --hero-pad-b / --body-lift / --hero-meta-* / --footer-*` 变量控制 Hero 高度、正文叠压与浅色一体背景的文字配色。
- `scripts/render.mjs`：移除旧背景资产与 `.hero-curve`；Hero 主视觉贴底绝对定位，正文 `margin-top` 负值叠压，页脚透明以露出底部装饰。
- 验证：`node .agents/skills/tech-poster/tests/smoke.test.mjs` 全部通过；5 套背景 CLI 导出与浏览器端 DOM→PNG 管线均已目视检查。
