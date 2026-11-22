# UML Studio 布局间距走线与默认多色视觉风格优化实施文档

## 背景与目标

针对 UML Studio 当前存在的两类核心体验问题进行原型级快速优化：

1. **线条与元素间距过小**：在节点密集、存在跨层回边或并行走线、以及长标签时序图等场景下，折线贴近节点边框、并行边过于拥挤、或相邻元素通道偏窄。
2. **默认多色视觉风格不够美观**：现有多色预设（如 `vivid` 实色偏刺眼、`pastel` 暖灰底偏浊、`business` 尖角灰线）与现代清爽技术图风格差距较大，需参考目标风格打造更精致的默认多色主题与多色渲染引擎。

## 实施方案

### 一、布局框架与走线间距优化

1. **提升默认模式间距与 ELK 层间留白**（`src/themes.ts`、`src/graph.ts`）
   - 调整 `layoutDefaults`：`compact` `32/56`、`balanced` `56/96`、`spacious` `88/132`、`grid` `36/64`。
   - `layoutOptions()` 中将 `elk.layered.spacing.nodeNodeBetweenLayers`、 `elk.spacing.edgeNode`、`elk.spacing.edgeEdge`、`elk.layered.spacing.edgeNodeBetweenLayers`、`elk.layered.spacing.edgeEdgeBetweenLayers` 与 `elementGap` 动态联动，不再写死为 `14~20px`。
   - 分组 / 包 / 部署节点容器内边距提升为按 `regionGap` 自适应的 `40~56px`（默认均衡态 `43px`），对齐与手动调整扩框逻辑同步保留该留白，使节点 stub 与容器边框间存在充足走线走廊。

2. **正交路由通道居中、容器边框避让与并行线距惩罚**（`src/graph.ts`）
   - `obstacleRouter()` 在收集障碍物与容器边框坐标后，自动补充相邻障碍/容器之间的**通道中线坐标**以及容器内外安全轨道（`±22~24px`），避免走线被迫贴节点或贴分组边框。
   - 新增 `borderHugPenalty()`：对与任意容器边框（含 3D 部署节点的斜切内边）平行且距离小于 `18px` 的线段施加高额代价，同时在 `routeEdges` 选择起止连接侧时计入边框贴近度；节点 stub 自动约束在容器内部安全区内。
   - 对沿节点障碍边界行进的线段增加贴边惩罚；已用走线的并行避让偏移由 `12px` 提高至 `16px`，并对距离已有平行线段过近（`< 16px`）的候选线段施加加重惩罚。
   - `routeEdges()` 提高默认 `clearance`（按 `elementGap` 自适应至 `14~20px`，同时对局部紧邻节点自动钳制以免死锁）；对过短端点间自动缩短 stub 以免误判不可达。

3. **拥挤走线检测与自动扩距回流**（`src/graph.ts`）
   - 在基准路由完成后检测三类拥挤情况：
     - 走线中段与非关联节点边框距离小于安全阈值（`9~13px`）；
     - 走线与任意容器边框平行距离小于 `10px` 且重叠投影 `> 18px`；
     - 不同连线的平行非共用线段间距小于阈值（`< 11px`）且存在明显重合投影（`> 18px`）。
   - 命中拥挤且未达扩距上限时，自动按倍率放大 `elementGap / regionGap`（最多 2 轮），避免极端场景下线条贴元素或贴边框。

4. **时序图横纵留白自适应**（`src/special.ts`）
   - 参与者水平列距根据相邻及跨列消息标签宽度自适应扩展（上限 `340px`），保证常规消息单行清晰呈现、不紧贴生命线。
   - 无末位自调用时收紧右侧冗余留白；参与者卡片高度收敛为 `54px+`，垂直消息间距按 `elementGap * 0.72` 保持紧凑优雅节奏，并增大备注块上下留白。

### 二、参考风格复刻与默认多色视觉风格优化

参考目标图的核心视觉特征：纯白画布 `#ffffff`、高辨识度清爽冷暖色系、超浅明快底色（约 92% 混白 / Tailwind-50 级）+ 饱满 1.8px 彩色描边 + 统一深石板黑 `#0f172a` 粗体文字、主流程深蓝实线箭头 `#1d4ed8`、返回/虚线翠绿箭头 `#059669` 及同色深绿标注 `#047857`、柔和浅灰生命线 `#cbd5e1`、暖琥珀圆角备注卡片 `#fef3c7 / #d97706 / #92400e`。

1. **多色渲染引擎升级**（`src/palette.ts`）
   - 更新 `defaultPalette` 为现代技术图色盘：`['#1d4ed8', '#0891b2', '#059669', '#d97706', '#4f46e5', '#e11d48', '#7c3aed', '#0d9488']`。
   - 优化 `tint` 模式：浅底映射表精确对齐 `#eff6ff / #ecfeff / #ecfdf5 / #fffbeb / #eef2ff / #fff1f2 / #f5f3ff / #f0fdfa`（自定义色使用 `mix(color, '#ffffff', 0.92)`）；浅色画布正文统一使用深石板黑 `#0f172a`（高对比、不浑浊），次要文字 `#475569`。
   - 优化 `gradient`、`solid` 与 `regionPaint` 层次，降低渐变厚重感，让分组背景更轻盈通透。

2. **新增并启用默认主题 `modern`（现代多彩）与存量多色预设调优**（`src/themes.ts`、`src/types.ts`、`src/Studio.vue`）
   - 新增 `modern`（`现代多彩`）主题：`#ffffff` 纯白背景、`radius: 10`、`lineWidth: 1.8`、`primary: '#1d4ed8'`、`secondary: '#059669'`、`border: '#cbd5e1'`、`text: '#0f172a'`、`muted: '#475569'`、`paletteMode: 'tint'`。
   - 将默认主题由 `ocean` 切换为 `modern`（`ocean` 等原有主题全部保留并兼容）。
   - 同步优化 `vivid`、`pastel`、`business`、`steel`、`aurora` 的线宽、圆角、底色与配色平衡。

3. **图元与连线语义配色细节**（`src/special.ts`、`src/graph.ts`）
   - **时序图**：
     - 生命线使用更轻柔的虚线（`theme.border`、`0.85 * lineWidth`、`6 6`）。
     - 同步/请求消息使用 `theme.primary` 实线箭头与深色加粗标签；返回/虚线消息（`return` 或非创建虚线）使用 `theme.secondary` 虚线箭头与深翠绿加粗标签。
     - 自动编号格式采用 `1. `，备注卡片采用现代圆角琥珀卡片（`#fef3c7` 填充、`#d97706` 描边、`#92400e` 文字）。
   - **节点图**：
     - 虚线语义边（`dashed / dependency / include / extend / realization`）在多色主题下使用 `theme.secondary` 及其对应箭头标记，形成清晰主次层次。
     - `note` 节点在多色浅色模式下默认采用暖琥珀卡片配色，提升辨识度。
     - 连线标签改用高可读性深色文字与清晰白底药丸背景。

## 涉及文件

- `.agents/skills/uml-studio/src/types.ts`
- `.agents/skills/uml-studio/src/palette.ts`
- `.agents/skills/uml-studio/src/themes.ts`
- `.agents/skills/uml-studio/src/graph.ts`
- `.agents/skills/uml-studio/src/special.ts`
- `.agents/skills/uml-studio/src/Studio.vue`
- `.agents/skills/uml-studio/scripts/diagram.mjs`
- `.agents/skills/uml-studio/SKILL.md`
- 构建产物（`dist/`、`assets/`、`schemas/`、`demo-dist/`）与 `docs/` 文档同步

## 完成状态与验证（2026-11-22）

状态：已完成实施、全量构建与视觉/几何验证。

- `npm run build`：通过（`vue-tsc`、`assets/viewer.*`、`dist/*`、`schemas/*.json`、`demo-dist/index.html` 全部重建）。
- 27 张场景图几何检查（`scripts/demo-checks.mjs`）：全部通过，0 裁切、0 重叠、0 断线。
- 目视对比验证（产物保存在 `temp/uml-verify/`）：
  - `ref-seq2.png`：默认 `modern` 主题复刻参考图时序场景，白底 + `#eff6ff/#1d4ed8`、`#ecfeff/#0891b2`、`#ecfdf5/#059669`、`#fffbeb/#d97706` 卡片、深蓝实线与翠绿虚线返回、圆角琥珀备注卡片与横纵比例高度一致。
  - `flow-modern.png`、`arch-modern2.png`、`swimlane-modern.png`：走线居中于通道、并行线拉开清晰间隔、节点与线条不再贴边拥挤。
