# 内网 PPT Skill 实施方案

## 目标与范围

新增独立的 `.agents/skills/intranet-ppt`，面向技术汇报、技术方案评审、需求评审。保留现有 dashi-ppt，提供更短的模型操作路径：选择组件、填写一份 JSON、运行本地命令，生成可编辑 PPTX 与离线 HTML 内容预览。实施依据为现有代码，不读取其他 docs 文档。

## 架构决定

- 使用本地 Python、python-pptx、lxml、Pillow；不依赖云服务、浏览器、Node、遥测或自动安装。Dashi 导出引擎有专有许可，不复制其实现。
- PPTX 母版/示例页面原生保留，不经过 HTML 重建。每页通过 `masterSlide` 选择源 PPTX 页面，允许重复和重排，追加组件生成的原生文字、形状、图片和表格。
- 元素库存储 JSON 清单及受限 HTML/CSS 组件，内容通过 `data-slot` 绑定。框架将 HTML 解析成统一场景，分别输出 HTML 和 PPTX。支持的 HTML/CSS 是明确子集，第三方库不执行代码；任意网页不在原型范围。
- HTML 比 PPT 适合模型填写和组件维护；PPTX 适合无损保留公司固定视觉。采用混合方案，不宣称任意 HTML 与 PowerPoint 像素一致。
- 模板正文由组件控制；母版只建议保留固定背景、徽标、页脚。提取现有 PPTX 时输出组件库、清空内容的母版和可直接生成的示例配置；不可表达的对象明确报告。

## 固定输入契约

```json
{
  "schemaVersion": 1,
  "title": "技术方案评审",
  "master": "./master.pptx",
  "libraries": ["./library/library.json"],
  "pageSize": {"width": 1280, "height": 720},
  "pageCount": 1,
  "pages": [{
    "id": "overview", "masterSlide": 1,
    "elements": [{
      "id": "heading", "component": "builtin/title",
      "box": {"x": 64, "y": 40, "w": 1152, "h": 72},
      "inputs": {"text": [{"text": "方案", "bold": true}, {"text": "概述"}]}
    }]
  }]
}
```

`master`、`libraries`、`pageSize`、`pageCount` 可省略；省略使用内置空白母版、内置组件、1280×720，页数由 pages 决定。路径相对于配置或库清单，不依赖当前工作目录。组件命名为 `库ID/组件ID`。

库清单：`schemaVersion:1, id, name, components:[{id,name,description,size:{width,height},inputs:{输入ID:{type,required}},html}]`。`html` 为内联字符串；另支持 `htmlFile` 本地相对文件。输入类型 `richtext/text/image/table/list`；富文本为字符串或 runs 数组，run 支持 `text,bold,italic,fontFamily,fontSize,color,underline`。组件 HTML 的 CSS 为内联、绝对定位，尺寸使用 px/%；使用 `data-slot` 绑定输入。

## 命令与模块边界

入口：`python scripts/ppt_tool.py <command>`。

- `catalog [--library PATH]`：输出组件输入和尺寸，不要求模型阅读实现。
- `validate CONFIG`：检查 JSON、组件输入、资源与包安全。
- `render CONFIG --out DIR [--overwrite]`：生成 `presentation.pptx`、`preview.html`、`report.json`。
- `extract SOURCE.pptx --out DIR [--overwrite]`：输出 `master.pptx`、`library/library.json`、`deck.json`、`extraction-report.json`。
- `starter --out DIR [--overwrite]`：输出内置母版和三类场景 JSON 示例。

模块职责：

1. `components.py`：库读取、受限 HTML/CSS 解析、输入绑定、统一场景、离线 HTML 预览。
2. `pptx_backend.py`：PPTX 包安全、母版页克隆、场景导出、默认母版、现有 PPTX 提取。
3. `cli.py` / `ppt_tool.py`：参数、配置校验、路径解析、原子输出、命令整合。
4. `assets/libraries/builtin/library.json`、`examples/`、`references/`、`SKILL.md`：组件、场景、模型使用说明。

统一场景节点约定：`type` 为 `text/rect/line/image/table`，`x,y,w,h` 为页面像素，`style` 使用 `fontFamily,fontSize,color,bold,italic,underline,fill,borderColor,borderWidth,align,verticalAlign,padding`，文字节点 `runs`，图片节点 `src`（已验证本地绝对路径），表格节点 `rows`（单元格为字符串或 runs）。由组件模块输出，后端不重新解释 HTML。

## 安全约束

拒绝网络/UNC 路径、脚本、外部资源、事件属性、非白名单 HTML/CSS、PPTX 外链、宏、ActiveX、DTD/实体。库内资源限制在库目录；配置资源限制在配置目录，拒绝路径穿越与符号链接逃逸。不上传、不自动联网安装、不执行库内代码。预览不带脚本或远程资源；公司母版的固定视觉只以 PPTX 为准。

## 并行实施与验收

实施代理分别负责组件引擎、PPTX 后端、CLI/内置库/Skill 说明，主代理管理契约和整合。独立测试代理用临时目录执行真实命令与输出检查，不编写测试代码。验收覆盖默认三场景、局部富文本、第三方本地库、多个页面/元素、源页重复排序、现有 PPT 提取后再生成、无网络与危险输入拒绝。完成后在本文记录实际交付与限制，自动提交相关代码。

## 实施状态

已完成独立 skill，保留现有 dashi-ppt 不变。组件引擎、PPTX 后端、CLI/示例/说明分别由三个实施代理完成；另一个独立验证代理完成真实工作流验收，未新增测试代码。

实际交付：

- 五个固定命令：`catalog`、`validate`、`render`、`starter`、`extract`。
- 八个内置组件：标题、正文、要点、卡片、表格、图片、指标、步骤。
- 三类可直接生成的配置示例：技术汇报、技术方案评审、需求评审。
- 配置 JSON Schema、第三方库格式和提取/安全边界说明。所有运行代码与资源在 skill 内自包含，可整体复制到内网，不依赖其他 skill。
- 图片为本地 PNG/JPEG/GIF/BMP/WebP；输出 HTML 内嵌 PNG，无脚本和远程依赖。表格和文字为原生 PowerPoint 可编辑对象。
- 输出目录事务发布，失败不发布半成品；覆盖仅限有本工具标记的专用产物目录，且禁止输出目录包含本次输入。

与初始方案的具体收敛：

- 提取出的组件 HTML 内联保存在 `library/library.json`，图片位于 `library/assets/`；第三方库仍支持 `htmlFile`，不要求为每个提取组件额外创建文件。
- HTML/CSS 支持绝对坐标、有限字体/颜色/边框和 1/2/4 值 padding。明确拒绝 flex/grid、样式表、脚本和 `line-height`；不承诺任意网页转换。
- 普通文字、非裁剪图片、非合并表格、简单矩形可提取。组合、图表、旋转、复杂形状等保留为原生静态对象并报告；混合静态对象时需检查层叠顺序。主题色/字体及表格复杂效果属于近似映射，不能承诺往返像素一致。
- 库最多 200 个组件；提取超出组件容量、页面边界或支持范围的对象会保留在母版并报告。含嵌入附件/工作簿的 PPTX 也会被包安全检查拒绝。
- 自定义母版保持原页面尺寸；JSON 的像素画布映射到原生尺寸。`box` 缩放会缩放组件字号，不会根据内容自动缩小字体或截断正文；最终应本地检查文字溢出。
- 生成和提取会去除源备注、批注、缩略图和旧元数据。模板本身的固定文字、母版内容以及提取出的业务正文仍属于敏感数据，需要保存在内网。

## 独立验收结果

2026-11-05，独立测试代理完成以下真实命令和产物检查：

| 项目 | 结果 |
| --- | --- |
| starter、三个场景配置 validate/render、skill quick_validate | 通过 |
| 公司原生母版按 `2,1,2` 复用；固定页脚和装饰保留 | 通过 |
| 每页多个元素；局部加粗/取消粗体、宋体斜体；本地图片和原生可编辑表格 | 通过 |
| 本地第三方 `htmlFile` 元素库 | 通过 |
| 生成结果提取为 27 个组件，再校验、生成和重排 | 通过 |
| URL、UNC、穿越、符号链接逃逸、脚本、事件、CSS URL、iframe、PPTX 外链拒绝 | 通过 |
| 失败无半成品，保护非本工具目录和输入目录 | 通过 |
| 拦截网络连接后运行完整生成 | 成功，连接尝试为 0 |
| 本机 PowerPoint 打开并导出 PNG，检查组合案例和提取回放截图 | 通过，未发现明显遮挡或缺失 |

已修复集成中发现的四边 padding、局部样式显式 false、字体透明色拒绝、重复母版克隆名称冲突、示例换行/字号及一句文案的孤立标点问题。未引入测试框架或测试代码。

提取回放的表格主题/填充存在近似转换差异，属于已声明限制；正文、字体和位置可用。HTML 为内容预览，不包含原生母版的固定视觉。框架自身没有网络行为，不代表宿主模型、查看器或操作系统自动满足内网数据边界。

临时验收产物及 JSON 报告位于 `temp/intranet-ppt-validation-20261105-022153/`，由仓库忽略规则排除，不随代码提交。

## 元素库扩展与主题换色（本轮追加交付）

- 内置库扩至 34 个组件（流程、分层、目录、引用、提示框、代码块、时间线、四象限等），同目录 `samples.json` 提供演示输入，`images/` 放库内静态图。
- `themes.py` 提供 5 套主题（blue/emerald/crimson/mono/graphite），`load_libraries(palette=)` 在组件 HTML 解析前做规范色板 hex 全词替换；deck JSON 顶层 `"theme"` 生效于 render 链路。
- 新增 `demo` 命令：`demo --out DIR [--library x.json] [--overwrite]` 生成单文件离线 `library-demo.html`，含组件卡片、示例 JSON、5 主题即时换色与固定组合示例；预生成产物在 `assets/demo/`。
- `deck.schema.json` 增加 `theme` 枚举；`library-format.md` 增补规范色板、samples.json、demo 用法；`SKILL.md` 增补元素库预览说明。
