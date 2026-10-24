# LocalPptSkill

给内网 agent + 本地模型使用的 PPT skill。模型负责选择布局和填写固定格式 Markdown，脚本负责约束校验和 PPTX 生成。无需 Codex API 或云端服务。

## 项目内容

- `skills/local-ppt-template/`：可独立复制部署的完整 skill（说明、格式参考、Python 脚本）。
- `examples/k8s/template/`：内置 18 种布局的模板包及自动说明。
- `examples/k8s/content.md`：K8S 入门介绍的填充内容。
- `examples/k8s/kubernetes-introduction.pptx`：使用 skill 脚本实际生成的演示文稿。
- `tests/`：本地端到端测试，包括断网运行、输入限制和参考保留。

## 依赖与部署

Python 3.10+，本地安装 `python-pptx==1.0.2`、`Pillow>=10,<13`、`lxml>=4.9,<7`。脚本使用公开 Python 库处理本地文件，不含 HTTP 请求、遥测、上传和云转换。

```powershell
python -c "import pptx, PIL, lxml; print('ready')"
```

需要补充依赖时，先由管理员准备本地 wheel，再离线安装：

```powershell
python -m pip install --no-index --find-links D:\offline-wheels -r skills/local-ppt-template/scripts/requirements.txt
```

把 `skills/local-ppt-template` 完整复制到目标 agent 的 skill 目录；Codex 通常为 `%USERPROFILE%\.codex\skills\local-ppt-template`。其他 agent 读取同一 SKILL.md 即可，脚本不依赖 Codex。不需要模型阅读或修改 Python 实现。

可选安装命令入口（已有 setuptools 和本地依赖）：`python -m pip install --no-index --no-build-isolation --no-deps -e .`，随后使用 `local-ppt`。直接运行下列脚本不需要项目安装。

## 从模板生成 PPT

先读模板说明，挑选要用的模板页面并组织顺序（不必照搬全部页面），再产生 MD，最后运行：

```powershell
python skills/local-ppt-template/scripts/pptx_tool.py scaffold --template examples/k8s/template --layouts cover,4,4,12 --output build/content.md
python skills/local-ppt-template/scripts/pptx_tool.py validate --template examples/k8s/template --content examples/k8s/content.md
python skills/local-ppt-template/scripts/pptx_tool.py generate --template examples/k8s/template --content examples/k8s/content.md --output build/k8s.pptx
```

`--layouts` 接受布局 ID 或模板页码，可重复、可任意排序。生成文件可被 PowerPoint 直接编辑。复杂内容请读 skill 中的格式参考；普通 PPT 只需页面标题、元素标题、正文和 Markdown 表格。正文支持 `- 符号分点`、`1. 数字分点`、`- [图标] 图标分点`；数组元素按 `- 字段1 || 字段2` 每行一个条目填充，个数决定复制数量。局部文字可用 `**加粗**`、`*斜体*`、`<span style="font-family: Arial; color: #2563EB">片段</span>`。

## 创建模板

```powershell
# 无参考时：18 种内置布局（浅色简约、橙红强调，含数组条目页），自动生成说明文档
python skills/local-ppt-template/scripts/pptx_tool.py starter --output build/my-template

# 有参考时：先生成候选，再整理 spec 中的布局/输入说明与限制
python skills/local-ppt-template/scripts/pptx_tool.py inspect reference.pptx --output build/spec.json
python skills/local-ppt-template/scripts/pptx_tool.py create reference.pptx --spec build/spec.json --output build/reference-template
```

每个模板必带 `template.pptx`、`manifest.json`、`template-guide.md`。支持任意页面顺序和布局重复。限制会在写输出前检查；错误信息定位到具体页、元素、MD 行号，不会静默截断或覆盖旧结果。需要替换已有生成结果时显式加 `--overwrite`。

## 验证

```powershell
python tools/validate-skill.py
python -m unittest discover -s tests -v
```

内置测试不依赖网络或 PowerPoint。视觉检查可使用本地 PowerPoint 或 LibreOffice；文字换行估算不能保证所有字体的实际排版。项目提供可选 Windows PowerPoint 本地导出脚本 `tools/export-slides.ps1`，仅对可信本地文件运行；不安装 Office、不上传内容。不要使用云预览或公网下载字体/图片。

本地脚本无法限制宿主 agent 的推理请求、云同步目录或企业终端策略；内网部署应同时使用本地模型与本地数据目录。本 skill 禁止通过工具上传内容。
