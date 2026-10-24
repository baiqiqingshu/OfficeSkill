# UCD Studio 离线技能包

本目录是完整可搬运技能，无需联网安装依赖。把整个 ucd-studio 目录复制到目标工具的技能目录（如 .agents/skills/ucd-studio），不要只复制 SKILL.md。当前在普通工作目录交付，尚未安装到受保护的 .agents。

生成端：Python 3.10+，标准库。预览端：现代 Chromium/Edge/Firefox，直接双击 HTML，无需服务。下列命令在包的上级目录执行：

```text
python ucd-studio/scripts/ucd.py search "审批 列表" --kind component --limit 2
python ucd-studio/scripts/ucd.py show table --code
python ucd-studio/scripts/ucd.py init --layout admin --style ocean --out output/approval
python ucd-studio/scripts/ucd.py build --dir output/approval
python ucd-studio/scripts/ucd.py check --dir output/approval
python ucd-studio/scripts/ucd.py patch --dir output/approval --patch change.json
python ucd-studio/scripts/ucd.py inspect --root your-project --out output/source-map.json
```

在支持技能的内网模型中可直接输入：

> 使用 $ucd-studio，设计部门审批工作台。用户是审批人，主任务是快速筛选待审批申请并查看上下文。使用专业蓝色和紧凑表格，输出离线单页 HTML、设计规范与本地资源。数据全部使用脱敏示例。

后续修改：

> 使用 $ucd-studio 修改 output/approval，保留现有结构，改为青绿色，将列表标题改为“待我审批”，同步设计规范。

源码整理：

> 使用 $ucd-studio 阅读当前项目中的申请管理界面，按实际字段生成 HTML 原型和规范，注明源码依据与设计假设。禁止外网调用，不运行原项目代码。

8 套主题、24 个组件（16 个生成区块 + 8 个基础代码片段）、6 类完整布局。打开 [demo/index.html](demo/index.html) 选择页面；另外提供完整组件和两种 JS 分离模式示例。默认使用单 HTML 模式；另支持 --mode library 和 --mode editable。三种取舍见 [output-modes.md](references/output-modes.md)。

命名重复时（如 form 同时是布局和组件），使用 `show form --kind layout --code` 区分。用 `python ucd-studio/scripts/make_demo.py` 可重新生成整个示例目录；它也遵守手工修改保护。

离线承诺的边界：包内脚本无网络调用、不安装软件；生成页面无远程资源、带 CSP。内网模型服务及工具宿主本身仍须处于获准隔离环境。任意新增 JS 不能仅凭静态扫描证明安全；手工修改后应做浏览器检查。源码扫描报告也是内部数据，不应对外上传。

开发验证（不属于使用时依赖）：Python unittest；浏览器验证可使用项目已有 Playwright/Chromium。验证结果见 [validation.md](references/validation.md)。
