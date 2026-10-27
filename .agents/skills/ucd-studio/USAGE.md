# UCD Studio 离线技能包

本目录是完整可搬运技能，无需联网安装依赖。把整个 ucd-studio 目录复制到目标工具的技能目录（如 .agents/skills/ucd-studio），不要只复制 SKILL.md。默认针对公司内网工具网站设计，入口优先直接生成，仅按需读取组件与参考。

生成端：Python 3.10+，标准库。预览端：现代 Chromium/Edge/Firefox，直接双击 HTML，无需服务。下列命令在包的上级目录执行：

```text
python ucd-studio/scripts/ucd.py init --layout admin --title "申请管理" --out output/approval
```

已生成 HTML、规范并执行结构与离线检查；不必再 build/check。业务字段明确时用 `--config brief.json` 一次定制，brief.json 只写与模板不同的字段。修改时：

```text
python ucd-studio/scripts/ucd.py patch --dir output/approval --patch change.json
```

按需披露：入口 → 摘要/目标区块 → JSON 示例/协议 → 手工扩展代码。已知标题变更直接 patch；不了解现状才 summary。检索、源码扫描和独立 JS 模式不进入默认路径，见 [advanced-usage.md](references/advanced-usage.md)。

在支持技能的内网模型中可直接输入：

> 使用 $ucd-studio，设计部门审批工作台。用户是审批人，主任务是快速筛选待审批申请并查看上下文。使用专业蓝色和紧凑表格，输出离线单页 HTML、设计规范与本地资源。数据全部使用脱敏示例。

后续修改：

> 使用 $ucd-studio 修改 output/approval，保留现有结构，改为青绿色，将列表标题改为“待我审批”，同步设计规范。

源码整理：

> 使用 $ucd-studio 阅读当前项目中的申请管理界面，按实际字段生成 HTML 原型和规范，注明源码依据与设计假设。禁止外网调用，不运行原项目代码。

8 套主题、24 个组件（16 个生成区块 + 8 个基础代码片段）、6 类完整布局。打开 [demo/index.html](demo/index.html) 选择页面；另外提供完整组件和两种 JS 分离模式示例。默认使用单 HTML 模式；另支持 --mode library 和 --mode editable。三种取舍见 [output-modes.md](references/output-modes.md)。

默认设计以业务操作为中心：统一字号、4px 间距基准、语义色与控件状态，桌面保持数据密度，窄屏重排并保留表格局部滚动。浅色企业蓝用于日常办公，深色需符合实际使用环境，不自动随系统偏好切换。详细决策及六类模板的结构约定见 [design-guidelines.md](references/design-guidelines.md)，只在定制规范时读取。

每次 init、patch 或 build 都会同步 design-system.md：包含有效 token 及覆盖来源、实色文字对比度、当前密度尺寸、实际区块网格和对应交互。没有表单或看板的页面不会列出它们的行为。对比度未达推荐值会写入规范，不会阻止用户自定义主题，也不会自动修正品牌色；交付时结合实际页面确认。

命名重复时（如 form 同时是布局和组件），使用 `show form --kind layout --code` 区分。用 `python ucd-studio/scripts/make_demo.py` 可重新生成整个示例目录；它也遵守手工修改保护。

1.1.0 包含模板规范与运行时升级。旧版目录触发版本保护时，使用 `make_demo.py --out 新目录` 或在新目录 init 后迁移配置与素材，不修改 manifest 绕过保护；editable 的手工行为需要人工合并。详见 [output-modes.md](references/output-modes.md)。

仓库自带 `demo/` 的更新快照写入仓库 `temp/ucd-studio-history/<示例>/`，避免重复历史撑大技能目录；独立安装时改用系统临时目录下按技能路径区分的缓存。其他输出目录仍在自身 `.history/` 中保存快照。已有 146 个示例历史文件无损合并到 `demo-history.zip`，其内部路径从 `demo/` 开始；仅在需要旧版本时解压到技能之外的新目录，不覆盖当前示例。正常使用和查看示例不需要解压。

离线承诺的边界：包内脚本无网络调用、不安装软件；生成页面无远程资源、带 CSP。内网模型服务及工具宿主本身仍须处于获准隔离环境。任意新增 JS 不能仅凭静态扫描证明安全；手工修改后应做浏览器检查。源码扫描报告也是内部数据，不应对外上传。

开发验证（不属于使用时依赖）：Python unittest；浏览器验证可使用项目已有 Playwright/Chromium。验证结果见 [validation.md](references/validation.md)。
