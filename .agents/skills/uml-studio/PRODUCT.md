# PRODUCT.md — UML Studio

## What it is
UML Studio 是一个**离线优先的语义化 UML/架构绘图工作台**。输入结构化 JSON，输出可离线编辑的单文件 HTML 与 SVG/PNG/JPEG/WebP 图片。模型负责语义与结构，组件负责布局、图元、样式及导出；不生成坐标或 draw.io XML。

- 形态：Vue 3 + Vite 打包为 `assets/viewer.js/css`，内联进生成的 HTML；Node CLI（`scripts/diagram.mjs`）可脱离浏览器出图。
- 用户：编写方案/文档的中文工程师与架构师，在内网或离线环境使用。
- 场景：明亮办公环境下的桌面浏览器为主；生成物常嵌进文档或随邮件分发，必须在断网、无远程字体下可用。
- 品牌承诺：名称 UML Studio；标语「把复杂，画清楚。」；`lang="zh-CN"`；数据不出浏览器（本地工作台）。
- 技术约束：全部资源内联，无 CDN/远程字体；字体仅本机栈；`color-scheme: light`；图表主题（ocean 等 11 套）是数据特性，独立演进。

## What it is not
不是 draw.io 替代品：不做自由拖拽画布、不做模型执行/代码逆向、不做任意 SVG/HTML 注入。

## Surface
- 工作台单页：顶部导航 + 图表侧栏 + 预览画布 + 样式面板 + 表单/JSON 编辑器 + 导出工具条。
- 模式：Operate（任务型工具界面）。
