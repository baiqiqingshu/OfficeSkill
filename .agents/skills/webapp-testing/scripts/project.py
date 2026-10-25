"""Bounded project evidence collection and self-contained execution bundles."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import subprocess

SKILL_DIR = Path(__file__).resolve().parent.parent
EXCLUDED = {".git", ".idea", ".vscode", "node_modules", "target", "dist", "build", ".venv", "venv", "__pycache__", ".webtest", "reports"}
MAX_FILES = 5000
MAX_READ = 128_000


def redact(text):
    """Best-effort redaction; evidence must still be reviewed before sharing."""
    text = re.sub(r"-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----", "[REDACTED PRIVATE KEY]", text)
    text = re.sub(r"(?i)([a-z][a-z0-9+.-]*://)[^\s/@:]+:[^\s/@]+@", r"\1[REDACTED]@", text)
    text = re.sub(r"(?i)((?:authorization|password|passwd|secret|access[_-]?token|refresh[_-]?token|api[_-]?key|token)[\w.\-]*[\"']?\s*[:=]\s*)[^\r\n]+", r"\1[REDACTED]", text)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "[REDACTED JWT]", text)
    return text


def _write(path, value):
    path.write_text(value, encoding="utf-8")


def _json(path, value):
    _write(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def _read(path):
    if path.stat().st_size > MAX_READ:
        return ""
    return path.read_text(encoding="utf-8-sig", errors="replace")


def _git(root, *args):
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=20)
    if result.returncode:
        raise ValueError("Git collection failed: " + redact(result.stderr.strip()))
    return result.stdout


def analyze_project(project, output, requirements=None, staged=False):
    root = Path(project).resolve()
    out = Path(output).resolve()
    if not root.is_dir():
        raise ValueError("Project directory does not exist")
    out.mkdir(parents=True, exist_ok=True)
    if out == root:
        raise ValueError("Analysis output must be a separate directory")
    paths = []
    truncated = False
    for current, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDED and not d.startswith(".") and (Path(current) / d).resolve() != out)
        for filename in sorted(files):
            path = Path(current) / filename
            if path.is_symlink():
                continue
            if path.suffix in {".java", ".vue", ".xml", ".json", ".md", ".gradle", ".kts"} or filename in {"Dockerfile", "mvnw", "gradlew"}:
                paths.append(path)
                if len(paths) >= MAX_FILES:
                    truncated = True
                    break
        if truncated:
            break
    tech, entities, apis, ui_ids, doc_hints = [], [], [], [], []
    for path in paths:
        rel = path.relative_to(root).as_posix()
        source = _read(path)
        if path.name == "pom.xml":
            deps = list(dict.fromkeys(re.findall(r"<artifactId>\s*([^<]+)\s*</artifactId>", source)))
            tech.append({"path": rel, "kind": "Maven", "dependencies": deps[:24]})
        elif path.name in {"build.gradle", "build.gradle.kts"}:
            tech.append({"path": rel, "kind": "Gradle", "spring_boot": "org.springframework.boot" in source})
        elif path.name == "package.json":
            try:
                package = json.loads(source)
                deps = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
                tech.append({"path": rel, "kind": "Node", "dependencies": {k: v for k, v in deps.items() if k in {"vue", "vite", "nuxt", "vue-router", "pinia", "axios", "element-plus", "ant-design-vue", "typescript"}},
                             "scripts": {k: redact(str(v))[:200] for k, v in package.get("scripts", {}).items() if k in {"dev", "start", "serve", "build"}}})
            except (ValueError, TypeError):
                tech.append({"path": rel, "kind": "Node", "note": "package.json 无法解析"})
        elif path.suffix == ".java":
            if re.search(r"@(?:Entity|Table|TableName)\b", source) or re.search(r"(?:entity|domain|dto)/", rel, re.I):
                names = re.findall(r"\b(?:class|record|enum)\s+(\w+)", source)
                fields = re.findall(r"\b(?:private|protected)\s+(?:final\s+)?([\w<>?,. ]+)\s+(\w+)\s*[;=]", source)
                entities.append({"path": rel, "classes": names[:3], "fields": [{"type": t.strip(), "name": n} for t, n in fields[:14]]})
            mapping = re.findall(r"@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*(?:\(([^\n]*)\))?", source)
            if mapping:
                apis.append({"path": rel, "mappings": [redact(a + "(" + b + ")")[:180] for a, b in mapping[:16]]})
        elif path.suffix == ".vue":
            ids = re.findall(r"(?<![\w:-])id\s*=\s*[\"']([^\"']+)[\"']", source)
            if ids:
                ui_ids.append({"path": rel, "ids": ids[:20]})
        elif path.suffix == ".md" and len(doc_hints) < 12:
            headings = re.findall(r"^#{1,3}\s+(.+)$", source, re.M)
            if headings:
                doc_hints.append({"path": rel, "headings": [redact(x)[:100] for x in headings[:6]]})
    evidence = {"project_name": root.name, "file_count": len(paths), "truncated": truncated,
                "stack": tech[:30], "entities": entities[:35], "api_candidates": apis[:30], "ui_ids": ui_ids[:25], "documents": doc_hints,
                "limits": "有界静态线索；未证明业务约束、实体关系、接口组合路径或服务可运行。需 agent 回读源码补充结论。"}
    _json(out / "evidence.json", evidence)
    _write(out / "index.md", "# 项目现状索引\n\n" + f"项目：{root.name}；扫描 {len(paths)} 个候选文件" + ("（达到上限，结果截断）" if truncated else "") + "。\n\n" +
           "本目录是精简的源码线索，尚不代表业务分析已完成。agent 应回读证据并填充事实、约束和待确认项。\n\n" +
           "- [业务知识与约束](business.md)\n- [核心实体](entities.md)\n- [技术栈与启动](stack.md)\n- [输入与影响范围](changes.md)\n- [结构化线索](evidence.json)\n")
    doc_lines = [f"- `{item['path']}`：" + "；".join(item["headings"]) for item in doc_hints]
    api_lines = [f"- `{item['path']}`：" + "；".join(item["mappings"]) for item in apis[:20]]
    _write(out / "business.md", "# 业务知识与约束\n\n待 agent 依据需求、文档、服务层和鉴权代码补充：业务角色、主流程、状态转换、边界条件、权限、幂等、事务与数据约束。每条结论附源码路径；未知项写待确认。\n\n## 文档证据入口\n\n" + "\n".join(doc_lines or ["未发现文档标题线索。请读取项目业务文档。 "]) + "\n\n## 接口注解线索\n\n不是完整路由；需合并类前缀、context-path、网关代理并回读实现。\n\n" + "\n".join(api_lines or ["未发现映射注解线索。"]) + "\n")
    lines = []
    for item in entities[:35]:
        fields = ", ".join(f"{f['name']}: {f['type']}" for f in item["fields"])
        lines.append(f"- `{item['path']}`：{', '.join(item['classes'])}；{fields}")
    _write(out / "entities.md", "# 核心实体线索\n\n仅列候选类和少量字段；agent 应按被测功能精简，并补充主键、关系、枚举/状态、唯一性、逻辑删除、租户与表映射。此扫描未解析继承、Lombok 或 ORM 关系。\n\n" + "\n".join(lines or ["未识别到实体候选；请依据 mapper/schema/migration 补充。"]) + "\n")
    _write(out / "stack.md", "# 技术栈与启动线索\n\n" + "\n".join(f"- `{t['path']}`：" + json.dumps({k:v for k,v in t.items() if k != "path"}, ensure_ascii=False) for t in tech[:30]) +
           "\n\n## 运行前补充\n\nagent 回读项目文档，确认 Java/Node 版本、profile、启动目录/命令、前端 host/port 与代理、后端健康检查、鉴权方案、数据库驱动及连接环境变量。不要复制配置密码。\n\n## 已有前端 ID\n\n" + "\n".join(f"- `{x['path']}`：" + ", ".join(x["ids"]) for x in ui_ids[:25]) + "\n")
    changes = "# 输入与影响范围\n\n"
    if requirements:
        req = Path(requirements).resolve()
        text = req.read_text(encoding="utf-8-sig", errors="replace")
        changes += "## 用户需求\n\n" + redact(text[:16000]) + ("\n（需求内容已截断）" if len(text) > 16000 else "") + "\n\n"
    if staged:
        names = _git(root, "diff", "--cached", "--name-status", "--no-renames")
        diff = _git(root, "diff", "--cached", "--no-ext-diff", "--no-renames", "--unified=2", "--", ".", ":(exclude)*.lock", ":(exclude)*lock.json")
        changes += "## Git 暂存区\n\n```text\n" + redact(names[:8000]) + "```\n\n```diff\n" + redact(diff[:24000]) + "\n```\n\n"
        if len(diff) > 24000:
            changes += "diff 已截断，请按变更文件回读暂存内容。\n\n"
    changes += "## agent 需要完成的映射\n\n把需求/变更逐项映射为业务影响、接口/页面、数据库、正向/反向/边界用例 ID、前置数据、断言与清理。明确未覆盖项和待确认信息；不得把脚本扫描当作需求覆盖证明。\n"
    _write(out / "changes.md", changes)
    return {"output": str(out), "files": len(paths), "truncated": truncated, "status": "evidence_collected"}


def _new_output(output):
    out = Path(output).resolve()
    if out.exists() and any(out.iterdir()):
        raise ValueError("Output directory must be empty to avoid overwriting existing cases")
    out.mkdir(parents=True, exist_ok=True)
    return out


def init_suite(output):
    out = _new_output(output)
    assets = SKILL_DIR / "assets" / "example-suite"
    if not assets.is_dir():
        raise ValueError("Example assets are not included in this execution-only bundle; use the source skill to initialize")
    shutil.copytree(assets, out, dirs_exist_ok=True)
    return out / "suite.json"


def _check_secrets(value, trail="suite"):
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "capture":
                # These values are JSONPath declarations, not credentials.
                continue
            if key.lower() in {"password", "passwd", "secret", "token", "authorization", "api_key", "access_token", "refresh_token"} and isinstance(child, str) and child and not re.search(r"\$\{[\w.]+\}", child):
                raise ValueError(f"Refusing to export a literal credential at {trail}.{key}; use a runtime variable")
            _check_secrets(child, trail + "." + key)
    elif isinstance(value, list):
        for child in value:
            _check_secrets(child, trail)
    elif isinstance(value, str) and (re.search(r"\w+://[^\s/@]+:[^\s/@]+@", value) or "PRIVATE KEY-----" in value):
        raise ValueError("Refusing to export an embedded credential in " + trail)


def export_suite(suite, output):
    source = Path(suite).resolve()
    from runtime import load_suite
    data = load_suite(source)
    _check_secrets(data)
    # Validate file references before creating the delivery directory.
    copies = []
    def collect(value):
        if isinstance(value, dict):
            if value.get("type") == "sql" and value.get("file"):
                rel = Path(value["file"])
                candidate = (source.parent / rel).resolve()
                if rel.is_absolute() or not candidate.is_relative_to(source.parent) or candidate.suffix.lower() != ".sql" or not candidate.is_file():
                    raise ValueError("SQL file must exist inside the suite directory and use .sql extension")
                target = f"sql/{len(copies) + 1:02d}-{candidate.name}"
                copies.append((candidate, target))
                value["file"] = target
            for child in value.values():
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)
    collect(data)
    # Startup commands refer to the original application checkout. Retain an
    # explicit absolute cwd so same-machine exports do not silently start elsewhere.
    services = data.get("services", {})
    for service in services.values() if isinstance(services, dict) else []:
        if isinstance(service, dict):
            cwd = Path(service.get("cwd", "."))
            if not cwd.is_absolute():
                service["cwd"] = str((source.parent / cwd).resolve())
    out = _new_output(output)
    for name in ("webtest.py", "runtime.py", "browser.py", "browser_mcp.py", "mcp_client.py", "browser_dom.js", "pandascript.py", "project.py"):
        shutil.copy2(Path(__file__).parent / name, out / name)
    for candidate, target in copies:
        dest = out / target
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(candidate, dest)
    _json(out / "suite.json", data)
    _write(out / "run.py", '"""Run this exported functional suite with no agent or source skill needed."""\nfrom pathlib import Path\nimport sys\nfrom webtest import main\n\nif __name__ == "__main__":\n    raise SystemExit(main(["run", "--suite", str(Path(__file__).with_name("suite.json")), *sys.argv[1:]]))\n')
    requirements = Path(__file__).parent / "requirements.txt"
    if requirements.exists():
        shutil.copy2(requirements, out / "requirements.txt")
    _write(out / "RUN.md", """# 功能用例执行包

Python 3.10+。默认 HTTP＋SQLite＋Lightpanda 原生 MCP 客户端仅用标准库，无需 Playwright、Node、模型或 API key。浏览器需独立 Lightpanda 服务；其它数据库按需安装驱动。

```text
python webtest.py validate --suite suite.json
python run.py --frontend-url http://HOST:5173 --mcp-url http://127.0.0.1:8000/mcp
```

推荐环境变量 WEBTEST_TOKEN；后端默认由前端 /api 代理，独立后端用 --api-url。数据库 URL 用 suite.databases 的 url_env 指定的环境变量。先审阅 suite：setup 预处理、cases 执行、teardown 定向清理；sql/ 为引用文件。默认报告在本包 .webtest/runs，失败返回非零。

## 默认原生 MCP

在 Linux/macOS/WSL2 或已有 Lightpanda 主机启动：

```text
lightpanda version
lightpanda mcp --host 127.0.0.1 --port 8000 --load-resources stylesheet
```

Docker Linux 容器可另起服务，需覆盖镜像默认 CDP 命令：

```text
docker run -d --name lightpanda-mcp -p 127.0.0.1:8000:8000 lightpanda/browser:latest /bin/lightpanda mcp --host 0.0.0.0 --port 8000 --load-resources stylesheet
```

核对 mcp --help、独立会话和工具能力，固定已验证版本/镜像摘要。browser.backend 默认 lightpanda，mcp_url 默认 http://127.0.0.1:8000/mcp。mcp_token_env 可指定服务 bearer token 的环境变量名，与业务 token 分开。CDP 的 ws://HOST:9222 不能当 MCP；两种服务需分进程、分端口，不共享会话。

frontend-url 必须同时可被 Python 与 Lightpanda 访问。容器的 127.0.0.1 指容器自身，推荐共用宿主局域网 IP；Vite 需允许访问。host.docker.internal 通常仅容器能解析。Windows 无官方原生二进制，可用已有 Linux 主机、WSL2 或 Docker Linux 容器。

原生后端不注入浏览器请求头，使用应用自身登录或 token storage。browser.storage 在首个 goto 先访问前端同源 /，写入后再导航目标页，同会话只写一次；根页需可访问且不能重定向其它 origin。HTTP 步骤仍按 auth 注入业务头，HTTP 登录 cookie 不自动转移给浏览器。

## 可选 Playwright＋CDP

```text
python -m pip install "playwright>=1.55,<2"
python run.py --frontend-url http://HOST:5173 --browser-backend playwright --cdp-url ws://HOST:9222
```

需另行启动 Lightpanda CDP。suite 可持久配置 browser.backend=playwright 与 cdp_url；旧配置只有 cdp_url 时补 backend。无需 playwright install chromium。保留前导航 storage init script 和前端同源 auth 头注入。失败不自动切换后端；原生键盘等行为与 DOM 事件后端可能不同，切换需回归目标控件。

## 动作与独立长流程

支持 goto、click、fill、select、check、press、scroll、snapshot、wait_for、assert_text、assert_value、assert_visible、assert_checked、assert_url。唯一 #ID 定位，多 browser 步骤共用页面。timeout_ms 默认 10000，step_timeout_ms 默认 60000；poll_interval_ms 默认 100 仅用于 Playwright，原生使用服务端等待。

只重试就绪检查/读取；已发出点击或输入后的超时/断连不重放，先查 HTTP/数据库结果。MCP 传输失败后拒绝继续使用该会话。失败报告含动作序号、last_state 和限量结构快照，省略输入值、正文及工具回显。按业务阶段拆步骤，以业务断言收尾。

原生 press 使用 Lightpanda 工具，Enter 可能触发表单默认行为；Playwright 后端只派发 DOM keydown/keyup。scroll.x/y 为增量，原生适配层换算绝对偏移并核对移动。DOM 可见/滚动不证明视觉、虚拟列表或无限滚动正确。iframe、Shadow DOM、文件上传、拖拽和原生弹窗需额外适配。

超长连续纯前端流程可另写 PandaScript，在有 Lightpanda 二进制的主机执行：

```text
python webtest.py pandascript --script frontend-batch.js --executable lightpanda --timeout 120 --output reports/frontend-batch.json
```

脚本需自行提供，不从 suite 自动转换。使用 new Page()，只有 goto 需要 await，其它方法同步；无 Node/DOM 全局，页面检查用 page.evaluate/waitForScript。凭据用进程环境 LP_*，动作参数写 $LP_* 占位符。顶层 return 带 status: pass 或 fail 的 JSON 对象，stdout 不加日志，调试用 console.error。包装器检查退出码及明确状态，生成独立脱敏报告；超时停止直接子进程、不重放，不保证 wrapper 的远端进程树停止。每次是新会话，不接续 suite 的页面、cookie、storage 或变量。

## 数据库与服务

SQLite 无额外依赖；MySQL/PostgreSQL 按需选择一组：

```text
python -m pip install "sqlalchemy>=2,<3" pymysql
python -m pip install "sqlalchemy>=2,<3" "psycopg[binary]>=3,<4"
```

数据库密码需 URL 编码，不写入包。默认连接已运行前后端；--start-services 启动 suite.services 的服务，其 cwd 固定为导出时源码目录，跨机器需调整。默认保留服务；--stop-services 或 services stop 只停止本工具管理的进程。运行前复查请求体/SQL 业务数据范围。
""")
    return out
