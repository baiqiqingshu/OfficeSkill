# UCD Studio 验证结果

2026-10-28，版本 1.1.0。使用本机 Python 3.12.10、Node 26.4.0、Playwright 1.64.1 和 Chromium 156.0.8078.4；没有安装依赖或新增测试代码。

| 检查 | 结果 |
|---|---|
| 既有检查 | 16 项 unittest 和 skill-creator quick_validate.py 通过 |
| 浏览器 | 六布局 × 三模式，加导航页与九个交付示例，共 28 页；1440、1024、375px 三种宽度的 84 个组合无页面整体横向溢出 |
| 运行 | 监听到的外部请求和 pageerror 均为 0 |
| 主题 | 八主题 88 组 computed 文字/底色均 ≥4.5:1，最低 4.715:1；规范内 64 项对比度比值与独立计算一致 |
| 规范 | 12 个临时配置验证 token 覆盖、默认 comfortable/内置 compact、有效深色、区块条件化、form full/select 和低对比提示 |
| 人工视觉 | 逐一查看导航及六布局桌面/375px、加载/空/错误/无匹配、表单校验/反馈/弹窗和午夜主题截图 |

主任务、弹窗与回焦、表格查询/排序/分页、状态恢复、原生表单校验、键盘页签和看板移动均已操作。空/错误恢复与清除筛选按钮恢复本地记录，加载骨架配合 aria-busy。实测正文/页面标题/区块标题为 14/24/15px，窄屏标题为 22px、主控件最小高度为 44px。

首次浏览器检查发现 dialog 异步 close 回调抢走页签焦点，移除无条件延迟回焦后，原有测试全部通过。主代理执行的一次 impeccable 静态扫描有一条未展开 `$css` 导致的字号层级误报，浏览器 computed size 已确认实际层级正确。

九个示例及导航按 1.1.0 在新目录重生成后逐文件复制，旧 preview.png 已换为实际导航截图。普通旧用户输出保留版本保护，需在新目录迁移；没有放宽固定运行库或手工修改保护。

现有浏览器证据位于本次工作区的 `.agents/skills/temp/ucd-browser-FXrkra/`；六布局完整窄屏和状态、主题与计算记录位于 `C:/Users/Administrator/AppData/Local/Temp/ucd-visual-final-e34fde6fafdd4151a19ce2d8a399027a/`。这些是本机临时证据，公开预览见 [更新后的导航截图](../../.agents/skills/ucd-studio/demo/preview.png)。

本次限于 Chromium 与所列操作，未进行完整辅助技术评估或特定内网模型成功率/速度评测。原型无真实后端或持久化。复现命令与详细边界见 [技能验证记录](../../.agents/skills/ucd-studio/references/validation.md)。
