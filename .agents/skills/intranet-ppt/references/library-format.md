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
- 文字：`font-family/font-size/font-weight/font-style/text-decoration/text-align/vertical-align`、`color`、`line-height`（无单位倍数 0.8–3.0）、`letter-spacing`（px，-5–20）。
- 形状：`background-color`、`border:1px solid #RRGGBB`、`padding`、`border-radius`（`Npx` 或 `50%`，用于圆角卡片与圆形徽标）。
- 列表：`ul/ol` 的 `class` 决定前缀，`check` → `✓`、`dash` → `—`、`num` → 数字；前缀加粗并沿用列表文字颜色，随主题换色。
- 表格：组件 HTML 中用 `<thead><tr><th style="...">` 声明表头样式（填充、文字颜色、加粗、内边距、边框）；`data-slot="rows"` 只提供正文行，表头行数和样式来自 HTML。`th` 的表头样式会同时用于 HTML 预览和 PPTX。
- 根组件按 `size` 设计，通过配置 `box` 缩放；字号按两个缩放方向的较小比例缩放。避免过度缩放，优先选择适合内容的元素尺寸。
- 图片使用本地文件，维持宽高比。JSON 的图片相对于配置目录；HTML 中静态 `img src` 相对于库目录。

禁止 `script/style/link/iframe/object` 等可执行或外链元素、`on*` 事件、CSS `url()`、`@import`、表达式、远程字体及远程资源。任意 HTML/CSS、SVG 动画、图表脚本不在原型范围。未知字段或不支持样式应修正为目录支持的契约，不通过内联脚本绕过限制。

## 规范色板与主题换色

组件 HTML 只应使用下表中的 hex 色值。配置 JSON 顶层可选 `"theme"` 字段（`blue` 默认、`emerald`、`crimson`、`mono`、`graphite`）会把这些色值整体映射到目标主题；色板之外的 hex 一律原样保留，不参与换色。第三方库同样遵守本约定即可自动支持主题。

| 语义 | hex |
| --- | --- |
| INK 主标题 | #17324D |
| BODY 正文 | #263C50 |
| MUTED 次要 | #52687A |
| FAINT 弱文字 | #8496A8 |
| ACCENT_D 深主色（文字/描边） | #145D92 |
| ACCENT_FILL_D 深主色填充（白字） | #145D93 |
| ACCENT 主色（文字/描边） | #1476B8 |
| ACCENT_FILL 主色填充（白字） | #1476B9 |
| ACCENT_L 浅主色 | #3F92CC |
| SOFT_A 主色浅底 | #E4EFF8 |
| BG_SOFT 卡片底 | #F0F5FA |
| BG_SOFT2 表格底 | #F5F8FB |
| BORDER 边框 | #C5D3DF |
| BORDER_L 浅边框 | #D8E4EF |
| WHITE 反白文字（白字） | #FFFFFF |
| SURFACE 白色卡片/表格底 | #FDFDFD |
| OK / OK_BG | #1E7A46 / #E5F3EA |
| WARN / WARN_BG | #A86A00 / #FBF0DC |
| DANGER / DANGER_BG | #B3372F / #F9E9E7 |

例外（不属于色板、不参与换色）：代码块深底 `#212B36`、代码文字 `#D9E4EF`、代码边框 `#3A4A5C`。

换色发生在库加载阶段：组件 HTML 字符串进入解析器前，对 `#RRGGBB`/`#RGB` 做大小写不敏感的全词替换。`graphite` 为暗底主题，文字系 token 换浅色、底色系 token 换深色；各主题的状态色（OK/WARN/DANGER）可保持恒定或微调。

`SURFACE` 与 `WHITE` 必须分开：`SURFACE` 用于白色卡片、表格正文和图片框背景，暗色主题会换成深色面；`WHITE` 只用于主色填充上的反白文字，暗色主题仍保持白色。同理，主色填充块（表头、结论条、徽标、方法标签）使用 `ACCENT_FILL` / `ACCENT_FILL_D`，避免暗色主题把填充换成浅色后白字不可读。

## 示例输入 samples.json

库清单同目录可放置 `samples.json`，为可视化预览提供每个组件的示例 inputs：

```json
{
  "company/conclusion": {"inputs": {"text": "评审通过，进入实施阶段"}},
  "conclusion": {"inputs": {"text": "同上，组件 ID 不带库前缀也可识别"}}
}
```

key 推荐 `库ID/组件ID`（不带前缀的组件 ID 亦可）；value 直接是 inputs 对象或 `{"inputs": {...}}`。未覆盖的输入槽会按类型自动补全示例值（text/richtext 示例文本、list 三条、table 表头加两行、image 用生成的占位图）。image 输入可写库内相对路径图片，demo 生成时会复制进输出目录。

## 可视化预览

```text
python scripts/ppt_tool.py demo --out output/library-demo [--library 本地/library.json] [--overwrite]
```

生成 `output/library-demo/library-demo.html`：单文件离线页面。顶部「整页示例」按 deck 分页签，把组件放进 1280×720 完整页面展示，可点击放大与左右翻页；下方「组件库」按库分组，展示中文名、`库ID/组件ID`、size、inputs 签名（`*` 必填）、缩放预览、可折叠示例 JSON 和复制元素 JSON 按钮。左侧支持搜索过滤，5 套主题可即时给预览换色。

## 内置组件

`builtin/`：`title`、`eyebrow`、`lead`、`section-title`、`text`、`bullets`、`checklist`、`steps`、`caption`、`footnote`、`divider`、`cover`、`section-break`、`agenda-item`、`thanks`、`card`、`feature-card`、`panel`、`metric`、`stat-card`、`person-card`、`icon-badge`、`table`、`compare`、`matrix2x2`、`field`、`api-item`、`tag`、`status`、`quote`、`callout`、`callout-warn`、`callout-danger`、`conclusion`、`flow-step`、`flow-arrow`、`layer`、`arch-node`、`arch-zone`、`timeline-item`、`timeline-h-item`、`phase`、`image`、`image-frame`、`code`。准确输入和尺寸以 `catalog` 输出为准。第三方组件只需增加本地清单及 HTML，无需修改框架或安装代码插件。
