# 鱼骨图鱼头样式

## 来源与范围

本次核对 `ucd-studio` 当前文件及全部 Git 历史，未找到鱼骨图或鱼头实现。`diagram-design` 的鱼骨示例使用结果矩形框，也不是所需的鱼头素材。

实际可复用来源为本机 `D:/WorkProject/FishboneStudio`，其 `packages/vue/src/appearance.ts` 提供鱼头比例及文字安全区，`packages/vue/src/paint.ts` 提供九种轮廓。UML Studio 适配其中的鱼头几何，不引入该项目的运行依赖，也不改变原因分类、递归层级或原有布局规则。来源项目采用 MIT 许可证，完整版权与许可已附于技能根目录 `LICENSE`，构建产物和离线 HTML 应携带该许可。

## 数据与交互

默认保留 UML Studio 原来的鱼骨样式。`fishbone.headStyle` 未提供或设置为 `classic` 时，使用本轮改动前（`6d231ea`）的尖嘴鱼头、原有眼睛与鱼鳃、描边、鱼头比例、文字换行宽度与位置、主骨连接位置；默认图的分类、原因分支、尾部和布局也保持原样。

其他九种轮廓只在用户明确选择时使用，未替换默认样式。设置 `fishbone.headStyle` 后保存 HTML / JSON 可保留选择。

| 值 | 名称 | 特征 |
|---|---|---|
| `classic` | 原版鱼头（默认） | UML Studio 原有尖嘴、眼睛、弧形鳃及文字比例 |
| `fish` | 弧面鱼头 | 小圆眼、弧形鳃、浅色填充 |
| `slim` | 细长鱼头 | 细长轮廓、小嘴线 |
| `shark` | 开口鱼头 | 嘴部缺口 |
| `roundfish` | 高身圆角 | 较大结果文字区域 |
| `carp` | 水滴鱼头 | 饱满弧线与小圆眼 |
| `sunfish` | 扇面鱼头 | 高身、开口轮廓 |
| `triangle` | 极简三角 | 无眼睛、鱼鳃的简洁轮廓 |
| `rounded` | 胶囊标签 | 圆角结果框 |
| `label` | 方框标签 | 使用主题圆角的结果框 |

原版鱼头沿用原有文字与尺寸算法。其余轮廓分别定义文字宽度、中心与高度安全比例，长结果文字换行后自动增加鱼头和画布高度；颜色使用当前图主题，不增加全局外观配置。切换造型不改变分析内容。

```json
{
  "version": 1,
  "type": "fishbone",
  "title": "延期原因分析",
  "fishbone": {
    "effect": "交付延期",
    "headStyle": "classic",
    "categories": [
      { "id": "plan", "label": "计划", "causes": [{ "label": "联调时间不足" }] }
    ]
  }
}
```

## 验证要求

修改源码后完整构建，以同步内联运行时、Node 渲染器和 JSON Schema。默认及显式 `classic` 的 SVG 应与改动前的同一输入、同一主题输出一致；检查短中文、长中文、中英文混排结果，避免只恢复轮廓却改变原来比例。可选的九种新造型保留独立验证，相关 `data-part="head"`、`data-style` 和 `data-feature` 标记可定位其轮廓；保存 HTML/JSON 和再次导出应保留 `headStyle`。

使用既有验证命令，不新增测试代码：`npm run build`、`npm run typecheck`、`npm test`。实际执行结果由本次整体验证记录说明。
