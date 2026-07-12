# D2 Themes Reference

D2 内置了多种专业主题，让图表开箱即用即可用于文档、博客和 Wiki。

## 主题列表

### Light 主题（亮色）

| ID | 名称 | 风格说明 |
| --- | --- | --- |
| 0 | **Neutral Default** | 默认主题，中性灰蓝色调，适合大多数场景 |
| 1 | **Neutral Grey** | 纯灰色系，最小化色彩干扰，适合正式文档 |
| 3 | **Flagship Terrastruct** | Terrastruct 品牌色，蓝绿主调，视觉丰富 |
| 4 | **Cool Classics** | 经典冷色调，蓝紫配色 |
| 5 | **Mixed Berry Blue** | 浆果蓝色调，适合技术博客 |
| 6 | **Grape Soda** | 紫色调，活泼现代 |
| 7 | **Aubergine** | 茄紫色调，优雅沉稳 |
| 8 | **Colorblind Clear** | 无障碍配色，色盲友好 |
| 100 | **Vanilla Nitro Cola** | 暖棕色调，复古风格 |
| 101 | **Orange Creamsicle** | 橙色调，明亮活力 |
| 102 | **Shirley Temple** | 粉红色调，轻快柔和 |
| 103 | **Earth Tones** | 大地色系，自然沉稳 |
| 104 | **Everglade Green** | 绿色调，清新自然 |
| 105 | **Buttered Toast** | 黄棕暖色调，温馨 |
| 300 | **Terminal** | 特殊主题：终端风格，全大写、无圆角、等宽字体、dots 填充 |
| 301 | **Terminal Grayscale** | 终端灰度版本 |
| 302 | **Origami** | 特殊主题：折纸风格 |
| 303 | **C4** | 特殊主题：C4 架构模型风格 |

### Dark 主题（暗色）

| ID | 名称 | 风格说明 |
| --- | --- | --- |
| 200 | **Dark Mauve** | 暗紫红色调，柔和暗色 |
| 201 | **Dark Flagship Terrastruct** | Terrastruct 品牌暗色版 |

## 使用方式

### CLI 参数

```bash
# 指定亮色主题
d2 --theme 101 input.d2 output.svg

# 指定暗色主题（响应系统暗色模式自动切换）
d2 --dark-theme 200 input.d2 output.svg

# 同时指定亮色和暗色（SVG 自适应系统偏好）
d2 --theme 0 --dark-theme 200 input.d2 output.svg
```

### 环境变量

```bash
D2_THEME=101 d2 input.d2
D2_DARK_THEME=200 d2 input.d2
```

### D2 文件内配置（vars）

```d2
vars: {
  d2-config: {
    theme-id: 101
    dark-theme-id: 200
    layout-engine: elk
  }
}
```

## 推荐主题搭配

| 用途 | Light 主题 | Dark 主题 | 说明 |
| --- | --- | --- | --- |
| **通用/默认** | 0 (Neutral Default) | 200 (Dark Mauve) | 中性配色，适合所有文档 |
| **技术文档** | 1 (Neutral Grey) | 200 (Dark Mauve) | 最小干扰，聚焦内容 |
| **产品展示** | 3 (Flagship Terrastruct) | 201 (Dark Flagship) | 品牌感强 |
| **无障碍** | 8 (Colorblind Clear) | 200 (Dark Mauve) | 色盲友好 |
| **终端/Hacker** | 300 (Terminal) | 300 (Terminal) | 极客风，适合 CLI 工具文档 |
| **C4 架构** | 303 (C4) | 200 (Dark Mauve) | 适合 C4 模型图 |
| **清新自然** | 104 (Everglade Green) | 200 (Dark Mauve) | 适合环保/自然产品 |
| **暖色温馨** | 105 (Buttered Toast) | 200 (Dark Mauve) | 适合内部文档 |

## 特殊主题

特殊主题不仅改变颜色，还修改默认样式行为：

### Terminal (300)

- 所有标签强制大写（`text-transform: uppercase`）
- 无圆角（`border-radius: 0`）
- 等宽字体（`font: mono`）
- 容器使用点状填充（`fill-pattern: dots`）
- 最外层容器自动 `double-border: true`

### C4 (303)

- 适配 C4 架构模型的配色和形状
- 配合 `c4-person` shape 使用

## 自定义主题

可以通过 `theme-overrides` 和 `dark-theme-overrides` 覆盖主题配色：

```d2
vars: {
  d2-config: {
    theme-id: 0
    theme-overrides: {
      B1: "#2E7D32"
      B2: "#66BB6A"
      B3: "#A5D6A7"
      B4: "#C5E1A5"
      B5: "#E6EE9C"
      B6: "#FFF59D"
      AA2: "#0D47A1"
      AA4: "#42A5F5"
      AA5: "#90CAF9"
      AB4: "#F44336"
      AB5: "#FFCDD2"
    }
    dark-theme-overrides: {
      B1: "#1B5E20"
      B2: "#388E3C"
      B3: "#4CAF50"
      B4: "#66BB6A"
      B5: "#81C784"
      B6: "#A5D6A7"
    }
  }
}
```

### 颜色代码说明

| 代码 | 用途 |
| --- | --- |
| `B1`–`B6` | 主要背景/填充色梯度（B1 最深，B6 最浅） |
| `AA2`, `AA4`, `AA5` | 强调色 A 系列 |
| `AB4`, `AB5` | 强调色 B 系列 |

## 与 Skill 渲染脚本配合

本 skill 的 `render_d2.py` 脚本默认使用：
- Light: `--theme 0`
- Dark: `--theme 200`

如需修改默认主题，可在 `./diagrams/rules.md` 中指定：

```markdown
## Theme
- light-theme: 104
- dark-theme: 200
```
