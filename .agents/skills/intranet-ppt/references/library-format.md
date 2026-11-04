# 元素库格式

元素库使用 HTML 保存组件结构和样式，PPTX 保存公司固定母版。它们各自保留擅长表达的内容；HTML 不承担公司母版转换。

`library.json` 示例：

```json
{
  "schemaVersion": 1,
  "id": "company",
  "name": "公司评审元素",
  "components": [{
    "id": "conclusion",
    "name": "评审结论",
    "description": "一段结论文字",
    "size": {"width": 1100, "height": 120},
    "inputs": {"text": {"type": "richtext", "required": true}},
    "htmlFile": "components/conclusion.html"
  }]
}
```

`components/conclusion.html`：

```html
<div data-slot="text" style="position:absolute;left:0;top:0;width:100%;height:100%;font-family:Microsoft YaHei;font-size:28px;font-weight:bold;color:#17324D"></div>
```

组件可用 `html` 字符串代替 `htmlFile`，两者只选一个。模型通过 `company/conclusion` 引用。库清单 ID 和组件 ID 必须唯一，不能覆盖内置组件。

输入类型：

| type | JSON 输入 | HTML 绑定 |
| --- | --- | --- |
| text | 字符串 | `div/p/span/h1` 等的 `data-slot` |
| richtext | 字符串或 runs 数组 | `div/p/span/h1` 等的 `data-slot` |
| image | `"images/local.png"` 或 `{"src":"images/local.png","alt":"示意图"}` | `img data-slot="src"` |
| table | 二维数组或 `{"rows":[["列A","列B"],["值A","值B"]]}` | `table data-slot="rows"` |
| list | 字符串或 runs 构成的数组 | `ul/ol/div data-slot="items"` |

表格单元格和列表条目可使用 runs。单段 run 为 `{"text":"内容","bold":true,"italic":false,"fontFamily":"宋体","fontSize":24,"color":"#17324D","underline":false}`。遗漏样式时继承组件样式；字号单位是像素。

## 支持的 HTML/CSS 子集

这是声明式组件格式，不是浏览器网页导出器。框架把该子集转为同一份场景，再输出 HTML 和原生可编辑 PPTX。

- 标签：`div section article p h1 h2 h3 h4 h5 h6 span strong b em i u br img table thead tbody tr th td ul ol li`。
- 布局：内联样式，`position:absolute/relative`、`left/top/width/height`，尺寸使用 `px`、`%` 或零。建议所有可见叶子明确给出位置和高度；不使用 flex、grid、自动流式网页布局。
- 文字：`font-family/font-size/font-weight/font-style/text-decoration/text-align/vertical-align`、`color`。
- 形状：`background-color`、`border:1px solid #RRGGBB`、`padding`。
- 根组件按 `size` 设计，通过配置 `box` 缩放；字号按两个缩放方向的较小比例缩放。避免过度缩放，优先选择适合内容的元素尺寸。
- 图片使用本地文件，维持宽高比。JSON 的图片相对于配置目录；HTML 中静态 `img src` 相对于库目录。

禁止 `script/style/link/iframe/object` 等可执行或外链元素、`on*` 事件、CSS `url()`、`@import`、表达式、远程字体及远程资源。任意 HTML/CSS、SVG 动画、图表脚本不在原型范围。未知字段或不支持样式应修正为目录支持的契约，不通过内联脚本绕过限制。

## 内置组件

`builtin/title`、`text`、`bullets`、`card`、`table`、`image`、`metric`、`steps`。准确输入和尺寸以 `catalog` 输出为准。第三方组件只需增加本地清单及 HTML，无需修改框架或安装代码插件。
