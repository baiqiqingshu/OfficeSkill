---
name: ucd-studio
description: 基于提示词或本地项目源码创建和修改 UCD 用户界面原型，输出离线单页 HTML、设计规范和本地资源。内置可检索样式、组件代码及面板布局，适合内网低性能模型；用于界面设计，不用于 UML 绘图或生产后端开发。
---

# UCD Studio

使用 Python 3.10+ 标准库工具，生成可双击打开的界面。无需安装依赖、联网、Node 或前端构建服务。以下 `<skill>` 指本文件所在目录；执行前替换为实际路径。不要全量读取资源库。

## 快速生成

1. 提取目标用户、核心任务、页面类型、业务字段和视觉偏好。缺少信息时使用合理默认值并写入 `assumptions`；只有影响核心流程时才询问。UCD 输出应表达任务、状态与反馈，不把设计假设写成研究结论。
2. 按需查询，每次最多 3 条；先选布局、样式，再查缺少的组件。

   ```text
   python <skill>/scripts/ucd.py search "审批 列表 筛选" --kind layout --limit 2
   python <skill>/scripts/ucd.py search "专业 蓝色 后台" --kind style --limit 2
   python <skill>/scripts/ucd.py show table --code
   ```

3. 初始化相近布局，只读生成的 `page.json`，替换业务文案和数据；不重写基础 CSS/JS。

   ```text
   python <skill>/scripts/ucd.py init --layout admin --style ocean --out output/approval
   python <skill>/scripts/ucd.py build --dir output/approval
   ```

   布局：`dashboard` 总览、`admin` 筛选表格、`workbench` 三栏工作台、`form` 表单、`detail` 详情时间线、`kanban` 看板。需要自定义时才读 [page-spec.md](references/page-spec.md)。
4. 执行 `check`，检查主操作、业务字段、空/加载/错误状态、键盘操作及窄屏。有本地浏览器则实际打开验证；没有时说明只做了静态检查。

   ```text
   python <skill>/scripts/ucd.py check --dir output/approval
   ```

5. 交付 `index.html`、`design-system.md`、`assets/`；保留 `page.json` 和 `manifest.json` 用于复现。说明本地模拟行为和未实现的后端功能。首屏应突出用户的主任务，不能把组件堆砌当成完成设计。

## 继续修改

读取已有 page.json 与规范，只查询受影响组件。创建 JSON Merge Patch：对象递归合并，数组整体替换，null 删除可选字段。blocks 以稳定 ID 为键。

```text
python <skill>/scripts/ucd.py patch --dir output/approval --patch change.json
```

例如 `{"style":"jade","blocks":{"records":{"title":"待我审批"}}}`。脚本同步更新页面、规范和清单，保留上次生成快照。检测到手工 HTML/规范/资源修改会拒绝覆盖；按 [editing.md](references/editing.md) 合并，不重新初始化。没有 page.json 的旧页面直接局部修改并同步规范，不承诺无损逆向。

## 阅读项目源码

需要此模式时读 [source-workflow.md](references/source-workflow.md)。先扫描索引，再针对相关视图、路由、组件和样式读少量源码；不运行项目代码或安装依赖。

```text
python <skill>/scripts/ucd.py inspect --root path/to/project --out output/source-map.json
```

扫描是有界证据线索，不是产品理解。sources 标明相对路径及依据，示例数据脱敏。明确指定需要复制的本地素材，不批量复制用户数据或凭证。

## 离线边界

使用本技能期间不使用外网浏览器、搜索、外部 MCP、远程模型或上传源码；不引入 CDN、远程字体/图片、遥测、fetch、WebSocket、服务工作线程、外链跳转，不安装软件包。系统字体、CSS 图形、本地资源足够完成原型。页面 CSP 阻止网络连接、对象、框架和表单外发；check 检查资源和静态外联特征，但不是任意 JS 的安全证明。宿主模型服务、插件及网络隔离由内网环境保障，skill 不能替代这些措施。

## 输出模式

默认 `single`：CSS/JS 内嵌 HTML，assets 只装本地素材；无素材时 HTML 可独立分享。

- `library`：复制固定 `assets/ucd-runtime.js`，通过 DOM/data 属性使用，禁止修改，校验 SHA-256。
- `editable`：复制可修改 page.js；生成器保留手工修改，需验证自定义事件仍匹配页面。

首次 init 用 `--mode library` 或 `--mode editable` 选择。已有目录切换模式需新建目录迁移。完整取舍见 [output-modes.md](references/output-modes.md)，来源见 [provenance.md](references/provenance.md)。
