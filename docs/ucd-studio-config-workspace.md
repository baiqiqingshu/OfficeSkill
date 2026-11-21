# UCD Studio 配置工程实施记录

## 实施前方案（2026-11-22）

依据当前 `.agents/skills/ucd-studio/scripts/ucd.py`、`render.py` 和原生 JS 运行库制定；未读取 docs 内历史方案。用户选择 Python + 原生 JS，要求快速原型、不新增测试代码、完成后自动提交。

目标：常规后台页面通过配置生成；特殊区域通过独立 JS 组件扩展；单 HTML 携带可恢复源码，后续解包后修改小文件，避免 agent 编辑交付 HTML。

### 工程与命令

- 新增 `project --out <目录>` 创建管理列表工程并首次构建，支持 `--config` 和标题/主题选项。
- 工程包含 `app.json`、`pages/*.json`、`data/*.json`、`components/*.js`、`runtime/*`、独立 `build.py` 和版本清单。
- 内置组件按注册表和显式依赖复制到工作目录，一组件一文件；自定义组件与内置组件使用相同注册、render/mount、props/slots/context 接口。
- `build --dir <工程>` 自动识别工程模式；构建前把所用源文件复制到临时目录，在临时目录执行随工程携带的 Python 构建器，再输出单 HTML。
- `unpack --html <HTML> --out <目录>` 校验并恢复内嵌工程。工程可用自身 `python build.py` 重建，不依赖 skill 当前版本。
- 保留原有 page.json、quick/init/patch/kit 使用路径，避免破坏旧原型。

### 首版能力

- 后台外壳、页面切换、管理列表、筛选、排序、分页、批量选择、表单、新增编辑、详情抽屉、确认删除、审批状态更新。
- 容器/页签插槽、统计卡片、提示和图片；数据与页面配置分离，字段使用稳定 key。
- 有限操作协议：navigate/open/create/edit/detail/delete/update/toast；特殊逻辑留给 JS 组件，避免通用表达式语言。
- 统一离线主题；保留现有主题 tokens，补充小型工程样式。
- 图片/字体等本地资源内联，源码以压缩归档嵌入 HTML；恢复源码不执行自定义 JS。
- 校验重复 ID、组件依赖、配置引用、归档路径和摘要；外部手改 HTML 会被识别，默认拒绝悄悄覆盖。

### 验证与范围

不新增测试代码；运行真实命令检查创建、构建、解包、修改、独立重建，并用已有浏览器能力检查主要交互和页面布局。更新 SKILL.md、使用说明与工程协议。此次不建设拖拽编辑器，不引入 Vue/Node 构建依赖，不反编译任意第三方 HTML。

## 完成记录

### 已交付

- 实施了独立工程引擎 v1.0.0：`assets/workspace/build.py`，仅用 Python 标准库。旧版生成器保持 1.2.0 与 page.json 兼容。
- CLI 新增 `project`、`components`、`unpack`；build/summary/patch/check 根据 app.json 自动识别工程。patch 支持 `--file`、`--node`、数组索引路径，避免整页覆盖。
- 内置 9 个组件：field/form/detail/table/stats/panel/tabs/alert/image。自定义示例 request-summary 通过同一注册协议组合 stats。
- app/pages/data 分离，支持侧栏/顶栏、10 套主题、两种密度、嵌套插槽与页面切换；table 覆盖筛选、排序、分页、多选、新建、编辑、详情、删除、批量更新。
- components.json 显式声明依赖，构建按依赖拓扑排序并按文件去重。工作目录保留使用组件的源码快照，skill 更新不会覆盖项目内的组件定制。
- 主 CLI 构建从临时目录执行工程自带 build.py；HTML 内嵌 ZIP+Base64 源码包和独立摘要。本地图片/字体内联为 data URL。HTML 外部手改默认阻止覆盖，可显式恢复原源码，不合并手改 DOM。
- `project --config` 从外部配置旁导入被引用页面、数据、组件和素材；不扫描整个业务代码目录。
- 新增可直接打开的 `demo/project/index.html`，约 84 KB，内嵌 19 个源文件；仅交付 HTML 即可解包恢复。示例门户与再生成脚本已加入工程入口。
- SKILL.md 将配置工程设为新任务推荐流程，USAGE.md、工程协议、旧版模式/编辑说明和技能 UI 元数据已同步。

### 使用

```text
python .agents/skills/ucd-studio/scripts/ucd.py project --out output/approval --title "申请管理"
python .agents/skills/ucd-studio/scripts/ucd.py patch --dir output/approval --file pages/requests.json --node requests --set props.pageSize=10
python .agents/skills/ucd-studio/scripts/ucd.py build --dir output/approval
python .agents/skills/ucd-studio/scripts/ucd.py unpack --html output/approval/index.html --out output/approval-edit
python output/approval-edit/build.py
```

完整协议维护在 `.agents/skills/ucd-studio/references/workspace.md`；后续编辑直接定位对应页面 JSON、数据或自定义组件，不需要读取 HTML、源码包或公共运行时。

### 实际验证

遵照用户约定，未新增测试代码或引入依赖。采用真实 CLI 和宿主已有 Playwright/Chromium 做有限冒烟检查，临时输入及截图均在仓库忽略的 temp 目录。

| 检查 | 结果 |
|---|---|
| 技能结构、Python/JS 语法 | quick_validate.py 通过；新增/修改 Python 与全部新 JS 可解析 |
| 创建、定点 patch、构建、外部配置导入 | 成功；按节点修改分页及按数组索引修改字段，不破坏其他内容 |
| HTML 解包、独立重建、源码一致性 | 默认工程成功；check 确认源码与内嵌源码一致 |
| 图片 + 自定义单元格 + CRLF 组件 | 22 个源文件完整恢复；独立连续重建后 HTML 与原产物逐字节一致 |
| 手改保护 | 外部修改 title 后默认解包被拒绝；--allow-modified 成功恢复原源码并明确提示差异 |
| 浏览器业务流程 | 筛选、新增、编辑、详情、关闭、批量审批、确认删除、页面切换、嵌套页签与方向键切换通过 |
| 离线和布局 | 默认侧栏/浅色与顶栏/深色示例检查：未观察到外部请求或 pageerror；375px 视口无页面整体横向溢出，宽表格在容器内滚动；内联图片实际加载成功 |
| 旧版兼容 | quick → patch → check 成功；原有 demo/admin 的 check 通过 |

资源检查复现并修复了 Windows 换行问题：源码中的 CRLF 被嵌入 HTML 后，文本读取的隐式换行转换会导致摘要误报。HTML 校验/解包现在按原始字节读取，保留内容完整性。

### 当前范围

这是可迭代的后台原型框架。数据操作只在浏览器内存保留，刷新恢复初始数据；不写回源 JSON、不接业务后端。只恢复携带本格式源码包的 HTML，不反编译旧版/第三方 HTML。尚未加入拖拽设计器、通用表达式引擎或 Vue 构建链。
