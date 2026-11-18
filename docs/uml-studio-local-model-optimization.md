# UML Studio 内网本地模型提效实施记录

> 状态：已完成实现与验证（2026-11-19）

## 一、实现内容

1. **极速 CLI 入口与容错规范化（`.agents/skills/uml-studio/scripts/diagram.mjs`）**：
   - 新增 `--json '<JSON>'` 与 `-`（stdin）直接输入，免去写入临时 JSON 文件的额外轮次。
   - 新增 `--tolerant`（且在 `--json`/`-`/`--patch`/`--set` 时自动开启）容错规范化 `normalizeInputTolerant()`：自动补齐 `version: 1`、缺省 `title`、缺失或数字类型节点/分组/泳道/参与者/鱼骨分类 `id`、将连线/时序消息中按节点 `label` 写的 `from`/`to` 自动映射为对应 `id`、将鱼骨图字符串数组原因自动转换为 `{label}` 对象。
   - 新增 `--patch <JSON/文件>`、`--set <path=value>`（支持直接读取并增量修改 `.json` 或已保存 `.html` 的 `#diagram-data` 并重导出）与 `--save-json <path>`。
   - 新增 `--presets`（1.2 KB 速查 JSON：18 类图、12 套主题、4 类数据结构模板）与 `--example <type>`（按需返回最小示例）。
2. **精简 `SKILL.md` 入口（`.agents/skills/uml-studio/SKILL.md`）**：
   - 置顶 1 步 `--json` 出图与 `--set` 修改已保存 HTML 的常用命令，内嵌 4 类数据家族最小结构，常规任务不再要求先读取 `schemas/diagram.schema.json`（894 行）与 `document.schema.json`（919 行）。

## 二、验证结果

- `node scripts/diagram.mjs --presets` 与 `--example fishbone` 正常返回。
- `node scripts/diagram.mjs --json ... --out ... --image ...`（省略 `version`、节点 `id`，直接用中文 `label` 连线）一步输出 HTML + PNG 成功。
- 对已保存 `flow.html` 执行 `--set theme=industrial --set title="工业风格评审" --out ... --image ...` 成功更新并导出新图。
- 鱼骨图简写（`causes` 传字符串数组）导出 SVG 成功。
- `node --test tests/validation.test.mjs tests/native.test.mjs`：12/12 全部通过，原有严格校验契约保持不变。
