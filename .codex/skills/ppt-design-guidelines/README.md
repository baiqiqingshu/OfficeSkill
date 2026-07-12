# ppt-design-guidelines

增强 `officecli` 的 PPTX 生成能力的设计规范 skill。

## 用途

当 agent 通过 `officecli` 生成 PPT 时，本 skill 提供一套**强制性设计约束**，避免以下常见问题：

- 文字超出幻灯片边界不可见
- 元素重叠导致内容无法阅读
- 字体大小不一致，视觉层次混乱
- 内容过度密集，缺乏呼吸空间
- 颜色使用混乱，缺乏专业感

## 核心规范

| 规范类别 | 关键约束 |
|:---|:---|
| 安全区域 | 所有内容距边缘 ≥ 0.5 英寸 |
| 正文字号 | ≥ 18pt，标题 ≥ 28pt |
| 内容密度 | 每页 ≤ 50 词，≤ 5 条要点 |
| 间距 | 元素间 ≥ 0.3 英寸 |
| 留白 | 每页 ≥ 15% 空白区域 |
| 配色 | 3–5 色 + 中性色，对比度 ≥ 4.5:1 |
| 字体 | 全 deck ≤ 2 种字体族 |

## 触发条件

本 skill 在以下场景自动激活：

- 通过 `officecli` 生成 PPTX
- 审查或优化已有 PPT 内容
- 构建 `office.render` 的 JSON payload
- 为 `officecli` 编写生成提示词

## 与 officecli skill 的关系

本 skill 是 `officecli` skill 的**增强补充**，不替代 officecli skill 的环境检查、能力检测和执行流程。工作流程：

1. `officecli` skill 负责环境准备和生成执行
2. 本 skill 负责内容组织和视觉设计约束
3. agent 在构建 prompt / payload 前应用本 skill 的规则
4. 生成完成后可参照本 skill 的检查清单进行质量验证
