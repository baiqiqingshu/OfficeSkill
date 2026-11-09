---
name: intranet-ppt
description: 原 intranet-ppt 的兼容入口。技能已更名为 native-ppt，用于离线生成原生可编辑 PowerPoint；新任务优先使用 native-ppt。
---

# 已更名为 native-ppt

完整技能、元素库和示例已迁移到 [native-ppt](../native-ppt/SKILL.md)。先阅读该文件，按新技能执行；任何 PPTX 输出都必须检查布局。

已有 `python SKILL_DIR/scripts/ppt_tool.py ...` 命令继续有效，兼容入口将请求转发到同级 `native-ppt`。`SKILL_DIR` 在旧命令中仍为本目录；新示例、库和参考文件位于 `../native-ppt/`。
