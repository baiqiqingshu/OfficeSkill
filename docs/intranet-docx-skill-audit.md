# 内网 docx skill 选型与安全审计

日期：2026-11-17。目标：为内网本地小模型挑选一个 docx 处理 skill，硬约束是**不得把用户 docx 内容上传外网**；运行时须离线可用（安装期联网下载可接受）。

## 1. 候选对比

| 候选 | 来源 | License | 运行时依赖 | 结论 |
| --- | --- | --- | --- | --- |
| 1. hermes-agent `skills/productivity/docx` | github.com/NousResearch/hermes-agent | MIT | python-docx | **路径不存在**：docx 能力实际位于 `skills/productivity/microsoft-office`（docx+xlsx+pptx 三合一）。按其实际单元审计，**通过并采用** |
| 2. anthropics/skills `skills/docx` | github.com/anthropics/skills | Proprietary | pandoc + npm docx 包 | 未评估（候选 1 已通过）；Proprietary license 内网使用需谨慎，且需 pandoc/npm 外部依赖 |
| 3. minimax-ai/skills `minimax-docx` | github.com/minimax-ai/skills | — | .NET OpenXML SDK | 未评估；.NET SDK 依赖重，内网小模型环境不划算 |
| 4. kklimuk/docx-cli | github.com/kklimuk/docx-cli | — | 预编译 bun 二进制 | 未评估；二进制无法低成本源码审计，与保密要求冲突 |

## 2. 选定结果

- **选用**：`NousResearch/hermes-agent`（MIT）的 `skills/productivity/microsoft-office`，完整安装到 `.agents/skills/docx/`。
- **与任务的偏差**：上游没有独立的 `docx/` 子目录，docx 与 xlsx/pptx 脚本同属一个 skill 且 SKILL.md 互相引用，故按完整单元安装（docx 为主，xlsx/pptx 为附带能力）。
- **本地改动**：仅把 SKILL.md frontmatter `name: microsoft-office` 改为 `name: docx`，使目录名与 skill 名一致（便于按目录名校验 name 的加载器）。其余文件与上游逐字节一致。
- skill 形态：20 个 argparse CLI 脚本（`scripts/`）+ 5 份格式参考文档（`references/`）+ 3 个 pytest 文件（`tests/`），stdout 输出 JSON、失败非零退出——天然适合小模型调用。

## 3. 审计方法

1. 通过 GitHub Contents API 列出 skill 全部 30 个文件，逐个从 raw.githubusercontent.com 下载（LICENSE 经 API base64 取回）。
2. 关键词扫描（全部 30 个文件）：
   - 网络调用：`requests|urllib|httpx|aiohttp|socket|fetch|telemetry|upload|post(|urlopen|curl|wget|download|ftp|smtp|websocket|grpc|boto|analytics|beacon|webhook|http.client|ssl.|ftplib|telnetlib|xmlrpc|smtplib|webbrowser`
   - 进程与动态执行：`subprocess|os.system|Popen|eval(|exec(|__import__|importlib|ctypes`
   - 环境/路径外写：`environ|getenv|expanduser|home()|/etc/|AppData|.cache`
   - URL 字面量：`http(s)?://`
3. 人工通读：SKILL.md 全文 + 7 个 `docx_*.py` 全部源码 + `xlsx_recalc.py`/`pptx_render.py` 的 subprocess 段 + 其余 13 个脚本 docstring 与 import 面 + 测试文件 `run()` 辅助函数。
4. import 面汇总：仅标准库（argparse/json/sys/os/re/csv/zipfile/shutil/tempfile/subprocess/copy/datetime/pathlib/struct/zlib/posixpath/glob/base64）+ python-docx + python-pptx + openpyxl + lxml + pytest（仅测试）。

## 4. 网络调用审计结果

**结论：无任何外联代码、无遥测、无远程模板/资源拉取。**

- `requests/urllib/httpx/socket/http.client/ssl/ftp/smtp/webbrowser` 等网络相关调用：**0 命中**。
- `telemetry/upload/beacon/webhook/analytics`：**0 命中**。
- `track` 的 28 处命中全部是 Word "tracked changes"（修订）语义，非追踪遥测。
- subprocess 仅 2 处业务用途，均为本地可执行文件：
  - `scripts/xlsx_recalc.py`：`soffice --headless --convert-to xlsx`（LibreOffice 本地重算公式；env 只传 HOME/PATH，反而隔离了环境变量）。soffice 不存在时输出原因并退出 0。
  - `scripts/pptx_render.py`：`soffice --headless --convert-to pdf` + `pdftoppm/pdftocairo`（本地渲染幻灯片 PNG）。工具缺失时同样只报告不失败。
  - `tests/*.py`：仅用 `sys.executable` 起本 skill 脚本做端到端测试，测试文件自述 "no network"。
- URL 字面量全部是良性：
  - `schemas.openxmlformats.org`、`w3.org`：OOXML XML 命名空间常量，仅作标识符从不发起请求。
  - `example.com`：`pptx_create.py` docstring 与 `references/excel.md` 中的超链接**内容**示例（写进单元格的数据，不是抓取目标）。
- 文件访问只读/写 CLI 参数给定路径；脚本内无 `os.environ` 读取（仅测试用其设 locale）、无家目录/系统目录写入。
- SKILL.md Prerequisites 段含一条**可选**的 venv + `pip install` 固定版本命令：仅在运行环境缺库时由 agent 显式执行的初始化步骤（会访问 PyPI），本机依赖已齐不会触发；另有 `hermes pm environment` 本地 CLI 调用，无 hermes 时跳过。二者均为文档明示行为，非隐蔽外联。

## 5. 依赖清单

| 包 | skill 固定版本 | 本机已装（系统 Python 3.12.10） | 可离线 pip |
| --- | --- | --- | --- |
| python-docx (`import docx`) | 1.2.0 | 1.2.0 | 是 |
| openpyxl | 3.1.5 | 3.1.5 | 是 |
| python-pptx (`import pptx`) | 1.0.2 | 1.0.2 | 是 |
| lxml | （python-docx 传递依赖） | 6.1.1 | 是 |
| pytest（仅跑 tests/ 需要） | — | 未装 | 是 |
| LibreOffice `soffice`（可选：PDF 导出/公式重算/渲染） | — | 未验证 | 非 pip |
| poppler `pdftoppm/pdftocairo`（可选：pptx 渲染 PNG） | — | 未验证 | 非 pip |

版本与 skill 的 pin 完全一致；可选外部工具缺失时相关脚本只报告不报错，docx 核心功能不受影响。

## 6. 安装与验证

- 安装路径：`.agents/skills/docx/`（30 文件，约 312KB；含 `SKILL.md`/`LICENSE`/`scripts/`/`references/`/`tests/`）。
- frontmatter 校验：`name: docx`、`description: Create, read, and edit Word, PowerPoint, and Excel files.` 均在。
- 冒烟测试（系统 python，全部通过）：
  - `docx_create.py spec.json smoke.docx` → `{"ok": true, "blocks": 3}`
  - `docx_read.py smoke.docx --structure` → 正确返回 1 个标题、2 段落、1 表格的 JSON
  - `docx_validate.py smoke.docx` → `{"ok": true, "issues": []}`
- pytest 套件未跑（本机无 pytest），已由上述直接调用覆盖 create/read/validate 链路。

## 7. 残留风险与内网使用建议

1. **低残留风险**：全部源码已通读，无外联面。唯一会触网的路径是 SKILL.md 文档化的可选 venv `pip install`（缺库才执行）——内网部署前请预装第 5 节四个包即可彻底避免。
2. 建议安装后**断网复测**一次冒烟命令（create/read/validate），确认无隐藏联网依赖。
3. 建议配合**防火墙出站规则**：对运行 agent 的进程禁止外网出站，作为审计之外的第二道防线（纵深防御）。
4. 供应链注意：本次按 `main` 分支当时内容审计（commit 对应 API 列出的文件 sha）；上游更新后如需升级应重新 diff 审计，勿直接覆盖。
5. `docx_comments.py` 默认 `--author "Hermes"`，写批注时会落库作者名，可按需改为本机标识。
6. 旧格式 `.doc/.xls/.ppt` 不在能力范围，需 LibreOffice 先转 `.docx` 等（skill 文档已声明）。
