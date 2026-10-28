# 前端重设计历史归档（第 1–4 轮）

> 已合并原 `frontend-redesign.md`（r1）、`frontend-redesign-r2.md`、
> `frontend-redesign-r3.md`、`frontend-redesign-r4.md` 四份契约。仅保留决策史；
> 现行权威文档 = `uml-studio-redesign.md`（uml-studio「砚松」）+
> 各 skill 内 DESIGN.md（ucd-studio「霁蓝瓷面」）。本轮契约 = `frontend-redesign-r5.md`。

## r1（frontend-redesign.md，提交 20f4a2c 附近）

- 范围：uml-studio 修正性迭代 + ucd-studio 全量重设计 + 两 skill 文件数 ≤100。
- 关键规则确立并沿用至今：按钮一律实色（含主按钮）；渐变只允许 logo 方块、
  `:focus-visible` 光环、导航局部点缀；磨砂玻璃仅顶栏/窄屏抽屉；全中文 + 内联 SVG 图标；
  隐藏组件同等设计（select/option、details 浮层、toast、空/错误态、禁用、滚动条）；
  离线禁 `url(`；保留全部 DOM 钩子、断点、`prefers-reduced-motion`。
- uml-studio：`.button-dark`/`.button-accent`/`.uml-editor-apply` 渐变→`--accent` 实色；
  `PRODUCT.md` 并入 `DESIGN.md`；文件数 101→≤99（合并 tests/fixtures）。

## r2（frontend-redesign-r2.md）

- 范围：ucd-studio demo 二次精修（排版层次、8px 间距节奏、语义色收敛）+
  **所有** `.agents/skills/` skill 的 git 跟踪文件数 ≤100（此后成为仓库约束）。
- 设计语言沿用 r1 契约不推翻。

## r3（frontend-redesign-r3.md）

- 用户反馈「demo 太丑，推翻重来」：ucd-studio 视觉世界整体更换（管线保留）。
- 确定「管线契约 vs 视觉世界」分离范式：渲染管线、token 键结构、类名、
  `component:` 注释块、`audit()`、生成方式不可破坏；视觉令牌可整体替换。

## r4（frontend-redesign-r4.md，提交 ea95df5）

- ucd-studio 落地「霁蓝瓷面」（Porcelain Sapphire）：冷调瓷白 `#f4f6f9` + 蓝宝石实色
  `#1f4fd8` + 磨砂玻璃顶栏；8 主题中性阶全部带蓝灰色相；demo 9 页 + 门户同步重做。
- uml-studio 保持「澄海工作台」未动，直到 r5 本轮更换为「砚松」。

## 演进脉络

| 轮 | 对象 | 视觉世界 | 结果 |
|---|---|---|---|
| r1 | uml-studio + ucd-studio | 澄海工作台（海洋蓝→青碧） | 实色按钮规则确立 |
| r2 | ucd-studio | 同 r1 精修 | 全 skill ≤100 文件成约束 |
| r3 | ucd-studio | 推翻重来方向 | 管线/视觉分离范式 |
| r4 | ucd-studio | 霁蓝瓷面（sapphire #1f4fd8） | ea95df5 落地 |
| r5 | uml-studio | 砚松（暖纸 #f3f2ee + 墨黑 #1f2430 + 松绿 #0d6e55） | 本轮，见 frontend-redesign-r5.md |
