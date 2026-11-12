# pptx-builder IPD 串讲示例简化实施文档

## 目标

简化 `examples/ipd-walkthrough.json`（IPD SR/AR 需求串讲示例），适配「一个 SR 下辖约十个 AR」的实际场景：

1. 开头的需求列表由两页（SR 列表 + AR 列表）合并简化为一页：表格仅四列——类型、编号、标题、工作量；类型只有 SR / AR 两级，不出现 IR。
2. SR 小节页（标题页）不再逐条排 `agenda-item`（AR 多达十个时放不下），只保留章节过渡信息，AR 明细统一由开头需求列表索引。

## 现状（30 页）

| 页 | id | 内容 |
| --- | --- | --- |
| 1 | cover | 封面 |
| 2 | sr-list | SR 列表：title + lead + table（SR/名称/AR数/优先级/负责人）+ layer×2 + footnote |
| 3 | ar-list | AR 列表：title + lead + table（SR/AR/名称/优先级/场景页数）+ callout + footnote |
| 4 | sr01-title | eyebrow + section-break + agenda-item×2 + footnote |
| 5–16 | ar01-*, ar02-* | SR-01 下 2 个 AR，各 6 页场景 |
| 17 | sr02-title | 同 sr01-title |
| 18–29 | ar03-*, ar04-* | SR-02 下 2 个 AR，各 6 页场景 |
| 30 | closing | 串讲回顾 |

## 改法（29 页）

### 1. 需求列表页 `req-list`（合并原 sr-list + ar-list）

- `builtin/title`：「需求列表」（y=24, h=52）。
- `builtin/lead`：一句话概括 SR/AR 规模（y=96, h=80）。
- `builtin/table`：表头 `类型 | 编号 | 标题 | 工作量`；SR 与其 AR 相邻排列、SR 行在前，如：
  - `SR | SR-01 | 统一认证与单点登录 | 45 人日`
  - `AR | AR-01 | 员工登录与全局会话 | 25 人日`
  - `AR | AR-02 | 多因素认证与风险登录 | 20 人日`
  - `SR | SR-02 | 账号治理与审计 | 45 人日`
  - `AR | AR-03 | 账号全生命周期管理 | 30 人日`
  - `AR | AR-04 | 登录审计与合规报表 | 15 人日`
- `builtin/footnote`：说明 SR 行为下辖 AR 工作量合计、仅列 SR/AR 两级。
- 删除原 layer×2、callout「串讲顺序」等元素。

### 2. SR 小节页 `sr01-title` / `sr02-title`

- 保留 `eyebrow`（`SR-0x · 名称`）与 `section-break`（number/title/desc）。
- 删除全部 `agenda-item`；`desc` 改为说明 AR 数量与编号范围，如「下辖 2 个 AR：AR-01 ~ AR-02」。
- 保留 `footnote`。
- 该结构不随 AR 数量变化，十个 AR 也无需加元素。

### 3. 其他

- 顶层 `pageCount` 30 → 29。
- 封面 subtitle 不变（不含 IR）；closing 文案不变。
- AR 场景页（背景→主成功→异常→后置→前置→分支）不动。

### 4. 同步项

- `SKILL.md`：`ipd-walkthrough.json` 说明由「30 页」改为「29 页」，描述改为「封面、SR/AR 需求列表，每个 SR 先放标题页……」。
- `docs/intranet-ppt-ipd-walkthrough.md`：页面骨架表、示例生成、实施结果同步为新结构。
- 重新生成 `assets/demo/library-demo.html`：`python .agents/skills/pptx-builder/scripts/ppt_tool.py demo --out <输出目录>`（注意 demo 输出目录与 `assets/demo` 的关系，按工具实际行为落到原位）。

## 验证

- `ppt_tool.py validate examples/ipd-walkthrough.json` 通过。
- `ppt_tool.py render` 生成 29 页，`layoutIssueCount` 为 0（--strict-layout）。
- `library-demo.html` 重新生成且页数随之更新。
