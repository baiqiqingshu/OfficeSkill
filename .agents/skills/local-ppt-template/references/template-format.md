# 从参考 PPTX 创建模板

## 先检查参考文件

使用本地 PowerPoint/LibreOffice 查看参考页（可用本地导出图片）。确认画布、标题/正文、图片框、表格、品牌标记和背景。先挑选代表不同布局类型的页面。参考 PPT 只是内容来源时，不应擅自把其风格当作用户要求。

```text
python SKILL_DIR/scripts/pptx_tool.py inspect reference.pptx --output spec.json
```

`inspect` 为每页生成布局候选，为顶层文本框、图片、原生表格生成输入候选。`source_slide` 是从 1 开始的页码，`shape_id` 是原生形状 ID，不是序号或名称。候选输入说明会显示形状名称。

逐页整理候选 spec：

1. 只保留需要的布局，把 ID 改成易懂的 `cover`、`title_body`、`image_text` 等。
2. 填写每种布局的用途、输入用途。输入命名可用 `title`、`subtitle`、`body`、`image`、`data`。
3. 从 inputs 删除应保持静态的页脚、Logo、装饰文字/图片映射；其他形状保持不变。
4. 按参考字号和框大小校准约束。自动字数/行数是估算，不能代替视觉判断。最多 20 字的首页标题，应明确设置 `max_chars: 20`。
5. 输入框必须是顶层形状；组合内输入先在本地取消组合。输入表格不能含合并单元格。图表可静态保留，但不提供图表数据填充。

## spec JSON

```json
{
  "schema_version": 1,
  "name": "项目汇报模板",
  "layouts": [
    {
      "id": "cover",
      "name": "首页",
      "source_slide": 1,
      "description": "演示开场，展示主题标题",
      "inputs": [
        {
          "id": "title",
          "shape_id": 2,
          "type": "text",
          "description": "演示主题，最多 20 字符",
          "required": true,
          "limits": {
            "max_chars": 20,
            "max_lines": 1,
            "max_font_pt": 44,
            "max_width_cm": 29,
            "max_height_cm": 2.7
          }
        }
      ]
    }
  ]
}
```

输入类型对应的必需 limits：

| 类型 | 必需约束 |
| --- | --- |
| text | max_chars、max_lines、max_font_pt、max_width_cm、max_height_cm |
| image | max_pixels、max_width_cm、max_height_cm |
| table | max_rows、max_cols、max_cell_chars、max_cell_lines、max_font_pt、max_width_cm、max_height_cm |
| array | max_items；可选 min_items；条目为文本/组合时另需 max_item_chars、max_item_lines、max_item_font_pt；条目为图片时需 max_item_pixels |

所有约束为正数；字数、行数、列数、像素数必须是整数。尺寸不得大于实际输入框；表格容量不得大于参考表格网格。形状类型必须与输入类型匹配。同一布局的输入 ID 和 shape_id 不能重复。`required` 表示建议填写，不是生成时的硬性要求；填充 Markdown 未提供该输入时按空内容处理。可有零输入的纯静态布局。

## 数组输入（array）

数组输入用 `shape_ids`（两个形状 ID）替代 `shape_id`，对应参考页中的两个样例形状：

```json
{
  "id": "items",
  "shape_ids": [9, 13],
  "type": "array",
  "description": "特性卡片：- 图标 || 标题 || 说明",
  "required": true,
  "limits": {
    "min_items": 2,
    "max_items": 4,
    "max_item_chars": 40,
    "max_item_lines": 2,
    "max_item_font_pt": 15
  }
}
```

- 两个样例必须是同一类型的顶层形状（文本形状、图片或组合），且大小一致、位置不同。它们的位置差定义条目的排列方向和间距；填充时第 N 个条目按该向量复制排列。按最大个数外推的条目必须全部落在页面内，创建时会校验。
- 组合样例的条目文本位 = 组合内所有带样例文字的形状（按文档顺序）；不含文字的装饰形状（如卡片底色）会随条目一起复制并保持原样。填充内容用 ` || ` 分隔各文本位。
- 文本形状条目只有 1 个文本位；图片条目每个 `- ` 行是一张本地图片。
- `inspect` 会把参考页中的组合形状列为 `type: "group"` 候选；要组成数组时把两个候选合并为一个 array 输入并改用 `shape_ids`。

## 创建与产物

```text
python SKILL_DIR/scripts/pptx_tool.py create reference.pptx --spec spec.json --output template-package
```

输出目录必须不存在。模板创建以整目录暂存并原子改名，避免出现缺少说明的半成品。

| 文件 | 用途 |
| --- | --- |
| template.pptx | 每页是一种布局的示例；映射输入已清空，母版/主题/背景/静态对象保留 |
| manifest.json | 输入 ID → shape_id 映射、布局说明、位置尺寸、容量限制、PPTX SHA-256 |
| template-guide.md | 自动生成的人可读说明；agent 必须在写填充 MD 前读取 |

模型不必手写 manifest，也不必手写模板说明。模板 PPTX 有 SHA-256 绑定，手动修改后不能继续使用旧 manifest。需要改变版式时修改参考文件和 spec，再创建新模板包。只修改 manifest 的容量约束后执行 `describe --template template-package` 更新说明。

## 保真与本地边界

按参考幻灯片复制 OOXML 部件，不以模型重建参考页。保留主题、母版、布局、静态表格/图表、静态图片和背景。清空输入样例并移除旧备注、批注和缩略图关系。原稿中未映射的静态内容会留在模板中，应在本地检查。

外部关系（含网页超链接和外链媒体）、宏/ActiveX、跨页导航拒绝处理；请先用本地 Office 清理。脚本不会打开或请求这些链接。复杂 SmartArt、动画、嵌入对象等虽可能作为静态部件保留，但必须用本地 Office 验证，不承诺全部 Office 扩展特性保真。
