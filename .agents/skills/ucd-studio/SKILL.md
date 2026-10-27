---
name: ucd-studio
description: 创建和修改公司内网工具网站的离线 HTML 界面原型。适用于审批列表、工作台、表单、详情和看板；支持按需读取本地项目。无需联网、安装依赖或前端构建，不用于 UML 或生产后端。
---

# UCD Studio

默认面向内部业务人员：浅色、蓝色主操作、紧凑表格、系统字体；已有产品规范优先。以用户的主任务组织页面，标题直接说明任务，用对齐、留白与分隔线建立层级；不用营销首屏、装饰眉题或无依据的指标。`<skill>` 替换为本文件所在目录。Python 3.10+，仅标准库。

## 直接生成

从需求选择布局，不必先检索：`admin` 筛选列表（默认）、`workbench` 多栏工作台、`form` 填写申请、`detail` 详情记录、`kanban` 任务看板、`dashboard` 工作总览。

```text
python <skill>/scripts/ucd.py init --layout admin --title "申请管理" --out output/approval
```

**已生成页面、规范并执行静态检查，无需再 build/check。** 默认 ocean 样式、single 单 HTML。缺失信息采用合理默认值；只有影响核心流程时才询问。

默认规范随实际主题、密度、区块及输出模式生成，记录合并后的 token 与文字对比度。控件保持统一状态语言，表格异常有本地恢复入口，窄屏重排而不缩小数据字号。定制设计系统或手工扩展组件时再读 [design-guidelines.md](references/design-guidelines.md)，普通生成不必加载。

业务字段已明确时，写小份 JSON 覆盖文件，同一次生成完成定制：

```text
python <skill>/scripts/ucd.py init --layout admin --config brief.json --out output/approval
```

brief.json 只写变化，例如 `{"title":"资产台账","blocks":{"records":{"title":"设备记录"}}}`。改表格列与数据时一起提供 columns/rows；其他结构沿用模板。不熟悉配置才读 [page-spec.md](references/page-spec.md)。

## 继续修改

已知改动直接写补丁，不重新初始化或读取整份 HTML：

```text
python <skill>/scripts/ucd.py patch --dir output/approval --patch change.json
```

例如 `{"blocks":{"records":{"title":"待我审批"}}}`。对象递归合并、数组整体替换、null 删除可选字段。需要了解现状才执行 `summary --dir output/approval`；需要区块内容再加 `--block records`。手工修改冲突才读 [editing.md](references/editing.md)。

## 按需展开

| 遇到的需求 | 再读取或调用 |
|---|---|
| 调字段、加区块 | [page-spec.md](references/page-spec.md)；`show table --example` 只取 JSON 示例 |
| 模板不合适、查样式/组件 | [advanced-usage.md](references/advanced-usage.md)；不默认检索 |
| 定制视觉规范、密度或组件状态 | [design-guidelines.md](references/design-guidelines.md) |
| 依据已有项目设计 | [source-workflow.md](references/source-workflow.md) |
| 独立 JS 或复杂定制 | [output-modes.md](references/output-modes.md) |

## 验证与交付

有本地浏览器时检查主任务、键盘焦点、加载/空/错误及恢复反馈、桌面与窄屏；没有则说明仅做静态检查。手工编辑后额外执行 `check --dir ...`。交付 index.html、design-system.md；保留 page.json、manifest.json 和 assets/ 便于修改。规范中的对比度仅覆盖列出的实色组合，不能代替实际页面验证。交互仅在本地模拟，无真实提交和持久化。

始终离线：不用外网、外部 MCP、远程模型，不上传源码、不安装包；不用 CDN、远程字体/图片、网络请求或外链跳转。CSP 与静态检查不替代宿主网络隔离。不加载全部示例、组件库、CSS 或 JS。
