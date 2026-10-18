# Demo 场景与验证

离线入口是 `demo-dist/index.html`，开发入口是 `npm run dev`。两者都载入 `examples/documents/gallery.json` 的完整 26 图集合。

`examples/<type>.json` 保留简明入门模板。复杂场景的源数据在 `examples/scenarios/`；`scripts/gallery.mjs` 按固定顺序组合 20 个场景、3 个布局对照与 `examples/documents/quickstart.json` 的原有 3 张图。修改源文件后运行 `npm run demo:refresh`，不要手改生成的 `gallery.json`。`npm run build` 也会先刷新设计册，再打包运行资源和离线 HTML。

## 场景索引

| 源文件 | 场景 | 主要观察点 |
|---|---|---|
| `activity.json` | 登录认证 | 4 个判断、重复是/否、共用干线、回退与失败汇入 |
| `activity-parallel.json` | 发布流水线 | 三路并行、fork/join、灰度失败回滚 |
| `sequence.json` | 订单支付 | 6 个参与者、2 个数据库、19 条消息、4 类片段、嵌套激活、自调用、创建与销毁 |
| `swimlane.json` | 费用报销 | 4 个泳道、反复交接、退回补件、支付重试 |
| `flowchart.json` | 数据导入 | LR、多次返工、长文本、XML 特殊字符、显式折列 |
| `usecase.json` | 交易平台 | 4 个角色、系统边界、直线关系、include/extend、角色泛化 |
| `class.json` | 订单领域 | 属性/方法分区、长签名、两端基数、继承/实现/聚合/组合 |
| `state.json` | 支付单 | 内部动作、自转换、超时、失败重试、多个终态 |
| `component.json` | 结算服务 | 嵌套同级区域、跨边界依赖、接口及适配器 |
| `component-folding.json` | 文档处理 | 12 步主流程与短旁路、自动折列、无连线提示节点 |
| `package.json` | Monorepo | 嵌套包、共享核心、多入口依赖 |
| `architecture.json` | 系统架构 | 网关扇出、独立存储、事件汇入与订阅、深色主题 |
| `module.json` | 功能分解 | 多层分解、三个分支、共享能力的交叉依赖 |
| `deployment.json` | 生产部署 | 双实例、主备复制、缓存/队列、协议端口标注 |
| `logical.json` | 4+1 逻辑 | 聚合所有权、领域端口、业务约束注释 |
| `development.json` | 4+1 开发 | 代码所有权、契约包、适配器与契约测试依赖 |
| `process.json` | 4+1 进程 | Outbox、并发消费者、幂等自环、死信与重放 |
| `physical.json` | 4+1 物理 | 两个可用区、三层包含、制品、跨区复制 |
| `scenario.json` | 4+1 场景 | 业务成功路径、支付失败释放库存、重新下单 |
| `fishbone.json` | 支付延迟根因 | 6 个分类、数量不均、三层原因、长文字 |

另外 3 张对照图分别验证：登录图 `compact + LR`；嵌套组件 `grid + maxPerColumn:2`；数据导入 `spacious + 20px + transparent + showTitle + 尺寸上限`。它们与原图独立保存，适合比较模式和验证保存后重新打开。

## 自动验证

在本 SKILL 目录运行：

```bash
npm run build
npm test
npm run demo:verify
```

- `tests/gallery.test.mjs` 校验场景与生成设计册一致，18 类覆盖完整；逐图检查节点、关系、标注及容器数量，普通关系连续正交、用例直线、SVG 引用有效、可识别图元不重叠、标注互不覆盖且不裁切。
- 20 个复杂场景中的节点图都在 4 种模式 × TB/LR 下重复检查；已有 `edge-labels.test.mjs` 进一步验证登录分支归属、共用干线避让和端点基数位置。
- `tests/usecase-layout.test.mjs` 验证书店、登录认证和多角色交易平台的直线无交叉、无无关用例穿越；同时检查同行 / 同列、角色共用端口、边界外角色、TB/LR、四种模式，以及循环依赖、断开节点、嵌套与空边界。
- 时序验证消息箭头、4 种片段、两个数据库圆柱及任务生命周期；鱼骨在全部 10 个主题下验证递归原因无遗漏。
- HTML 往返验证完整集合、重复图类型和独立设置；4 类复杂图实际导出 SVG/PNG/JPEG/WebP，检查编码、尺寸限制、透明通道与 JPEG 白底。
- `tests/raster-markers.test.mjs` 实际栅格化 7 类箭头 / 菱形，在 8 个方向检查符号位于关系的正确一侧；原生尺寸测试验证 SVG 原始视口与位图向上取整规则，防止浏览器和原生导出产生尺寸偏差。
- `demo:verify` 使用 CLI 的原生导出入口生成图形 PNG，统一字体配置与缩放规则；把每张图的 SVG、PNG、拼图、`report.json` 与可浏览的 `index.html` 输出到工作区 `temp/uml-demo-evidence/`。可用 `--out-dir` 指定证据目录；发现几何错误时仍保留预览，并以非零状态退出。

自动检查覆盖明确的结构和几何约束，不证明布局达到最佳视觉效果。发布前查看拼图，并打开复杂时序、跨泳道、用例、嵌套区域和标注密集图的完整 SVG，检查文字可读性、关系归属、交叉与留白。
