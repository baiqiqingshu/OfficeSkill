# UCD Studio 文件精简

## 结论与范围

2026-10-28 整理前，技能目录实际有 230 个文件（包含隐藏目录），Git 跟踪 79 个文件。超出 100 的部分不是功能源码，而是 146 个示例历史快照和 4 个 Python 字节码缓存；另有新增的设计参考文档。保留全部源码、配置、组件、六种布局、九个示例页面和三种输出模式，不需要合并它们。

整理后技能目录实际为 81 个文件，包含新设计参考文档与一个历史 ZIP；最终纳入版本管理也为 81 个。没有删除原型能力、减少示例或改变页面渲染内容。此数量是交付目录的文件数，任意用户自行在技能中生成新文件后不保证仍低于 100。

## 无损归档

146 个 `demo/*/.history/` 文件按原相对路径写入 `.agents/skills/ucd-studio/demo-history.zip`。归档后逐文件比较解压字节与原文件，同时校验 ZIP CRC 和条目数量，全部一致。归档共 538,837 字节，SHA-256 为 `905ddd127e40821a4bd1e3227958d81412b78a1b42f05e1bfbbed3619e3cf0b2`。

原始历史目录及 4 个可重建字节码文件另外可逆移动至仓库 `temp/ucd-studio-legacy-cache/`，作为本机保留副本，不随 Git 提交。没有删除原始快照。

需要找回旧示例时，在技能外新建目录，然后执行：

```powershell
python -B -m zipfile -e .agents/skills/ucd-studio/demo-history.zip temp/ucd-studio-history-restored
```

历史位于 `temp/ucd-studio-history-restored/demo/<示例>/.history/<时间戳>/`。先检查旧页面、源配置与清单，按需复制到新的工作目录，不覆盖当前示例；旧版清单的工具版本或固定运行库保护仍按现有规则执行。

## 防止再次膨胀

- `scripts/ucd.py` 对自带 `demo/` 的直接子目录单独设置快照位置：仓库中使用 `temp/ucd-studio-history/<示例>/`；技能独立安装且没有此仓库时使用系统临时目录 `ucd-studio-history/<技能路径摘要>/<示例>/`。临时目录不应作为长期备份，需保留的新历史应另行归档。
- 其他用户输出目录保持原来的 `<输出>/.history/` 机制，不改变 CLI 参数、清单格式、手工修改保护或恢复内容。
- 正常运行 `ucd.py` 与 `make_demo.py` 时关闭新增导入模块字节码缓存；现有验证命令使用 `python -B`，避免测试自身重新生成缓存。

## 验证边界

本次没有编写新测试代码。独立测试代理于 2026-10-28 完成以下验证：

- `python -B -m unittest discover -s .agents/skills/ucd-studio/tests -v`：16 个现有测试全部通过，覆盖六种布局、三种模式、组件生成、补丁历史、手工修改保护和离线审计。
- 九个自带示例的 `check --dir ...` 全部通过，各示例外部资源数均为 0。
- ZIP 共 146 个条目，CRC 校验通过；再次逐文件与 `temp/ucd-studio-legacy-cache/` 内保留原件比较，字节完全一致，SHA-256 与上文一致。
- `history_root` 实际返回：自带 `demo/admin` 指向仓库 `temp/ucd-studio-history/admin`，普通临时输出指向自身 `.history/`。
- 完成检查后技能物理文件数仍为 81，没有新增技能内字节码缓存。
- 为避免把工作区其它未提交的设计升级当成本次依赖，将 `HEAD` 版 UCD 完整复制到技能外临时目录，仅覆盖本轮暂存的 `ucd.py` / `make_demo.py` / `USAGE.md`。暂存脚本语法编译通过，使用 `HEAD` 的 `render.py` 和资源执行 `init → build → check` 通过，普通输出实际生成自身 `.history/`。

上述检查验证文件精简与功能保留；未将静态检查冒充全部页面的浏览器验收。布局与视觉源文件未因文件精简发生修改。
