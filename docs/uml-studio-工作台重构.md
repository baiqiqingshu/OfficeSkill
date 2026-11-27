# UML Studio 工作台重构实施文档

目标：把当前"平铺式"HTML 工作台重构为以中央大画布为核心的成熟编辑器界面，并补齐画布交互（选择/删除/连线/框选/加元素）。

## 设计目标（对标 draw.io / ProcessOn 类布局）

```
┌──────────────────────────────────────────────────────────┐
│ 顶栏: 品牌 | 文档名 | 保存HTML 同步本地 | ⋯菜单           │
├────────┬───────────────────────────────────┬─────────────┤
│ 左栏    │  浮动工具条(选择/连线/加元素/删除) │ 右栏:       │
│ 图表列表│                                   │ 元素属性    │
│        │        大 画 布                    │ (选中项)    │
│ 主题切换│                                   │             │
│        │  浮动导出条(格式/导出图/复制图)     │             │
└────────┴───────────────────────────────────┴─────────────┘
```

视觉：现代质感、中文文案、SVG 图标、圆角卡片与按钮；按钮不用渐变；隐藏组件（下拉 VSelect、右键菜单、弹框、details）同样设计；尽量减少 AI 感。

## 布局改造（src/Studio.vue + 新组件）

1. 顶栏：品牌 + 文档名 + 状态；右侧「保存 HTML」「同步到本地」+「⋯」溢出菜单。
   溢出菜单项：新建图（按图型二级菜单或弹框选类型）、导入 JSON / HTML / Mermaid（importInput.click()）、下载文档 JSON、设置默认保存目录、另选本地文件。
   画布空白处右键弹出同样内容的上下文菜单（阻止默认菜单）。
2. 左侧栏：保留图表列表（搜索、选中切换、复制/删除）、文档名输入；新增「主题」区块（theme-grid 移入，切换当前图主题）。
3. 画布浮动工具条（absolute 定位，不占布局、不影响主图）：
   - 模式组：选择（默认）/ 连线
   - 操作组：添加元素、删除所选、清空位置调整
   - 视图组：缩小 / 缩放% / 放大 / 适应画布 / 原始大小（可复用 canvas 暴露的方法或保留画布内控件）
   - 导出组：格式选择 + 导出图片 + 复制图片(PNG)
4. 右侧栏：元素检查器（新组件 ElementInspector.vue）
   - 有选中：只展示该元素的可编辑字段（节点：label/kind/detail/group/lane/style；连线：label/kind/arrow/startArrow/dashed/bidirectional/thick/waypoints 提示；泳道/分组：label；时序参与者/消息/片段、鱼骨分类/原因同理）。
   - 无选中：展示图级字段（title/description/type）+ 提示"点击画布元素进行编辑"。
   - 无需"应用"按钮：修改即通过 updateSpec 直接写入（input 事件即时提交，渲染失败回显错误不覆盖画布）。
   - 原 FormEditor（整图表单）保留，可从右栏底部"完整编辑"展开或菜单进入。
5. 调整样式 → 改为弹框（modal）：原 preview-style-panel 内容（主题、多色、配色覆盖、字体与细节、布局与尺寸、连线交叉）整体移入居中弹框。
6. 删除原「调整位置」切换按钮——位置调整并入选择模式（见画布交互）。
7. 错误横幅、保存状态、草稿指示保留，样式统一。

## 画布交互（src/DiagramCanvas.vue，渲染层 src/graph.ts / src/special.ts）

### 元素寻址（已存在，勿新造）
SVG 内 `data-editor-key="<field>/<index>"`：nodes/edges/edge-labels/participants/messages/fragments/boxes/categories/causes/effect。分组/泳道区域 rect 当前无 key——需在 graph.ts 分组区域、泳道区域元素上补 `data-editor-key="groups/<i>"` / `lanes/<i>"`。
连线另有 `data-waypoint-key`（adjustments 键）、`data-edge-id`、`data-from`/`data-to`；节点有 `data-node-id`、`data-group-id`、`data-lane-id`。

### Props（新增）
```ts
interactionMode?: 'select' | 'connect'   // 默认 'select'
selectedKeys?: string[]                  // data-editor-key 列表，用于高亮
marqueeKeys?: string[]                   // 框选集合（可与 selectedKeys 合并渲染）
```
`positionEditing` 保留但 Studio 恒传 true（位置调整并入选择模式）。

### Emits（新增/沿用）
```ts
selectElement: [key: string]                        // 单击任意元素（沿用）
selectionChange: [keys: string[]]                   // 框选/多选变化（新增）
requestDelete: [keys: string[]]                     // Del/删除按钮删除所选（新增）
connectNodes: [{ from: string; to: string }]        // 连线模式两节点 id（新增）
adjustElement / adjustWaypoints                      // 沿用
```

### 行为
- 选择模式：
  - 单击元素 → emit selectElement + 高亮（描边/手柄）。点击空白清空选择。
  - 点击按住元素拖动 → 现有 adjustElement 偏移逻辑（选择模式下常开）。
  - 点击连线 → 选中该连线（高亮+途经点手柄），可拖途经点/双击加点，沿用 adjustWaypoints。
  - Delete/Backspace（焦点在画布且不在输入框）→ emit requestDelete(当前选中 keys，连线用其 edges/<i> editor key)。
  - 空白处**长按（>350ms）后拖动** → 框选矩形；按 data-editor-key 元素的 bbox 与矩形相交判定（getBBox/getBoundingClientRect + getScreenCTM 换算）。松手 emit selectionChange(keys)。普通单击清空框选；Shift+拖动也触发框选。
  - 空白处普通拖动 = 平移（保留）；滚轮缩放保留。
- 连线模式：点击节点 A 高亮为源 → 点击节点 B → emit connectNodes({from,to})（data-node-id）；Esc 或切回选择退出。连线模式禁用框选/拖动。
- 高亮渲染：在 SVG overlay 层（参照 data-position-handles 做法）绘制选中描边与框选矩形，不改动原图元。

## Studio 侧数据操作（配合画布事件）

- `onSelectElement(key)` → 更新 selectedKeys=[key]，右栏检查器定位。
- `onSelectionChange(keys)` → selectedKeys=keys（框选集合保留在 marqueeKeys，单击清空）。
- `onRequestDelete(keys)` → updateSpec 删除：edges/<i> 删连线并清理引用；nodes/<i> 删节点并删其所有 from/to 连线、清理 layout.adjustments；groups/lanes 删除时仅解除子元素 group/lane 引用（不删子元素）；participants/messages/fragments/categories 等按数组删除（注意 fragments 的 from/to/elseAt 索引平移，可保守：时序/鱼骨只允许删除叶子项，复杂结构在检查器中提示不支持）。
- `onConnectNodes({from,to})` → 当前图 nodes/edges 家族时 push {from,to} 新连线。
- 添加元素弹框（AddElementDialog 或内联）：字段 名称 label、类型 kind（VSelect，按图型给出候选）、所属分组 group（VSelect 现有分组）。若当前框选集合非空且选择"容器/分组"类型 → 新建 group 并把 marqueeKeys 中 nodes/<i> 的 node.group 设为新组 id。

## 文件分工

- Agent A（壳层）：src/Studio.vue 全面改版；新增 src/components 或同级新组件（ElementInspector.vue、AddElementDialog.vue、StyleDialog.vue、ContextMenu.vue/AppMenu.vue）；全局样式重写；按上述契约接线画布事件与数据操作。
- Agent B（画布）：src/DiagramCanvas.vue 交互改造；src/graph.ts / src/special.ts 补 groups/lanes 的 data-editor-key；提供 props/emits 契约实现。
- 契约以本文档为准；双方不得改对方文件。

## 约束

- 下拉一律用 VSelect.vue；不得新增裸 `<select>`。
- 不引外部依赖/CDN；产物必须可离线单文件。
- 保留 MIT / THIRD_PARTY_NOTICES 写入逻辑；`window.UmlStudio` API 不变。
- 完成后根目录 `npm run build` + `npm run test`，更新 SKILL.md 网页能力描述与本文档/DESIGN.md。
