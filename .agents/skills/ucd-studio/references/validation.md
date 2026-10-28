# 验证记录

验证日期：2026-10-28，生成器版本：1.1.0。环境为 Windows、Python 3.12.10、Node 26.4.0、宿主已有 Playwright 1.64.1 / Chromium 156.0.8078.4。未联网、安装依赖或新增测试代码；补充检查脚本仅放在系统临时目录。

## 本次结果

| 范围 | 结果 |
|---|---|
| 技能结构 | 既有 quick_validate.py 通过；Windows 使用 `python -X utf8` 读取中文文档 |
| Python 行为 | 现有 16 项 unittest 全部通过 |
| 布局与模式 | 6 类布局 × single/library/editable，共 18 个生成组合通过现有浏览器测试 |
| 交付示例 | 导航页及 9 个完整示例均按 1.1.0 重新生成，preview.png 更新为实际导航页截图 |
| 响应式 | 上述 28 页均检查 1440×1080、1024×768、375×812，共 84 个页面/视口组合，无页面整体横向溢出；宽表格仅在自身容器滚动 |
| 网络与运行异常 | 受测页面和操作的 request 监听未观察到外部请求，pageerror 为 0 |
| 8 主题对比度 | 独立读取浏览器 computed style 的 88 组正文、辅助字、placeholder、主按钮及 5 类 badge 文字/底色，全部达到 4.5:1；最低为 jade 中性 badge 的 4.715:1 |
| 规范计算 | 8 主题共 64 项规范比值与浏览器实际组合的独立计算一致，差异仅为两位小数舍入 |
| 配置与规范 | 12 个临时配置覆盖主题、覆盖 token、缺省 comfortable、compact、有效深色、缺失区块、form full 及低对比提示，均通过 |
| 视觉复查 | 逐一查看导航页及六类布局桌面/375px 截图，以及加载骨架、空、错误、无匹配、表单校验/反馈、窄屏弹窗和午夜主题 |

浏览器操作覆盖弹窗打开、Esc 关闭、焦点恢复、草稿反馈，表格搜索/筛选/排序/分页，状态恢复与清除筛选，原生表单校验，方向键页签和看板任务移动。新增恢复按钮确实恢复 5 条首屏记录并把焦点返回搜索框，加载时 aria-busy 为 true。

规范条件化已核实：内置示例 compact 表格为 10px 16px；省略 density 时为 comfortable、12px 20px，面板头分别为 12px 16px 与 16px 20px。页面覆盖后的主色与圆角在 CSS 和规范中一致；以有效 bg 判断深浅色；没有 table/tabs 等区块时不声明相应已实现交互。form 的 full 区块在三种视口均跨全部列，select 的配置值实际选中。故意设置 1:1 主操作配色时，规范明确提示“需调整颜色”。

## 发现与修复

- 首轮浏览器检查复现了 dialog 异步 close 回调抢走后续页签焦点的问题。移除无条件延迟回焦，保留原生 dialog 的关闭回焦和提交时的同步回焦；原有浏览器测试随后全部通过。
- 主代理仅执行一次 impeccable 静态检查；未展开的 shell 模板令 `$css` 中的字号未被识别，产生一条 flat-type-hierarchy 警告。浏览器实测 body/h1/h2 为 14/24/15px，窄屏 h1 为 22px，属于静态模板误报。

运行时和模板已升级至 1.1.0。交付 demo 在全新目录生成后逐文件复制，保留额外文件与历史；未修改普通输出的版本保护。旧版本用户输出仍须在新目录生成并人工迁移，editable 的自定义 JS 需单独保留合并。

## 复现

从仓库根目录执行：

```text
python -X utf8 -m unittest discover -s .agents/skills/ucd-studio/tests -v
python -X utf8 C:/Users/Administrator/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/ucd-studio
node .agents/skills/ucd-studio/tests/browser.mjs
python -X utf8 .agents/skills/ucd-studio/scripts/ucd.py check --dir .agents/skills/ucd-studio/demo/admin
```

浏览器脚本使用宿主已有 Playwright/Chromium，不自动下载或安装；其现有 66 次视口检查之外，本次临时补充 18 个生成组合的中屏检查。运行会返回本机临时截图目录；补充脚本不随技能分发。

## 第二轮视觉精修补记

在 1.1.0 基础上做第二轮视觉精修后，上述历史数值部分已更新：h1 现为 20px/650（窄屏不变）、表头 12px/600 + `--surface-2`、KPI 值 30px/650；comfortable 面板头/内容/单元格/工具条/页脚统一为 16px 24px / 24px / 12px 24px，compact 对应项统一对齐 16px 边距；面包屑分隔符改为 inline SVG（`.crumb-sep`）。回归结果：16 项 unittest 通过；官方浏览器矩阵 28 页 / 66 次视口检查通过、外部请求 0、pageerror 0；demo 重新生成且静态检查无外联资源。

## 边界

本次仅覆盖 Chromium 和所列页面/操作，不代表所有浏览器、任意新 JS 或完整可访问性认证。普通文字对比度记录不包括悬停、禁用、透明叠加与自定义样式；实际内容仍需检查缩放、焦点顺序及辅助技术体验。

未对特定内网模型进行端到端成功率或速度评测。按需检索、小份配置与确定性本地生成减少规定步骤，但不能保证任意模型理解复杂源码。原型只使用本地示例数据，不提供真实审批、权限、上传、后端提交或持久化；静态检查不替代浏览器检查和宿主网络隔离。
