# UML Studio 连线连接方式优化实施方案

## 1. 背景与问题诊断

基于对 `.agents/skills/uml-studio/src/graph.ts` 源码及示例图实际渲染结果的分析，当前正交连线与端点连接存在以下核心问题：

1. **多线同向汇入未聚合且导致偏心连接**
   - `routeEdges` 中目标锚点比例为 `targetFraction = straight ? 0.5 : targetIndex / (count + 1)`，同一方向多条入边会被分散到 `1/3`、`2/3` 等非居中位置。
   - 对于菱形判断节点（`decision`），偏心锚点经 `clipEndpoint` 投影后会落在斜边中段而非菱形顶点（如 `swimlane.json` 的 `submit -> review` 及多入边菱形场景）。
   - 更严重的是，`targetFraction` 按初始启发边计数计算，在候选边切换为其它侧时仍沿用该非居中比例，导致单边接入也可能偏心（如 `flowchart.json` 的 `retry -> import`、`manual -> mapping`）。

2. **同向汇入/分叉未共享主干段，重叠惩罚导致连线被挤到其他边**
   - `routeEdges` 在评估候选路径时，对整条路径（包含 `[sourcePort, sourceStub]` 和 `[targetStub, targetPort]` 端点引出/引入段）统一施加 `overlaps * 8` 惩罚（24px 引出段惩罚高达 192），大于切换连接侧的惩罚（32/160），导致同向汇入或同向分叉的第二条边被迫切换到其他方向，造成不对称分叉或无意义绕行/交叉。
   - 节点宽高比悬殊（默认 `180×68`），TB 布局下相邻层跨列时 `|dx| > |dy|`，中心点差值启发式误将正下方节点判定为左/右方向，阻碍同向分叉与同向汇入的聚合。
   - `obstacleRouter` 从 `sourceStub` 出发或到达 `targetStub` 时未禁止沿反法线方向回退，可能缩短甚至通过 `simplify()` 折叠端点合并段。

3. **部分图形端点裁剪缺失导致浮空或错位**
   - `package` 节点顶部标签宽度 `tab` 通常小于 `width / 2`，顶部居中连接点 `(cx, y)` 位于主体上边线 `y + 20` 上方，导致箭头悬空 20px。
   - `clipEndpoint` 缺少 `package`、`queue`、`note`、`server` 的轮廓裁剪。
   - `directEndpoint`（用例图直线模式）缺少 `decision` 菱形及 `start`/`end` 圆形边界求交；且 `renderGraphWithSpacing` 对 `usecase` 类型全量跳过 `clipEndpoint`（含自环与手工途经点正交路由）。

## 2. 优化方案

核心修改集中在 `.agents/skills/uml-studio/src/graph.ts`，并同步重建分发产物（`dist/`、`assets/`、`schemas/`、`demo-dist/`）：

### 2.1 全节点居中连接
- 将 `routeEdges` 中的 `sourceFraction` 与 `targetFraction` 统一固定为 `0.5`，所有正交连线默认从元素（或 `symbol` 区域）各边居中位置接入/引出：
  - `decision` 菱形固定连接四个顶点（上/下/左/右居中尖端）。
  - `start`/`end`/`usecase` 连接圆/椭圆四向正中点。
  - 矩形及复合图形连接四边正中点。
- 自环连线保持 `side !== targetSide` 约束，确保起止点互异且各自居中。

### 2.2 同向汇入聚合（入口前合并一段距离后分叉）与同向出发聚合（出发处合并一段距离后分叉）
1. **基于边间距的流向优先侧选择**
   - 计算 `source` 与 `target` 外接框的净间距 `gapX`、`gapY`（有投影重叠时为 0）。
   - 仅单轴分离时取对应轴向；双轴同时分离且处于主流程正向（TB 下 `gapY > 0`，LR 下 `gapX > 0`）时，优先沿主流程方向选择 `bottom -> top`（TB）或 `right -> left`（LR），确保同层多分支汇入/分叉自然归集到同一侧；逆向回环按 `|gapX|` 与 `|gapY|` 比较。
2. **保证合并主干长度与稳定分叉点**
   - 同一 `(node, side)` 的所有同向连线复用相同的居中 `port` 与外推 `stub`（外推距离 `distance = Math.max(clearance + 1, Math.min(28, theme.gap / 2))`）。
   - 在 `obstacleRouter` 中增加可选端点方向约束 `startSide` / `endSide`：禁止从 `sourceStub` 沿 `-outward(startSide)` 直接回退向 `sourcePort`，禁止从 `+outward(endSide)` 方向进入 `targetStub`（若受手工途经点等极端约束无解，则自动回退无约束路由保证不失败）。
   - 由此保证出发合并段 `[sourcePort, sourceStub]` 与入口合并段 `[targetStub, targetPort]` 维持完整长度并在 `stub` 处清晰分叉，且 `crossings.ts` 与 `placeLabels` 原生兼容 T 型分叉与共享主干（不产生误桥接，标签避开共享段）。
3. **同向共享免惩罚与反向碰撞保护**
   - 记录已路由边的 `exitKey = source:${id}:${side}`、`entryKey = target:${id}:${targetSide}` 及对应的 `sourceStem`、`targetStem`。
   - 候选路径计算 `overlaps` 时，若与已有边拥有相同的 `exitKey`，扣除落在 `sourceStem` 内的同轴重叠长度；若拥有相同的 `entryKey`，扣除落在 `targetStem` 内的同轴重叠长度。
   - 当候选边的出发侧已被已有边用作入口侧（或入口侧已被用作出发侧）时，施加反向端口冲突惩罚（`+220`），避免双向边或回环边与正向出线重叠。
   - 平衡侧切换惩罚（同向汇入/分叉切侧 `+240`，正向主轴目标切侧 `+96`，其余 `+32`），使对称分支稳定聚合到主干。

### 2.3 其他图形与连接问题排查修复
- `clipEndpoint` 补全：
  - `package`：顶部连线 `point.x > box.x + tab` 时裁剪到 `box.y + 20`；右侧连线 `point.y < box.y + 20` 时裁剪到 `box.x + tab`。
  - `queue`：补全左右半椭圆封口（`rx = 10, ry = h / 2`）裁剪。
  - `note`：补全右上角 18×18 折角裁剪。
  - `server`：补全 3D 盒子 14×12 斜角裁剪。
- `directEndpoint` 补全：
  - 增加 `decision` 菱形射线求交 `scale = 1 / (|dx|/rx + |dy|/ry)`。
  - 椭圆求交扩展支持 `start`、`end`。
- `renderGraphWithSpacing` 中对实际走正交路由的边（包括 `usecase` 自环或带手工途经点的边）均执行 `clipEndpoint`。

## 3. 任务拆解与验证计划

1. **实施子代理**：修改 `.agents/skills/uml-studio/src/graph.ts`，执行 `npm run build` 更新构建产物。
2. **验证子代理**：执行 `npm run typecheck`、`npm test`、`npm run demo:verify`，并对典型场景（同向双线/三线汇入、同向双线/三线分叉、菱形多入多出、package 顶部连接、双向回环、泳道/活动/状态/流程图示例）做几何坐标核验。
3. **收尾**：同步更新本实施文档记录实际变更与验证结果，自动提交代码。

## 4. 完成记录（2026-11-21）

状态：实现、回归测试、分发重建和 Demo 检查均已完成。

### 4.1 实际变更

- `src/graph.ts`：正交端口统一居中，取消按入边数量分散目标端点；依据节点外框净间距与 TB/LR 正向流选择默认连接侧。菱形连接顶点，自环使用不同侧。
- 同向分叉和汇入复用端口与外推主干；端点方向约束阻止路由立即折返，允许共享主干免除重叠惩罚，并对反向使用同一端口增加冲突代价。普通绕障仍可选择其它侧，指定途经点导致方向约束无解时保留无约束回退。
- 增加轻量转弯偏好：分叉优先在源端主干后转弯，汇入优先靠近目标主干转弯；仅用于候选路线代价相近时稳定分支位置。
- 同一入口端口、同样式且带箭头的连线会合流：后到分支并入最短的主干，分支不画箭头，汇合点远离主干拐角与源端口（后续修正与规则见 [uml-studio-汇入合流修正.md](uml-studio-汇入合流修正.md)）。
- 补全 `package`、`queue`、`note`、`server` 的正交端点裁剪；用例直线补全菱形与起止圆形边界求交，用例自环和途经点路线执行正交裁剪。
- 标签排布增加 5px 的紧凑候选间距并保留较低优先级，为共享主干后的短分支留出标注位置；现有分支归属、避让及引导线测试继续通过。
- 新增 `tests/edge-routing.test.mjs`，并更新 `references/demo-coverage.md`。已重建 `dist/`、`assets/`、`schemas/`、`demo-dist/`；Schema 与公开声明内容保持一致，无需产生额外差异。

### 4.2 验证结果

命令在项目根目录执行；日志和图片证据保存在已忽略的 `temp/` 下。

| 检查 | 结果 | 证据 |
|---|---|---|
| `npm run typecheck` | 通过 | `vue-tsc --noEmit` 退出码 0 |
| `npm run build` | 通过 | `temp/uml-edge-build.log` |
| `npm test` | 108 项通过，0 失败、0 跳过 | `temp/uml-edge-tests-final.log` |
| `npm run demo:verify --workspace @office/uml-studio` | 27 张图全部通过，0 几何错误 | `temp/uml-demo-evidence/report.json`、`temp/uml-edge-demo.log` |
| 视觉复核 | 已查看示例拼图及泳道、导入流程原生导出图 | `temp/uml-demo-evidence/index.html`、`contact-*.png` |

新增 7 项回归测试包括以下几何断言：

1. **32 组汇入/分叉组合**：TB/LR × 双线/三线 × 汇入/分叉 × 矩形/菱形 × 正序/倒序边。端口一致且居中，至少保留 24px 主干，主干范围内不产生误跳线；主干外的真实交叉允许正常跳线。
2. **64 组图元连接组合**：16 类非角色图元 × TB/LR × 普通/尺寸受限。按实际 SVG 轮廓及缩放变换检查居中端点，覆盖附带文字的起止与 fork/join 符号。
3. **包顶部连接**：普通包图和带途经点的用例图都连接到主体的真实上沿，而非悬在标签外侧。
4. **用例直线**：菱形、开始、结束、椭圆端点满足轮廓方程，并位于两节点中心连线方向。
5. **用例正交路线**：自环端口互异，途经点路线保持正交，两端连接椭圆的居中轮廓。
6. **双向关系**：TB/LR 与两种边顺序下，正向和反向关系不共用相反方向的节点端口。
7. **真实示例**：活动、泳道、状态、流程图中的菱形端点均位于顶点，含尺寸受限的流程图。

原有测试同时覆盖复杂节点图四种布局模式 × TB/LR、标签归属与主干避让、交叉桥接、原生图片箭头和离线 HTML 往返。此次没有改动编辑器交互，未额外运行 `test:editor`。
