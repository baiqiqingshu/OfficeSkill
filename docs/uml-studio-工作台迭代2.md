# UML Studio 工作台迭代 2 实施文档

承接 docs/uml-studio-工作台重构.md。本轮：粘贴外部资源、框选改右键拖动、侧栏 Tab、光标、检查器修复、性能、画布去框、提示置顶。

## 1. 外部资源粘贴（Agent B）

目标：在画布/工作台任意处 Ctrl+V 粘贴剪贴板内容。
- **图片**：剪贴板含 `image/png|jpeg|webp|svg`（clipboardData.items 文件项，或 text/html 中的 `<img src>`/`<svg>`）→ 读为 data URL，向当前 nodes/edges 家族图追加图片节点；非节点图家族→新建一张 flowchart 图放入图片节点。
  - 新节点 kind `'image'`：types.ts `DiagramNode.kind` 增 `'image'`；新增可选字段 `src`（data URL）、`width`、`height`（缺省如 240×160，浏览器粘贴时尽量读 Image 实际尺寸写入）。
  - `schemas/diagram.schema.json` + `validate.ts` 放行 image/src/width/height；`graph.ts` 渲染 `<image href="data:…">` 矩形图元（可带 label 题注）；resvg 原生导出需验证 data: URI 可用。
- **纯文字**：
  - 文本为合法 UML JSON（单图/多图文档）→ 按导入处理新增为图；
  - 以 mermaid 图头开头（flowchart|graph|sequenceDiagram|stateDiagram|classDiagram）→ 走现有 mermaid 转换新增为图；
  - 其它纯文本 → 当前 nodes/edges 图追加 `kind:'note'` 节点（label=截断后的文本，超长省略号，detail 存全文）。
- paste 监听挂在 Studio 层（focus 在 input/textarea/contenteditable 时跳过）。

## 2. 框选改右键（Agent A，DiagramCanvas.vue）

- 空白处**按住右键拖动**=框选（替代现有长按 350ms；保留 Shift+左键拖动框选）。
- 右键快速点击（未拖动）→ 不拦截，继续冒泡触发 Studio 的 `@contextmenu` 画布菜单；一旦进入框选则 `contextmenu.preventDefault()` 抑制菜单。
- 框选逻辑/命中判定沿用现有实现。

## 3. 左侧栏 Tab（Agent B）

- 侧栏分两个 Tab：**主题**（默认）、**图表**。主题 Tab 含主题网格+「调整样式…」入口；图表 Tab 含文档名、搜索、图表列表、复制当前图/移除、示例新增、粘贴 Mermaid 新增。

## 4. 光标（Agent A）

- 画布 `cursor: grab/grabbing` 改为默认箭头（拖平移时可用 `move`）；元素 hover 用 `pointer`；连线模式仍 `crosshair`。

## 5. 检查器点击不显示元素信息（Agent B，须复现修复）

现象：点击画布元素后右栏未显示该元素字段。排查方向：
- `data-editor-key`（渲染候选 spec 的 `field/index`）与 `applied`（Studio spec）索引是否一致（validateSpec 是否重排/补默认导致 indexOf 结果与 Studio 侧 spec 不同）；
- `selectElement('')` 清空时 `selectedKeys=['']` 的脏状态；
- ElementInspector 解析 `field/index` 分支（含 `causes/…` 深层路径、`effect`、`boxes`）；
- 选中后 `applied` 更新导致 inspector spec prop 换引用但 selectedKeys 未重置时的兼容。
修复要求：节点/连线/分组/泳道/参与者/消息/片段/鱼骨各项点选均能显示并可编辑。

## 6. 性能（Agent B 主，Agent A 配合）

现状每次 updateSpec → validate + 全量 ELK 布局 + structuredClone×2 + 全 DOM 替换。优化：
- **检查器文字输入防抖**：inspector 文本类字段 commit 加 ~300ms 防抖（select/颜色等 change 类立即）；或 updateSpec 接受 `{debounce}` 选项由 Studio 层合并调度。连续输入不触发多次排版。
- **选择态不重渲染**：selectedKeys/marqueeKeys 变化不得触发 setSpec/排版（确认 watch 未误触）。
- **渲染请求合并**：DiagramCanvas.setSpec 已有 ticket 竞态控制；对连发 setSpec 做"只保留最后一次"节流（pending 时丢弃中间态），大图输入时最多同时一个布局在跑。
- 低垂优化：refreshPositionHandles/refreshSelectionOverlay 避免每次全量重建；structuredClone 次数能减则减。
- 不做 Web Worker/虚拟化等大改（原型阶段）。

## 7. 画布去"实时预览"框（Agent B）

- 去掉画布外圈卡片式容器/标题栏；图标题、类型徽标、缩放控件、导出条、工具条全部改为画布上的浮动元素（absolute，半透明圆角浮层，不挤压主图）。
- "实时预览" 状态文案改为画布角落浮动小徽章（排版中/失败仍提示）。

## 8. 提示置顶（Agent B）

- `.studio-toast` 与错误横幅改为页面顶部居中浮动提示（fixed，top ~16px，居中，自动消失 toast；错误横幅保留可关闭）。

## 分工

- **Agent A**：`src/DiagramCanvas.vue`（右键框选、光标、画布内选择渲染性能、提示条文案改"右键拖动框选"）。
- **Agent B**：`src/Studio.vue`、`src/ElementInspector.vue`、`src/AddElementDialog.vue`、`src/graph.ts`、`src/types.ts`、`src/schema.ts`、`src/validate.ts`、`schemas/diagram.schema.json`（粘贴、侧栏 Tab、去预览框、toast 置顶、检查器修复、updateSpec 防抖）。

## 实施结果（已落地）

- 粘贴：`Studio.vue` window 级 paste 监听；图片→`kind:'image'` 节点（types.ts/validate.ts/schema.ts/schemas 全链路放行，`graph.ts` 渲染 `<image>`+圆角裁剪+题注）；文本→UML JSON 导入 / Mermaid 转换 / `note` 节点三分流。`src` 限 `data:image/` ≤5MB。
- 框选：`DiagramCanvas.vue` 右键拖动=框选（>5px），右击不拦截画布菜单、拖动后抑制 contextmenu；长按框选已删，Shift+左键保留。
- 侧栏：「主题」（默认）/「图表」双 Tab。
- 光标：默认箭头；拖动 `move`；元素 `pointer`；连线 `crosshair`。
- 检查器 bug 根因：画布 `selectElement` 后紧跟 `selectionChange([])` 覆盖单选 → `onSelectionChange` 仅真实框选才写 `selectedKeys`；空选清为 `[]`。已修复。
- 性能：检查器文本输入 `updateSpecDebounced`（300ms 合并）；选择态不触发排版；overlay 按 key 复用、逆矩阵单次计算、命中判定松手一次完成。
- 画布去框：预览卡片移除；标题/类型徽标、缩放控件、工具条、导出条全部画布内浮动；"实时预览"状态改为角落小徽章。
- 提示：`.studio-toast` / `.error-banner` 移至视口顶部居中。

## 约束

- VSelect 下拉规范、`window.UmlStudio` API、MIT/THIRD_PARTY_NOTICES 不变；data-editor-key 体系沿用。
- image 节点 data URL 须可随 HTML/JSON 保存并在 resvg 原生导出中渲染。
- 完成后 `npx vue-tsc --noEmit` + `npm run build` + 受影响测试通过。
