---
name: local-ppt-template
description: Create local PPTX templates with layout documentation, or fill a template from Markdown to generate editable slides. Use for offline or intranet PowerPoint template creation and template-based presentation generation.
---

# 本地 PPT 模板与生成

面向内网 agent 和本地语言模型。使用固定格式和本地 Python 脚本，模型只需选择布局、填写 Markdown。支持 `.pptx`；旧版 `.ppt` 应先用本地 Office 转为 `.pptx`。

## 必须遵守

- 全程使用本地文件、Python、python-pptx、Pillow、lxml。禁止上传原稿、模板、内容、图片；禁止云端 PPT 工具、联网转换、图片搜索和远程生成。不要自动联网安装依赖。
- 先读取模板目录的 `template-guide.md`，再写填充内容 MD，最后调用脚本生成 PPTX。不要由模型临时编写生成脚本。
- 保持布局 ID 和输入 ID 完全一致。每页只使用该布局定义的元素；模板中的输入可以省略，未提供的元素按空内容处理，不要因为缺少元素而中止生成。
- 超限时精简内容或拆页，保留用户要求的信息；不要静默截断、缩小字体或增加输入框。
- 输出后用本地 PowerPoint/LibreOffice 检查换行、遮挡和图片比例。未安装渲染器时说明未做视觉复核，不要调用云端预览。

下面命令中的 `SKILL_DIR` 是本 SKILL.md 所在目录，`python` 应替换为已安装依赖的本地 Python。命令可在任意工作目录运行。

## 使用已有模板生成 PPT（默认流程）

1. 读取 `模板目录/template-guide.md`。说明中的每个布局对应一张模板示例页（`模板示例页：N`）。
2. 向用户展示可选页面，让用户挑选需要的页面并确定顺序——不要求使用全部页面，可任意挑选、重复、排序，不必照搬模板原顺序。用户未指定时给出建议组合（如 `cover`、`agenda`、若干内容页、`closing`）。
3. 按选定页面生成填充骨架；`--layouts` 接受布局 ID 或模板页码（示例页编号）：

   ```text
   python SKILL_DIR/scripts/pptx_tool.py scaffold --template 模板目录 --layouts cover,2,5,5,table --output content.md
   ```

4. 打开 `content.md`，保留 `## page:` 和 `### 元素ID: 类型` 标题，只替换各元素内容。每个换行是一个段落。中文字符、空格、标点均计入字数。可使用 `**加粗**`、`*斜体*`。分点支持 `- 符号分点`、`1. 数字分点`、`- [图标] 图标分点`；数组元素每行一个 `- 条目`，多个文本位用 ` || ` 分隔，条目个数决定复制排列的数量。需要图片、表格、数组细节或局部字体时读 [填充格式](references/content-format.md)。
5. 执行：

   ```text
   python SKILL_DIR/scripts/pptx_tool.py generate --template 模板目录 --content content.md --output result.pptx
   ```

   脚本先校验所有页面，成功才写文件。失败会报告页面 ID、元素 ID、MD 行号和原因。修正对应元素后重新执行；同一错误连续两次时查看说明/格式，无法修复则向用户说明具体缺失信息。
6. 检查生成结果并交付 PPTX；用户要求时同时交付模板包和填充 MD。已有输出需要替换时加 `--overwrite`。

最小填写示例：

```markdown
# PPT 填充内容

## page: intro layout: title_body

### title: text

Kubernetes 简介

### body: text

**容器**封装应用与运行依赖。
Kubernetes 管理多个节点上的容器化应用。
- 应用部署
- 扩缩容与故障恢复
```

## 创建模板

没有参考 PPT 时，先创建内置模板：

```text
python SKILL_DIR/scripts/pptx_tool.py starter --output 模板目录
```

自动产生 18 种布局（浅色简约风格，橙红强调色）：`cover` 封面、`agenda` 目录、`section` 章节、`title_body` 标题正文、`two_column` 双栏、`image_text`/`text_image` 图文两向、`cards` 卡片阵列、`steps` 步骤条、`stats` 数据亮点、`columns` 多栏对比、`table` 表格、`checklist` 清单、`image_row` 图片阵列、`tags` 标签行、`quote` 引用、`image_full` 全幅图、`closing` 结尾。其中目录、卡片、步骤、数据、对比、清单、图片墙、标签均使用数组输入——模板中的两个样例决定条目排列方向和间距，填充内容决定条目个数。每个布局的元素和限制写在自动生成的 `template-guide.md`。

有参考 PPT 时：

1. 执行 `inspect` 读取参考页与候选输入映射。
2. 阅读 [参考模板映射](references/template-format.md)。根据用户用途整理候选 spec：布局命名、输入命名、布局说明、输入说明和容量限制；删除应保持静态的元素映射。自动识别结果只是候选，不能保证知道用户意图。
3. 执行 `create`。脚本保留参考页的母版、主题、布局和静态内容，清空映射为输入的样例文字/图片/表格，自动生成说明文档。每个选定参考页代表一种布局类型。

```text
python SKILL_DIR/scripts/pptx_tool.py inspect reference.pptx --output spec.json
python SKILL_DIR/scripts/pptx_tool.py create reference.pptx --spec spec.json --output 模板目录
```

模板目录包含三项，必须一起保留：`template.pptx`、`manifest.json`、`template-guide.md`。说明文档列出所有布局及其用途、输入映射、必填性、文字容量、图片/表格宽高和表格行列数。修改 manifest 中的约束后用 `describe --template 模板目录` 更新文档；修改 PPTX 后重新创建模板。

## 本地依赖和边界

依赖清单位于 `scripts/requirements.txt`。先确认已安装：

```text
python -c "import pptx, PIL, lxml; print('ready')"
```

未安装时使用内网管理员准备的 wheel 目录：`python -m pip install --no-index --find-links 本地wheel目录 -r SKILL_DIR/scripts/requirements.txt`。

脚本不调用 Codex API，也不要求特定模型。不能填充组合内元素（数组条目的组合样例除外）、图表数据、合并表格单元格；图表等可作为静态对象保留。外部链接/外部资源关系、宏、ActiveX 和跨页跳转会被拒绝。模板原稿的备注和批注不会复制；未映射的静态内容仍会保留，需在本地核对。云同步目录和宿主 agent 本身的数据流由部署环境控制，本 skill 的脚本不上传内容。
