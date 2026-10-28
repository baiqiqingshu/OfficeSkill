# 前端重设计第三轮：ucd-studio demo 推翻重来

> 前两轮（`docs/frontend-redesign.md`、`frontend-redesign-r2.md`）在既有视觉体系内打磨。
> 本轮用户明确反馈"当前 demo 页面太丑，推翻重来"：**视觉语言整体更换**——新的配色体系、
> 排版尺度、布局质感与组件形态；管线与契约（DOM 钩子、离线、生成方式）保留。

## 1. 保留（管线契约，不可破坏）

- 渲染管线：`scripts/ucd.py`/`render.py` 内联 `assets/base.css`（`/* component: X */` 注释切分）、
  `assets/shell.html`、`assets/runtime.js`、`data/styles.json` → 离线单文件 HTML。
- `data/styles.json` 的 8 主题令牌键结构（可改色值、可加键，validate() 只认已定义键）。
- `assets/runtime.js` 依赖的全部类名与 `data-*` 钩子、dense 密度模式、
  1180/760px 断点、`prefers-reduced-motion`、`component:` 注释块、CSP、`audit()`
  （禁 `url(`、禁外联）、单文件离线产物形态。
- `python scripts/make_demo.py` 再生成 + `python -m unittest discover -s tests -v` 必须通过；
  demo/ 10 页 + `assets/gallery.html` 门户同步重做；文件总数 ≤100。

## 2. 推翻重来的设计方向（新视觉世界）

旧世界（澄海工作台）全部作废，重新选型。方向（实施者可在内微调，不另行请示）：

- **质感**：现代 SaaS 质感——纸感浅底（微暖白 `#fafaf9` 系）或冷白纸二选一；
  弥散阴影两层（`0 1px 2px` + `0 12px 32px -12px`，透明度 ≤10%）；
  卡片 hover `translateY(-2px)` + 阴影加深；边框 1px 低对比中性色。
- **渐变纪律**：仅品牌方块（logo，可 135° 双色）、`:focus-visible` 光环、
  顶栏底部 1px 品牌渐变发丝线或类似小面积点缀。**按钮一律实色**，hover color-mix 加深。
- **磨砂玻璃**：仅 sticky 顶栏 + 窄屏抽屉；`blur(12-16px) saturate(1.3-1.5)` + 半透明底。
- **色彩**：中性灰阶用带色相倾向的现代灰（非纯灰），品牌色 8 主题各自重新校准
  （饱和适中、对比度达标）；语义色 success/warning/danger 收敛为柔和但有辨识度。
- **排版**：中文优化——标题字重 600–650、正文 13–14px、辅助 12px muted；
  数字用 tabular-nums；行高标题 1.3/正文 1.6；层级靠字重+灰度而非大跨度字号。
- **形态**：面板圆角 12px、控件 8–10px、badge/状态 pill；图标全部内联 SVG
  （stroke 1.5–1.7、currentColor、aria-hidden）；禁 emoji、禁 Unicode 当图标、
  禁紫粉渐变、禁渐变文字、禁玻璃卡片。
- **隐藏组件全部重设计**：`<select>`/`option`（appearance:none + chevron）、
  `<dialog>`（圆角+阴影+遮罩）、`details/summary`（chevron 旋转）、toast、
  骨架屏扫光、空/错误态（内联 SVG 插画）、禁用态、滚动条、`::selection`、
  表格 hover/active sort。
- **布局**：顶栏更轻盈（高度 ~52px、面包屑并入）、侧栏导航项 pill 态、
  面板分区更多留白；门户 gallery.html 与 demo 同语言重做。
- **减少 AI 感**：克制装饰、不用对称居中营销布局、文案为真实业务口吻。

## 3. 实施要点

- `assets/base.css` **整文件重写**（保留 component 标记与顺序），`data/styles.json`
  8 主题令牌值全面重校，`assets/shell.html`、`assets/gallery.html`、
  `assets/components/*.html` 同步重做；必要时 `scripts/render.py` 结构微调。
- `DESIGN.md` 重写为新世界规范；`references/design-guidelines.md` 冲突表述修正；
  `scripts/ucd.py` 内 design_doc 文案同步。
- 视觉验收：任意打开 3 个生成 demo 确认新世界落地；`grep url(`=0、外链=0。

## 4. 文件数约束

- 全部 `.agents/skills/*` git 跟踪文件 ≤100（当前最大 uml-studio 99、archify 100），
  本轮只允许 ucd-studio 在 82 → ≤100 内变动；不动其他 skill。

## 5. 验收清单

1. `python -m unittest discover -s tests -v` 全过；`make_demo.py` 再生成成功；
   抽样 `ucd.py check` 通过。
2. 生成物 0 `url(`、0 外联（CSP meta 除外）、0 emoji、按钮 computed style 无 gradient。
3. git ls-files 各 skill ≤100。
4. 视觉抽查：新配色/排版/卡片/顶栏/门户明显区别于旧世界且符合 §2 方向。
5. 提交并推送；本文件为现行记录（追加实施结果）。
