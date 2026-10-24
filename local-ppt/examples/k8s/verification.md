# K8S 示例验证记录

此示例由 `local-ppt-template` 的本地脚本生成，没有调用云端 PPT 工具或上传文件。

## 创建和生成

在项目根目录执行：

```powershell
python skills/local-ppt-template/scripts/pptx_tool.py starter --output examples/k8s/template
# 读取 examples/k8s/template/template-guide.md，从中挑选页面（ID 或页码）生成骨架并填写 content.md
python skills/local-ppt-template/scripts/pptx_tool.py scaffold --template examples/k8s/template --layouts cover,2,title_body,title_body,table,8,title_body,title_body,title_body,10,title_body,title_body,title_body,closing --output build/k8s-skeleton.md
python skills/local-ppt-template/scripts/pptx_tool.py validate --template examples/k8s/template --content examples/k8s/content.md
python skills/local-ppt-template/scripts/pptx_tool.py generate --template examples/k8s/template --content examples/k8s/content.md --output examples/k8s/kubernetes-introduction.pptx --overwrite
```

现有模板目录不可重复创建，复现时选择新的目录。生成文件已存在时使用新输出路径或 `--overwrite`。
`scaffold --layouts` 接受布局 ID 或模板页码，可任意挑选、重复、排序，不要求覆盖全部模板页面。

## 验证结果

- 模板：18 种内置布局（封面、目录、章节页、标题正文、双栏、图文、文图、卡片阵列、步骤条、数据指标、多栏对比、表格、清单、图片行、标签、引用、整页图片、封底），浅色简约 + 橙红强调配色；说明文档自动生成并包含全部输入及限制。
- 输出：14 页，顺序为封面、目录（数组）、概述（图标分点）、架构、资源表格、核心能力卡片（数组）、Pod 与 Deployment、应用访问、部署步骤（数字分点）、收益数据（数组）、运维机制（图标分点）、配置存储、实践顺序（编号分点）、封底。
- 选页：示例仅使用 18 种布局中的 7 种，顺序自由组织；`scaffold` 同时支持布局 ID 和模板页码。
- 数组元素：目录页按条目个数（6 条）沿样例间距纵向克隆；卡片页按 4 条克隆组合形状并填充图标/标题/说明三个文本位；数据页 3 条大数字指标。未提供的数组输入会整体移除样例。
- 分点：`1.`/`2)` 渲染为原生编号（`buAutoNum`，保留书写的起始数字与标点）；`- [✓; #E85A2E]` 渲染为带颜色的字符分点（`buChar`+`buClr`）；普通 `-` 仍为 `•`。
- 局部样式：第 3 页首词使用 Arial、蓝色、粗体，其余文字继承模板；正文和表格还包含 Markdown 局部粗体。
- 本地 PowerPoint：成功打开并导出全部 14 页为 PNG，逐页检查无缺字、遮挡、越界和异常换行。
- 项目测试：27 项通过，覆盖页码选页与重复排序、数字/图标分点 XML、组合/文本/图片数组克隆与字段填充、数组条目数与字段数校验、数组 spec 校验、省略输入移除、主题保留、断网运行、错误时保护已有输出等。
- Skill 元数据、引用路径和 Python 语法通过本地标准库检查；没有为验证联网安装 PyYAML。

PowerPoint 导出预览放在被 Git 忽略的 `build/k8s-preview-v2/`；可运行 `tools/export-slides.ps1` 在本地重建。代码测试和脚本生成实际完成；没有在 Qwen 或其他本地模型上运行推理能力评测，因此不声称特定模型的成功率。
