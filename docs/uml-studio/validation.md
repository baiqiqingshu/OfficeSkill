# 独立验证记录

日期：2026-10-28。验证由独立测试代理执行，不新增项目测试代码。

## UCD 文件精简

16 个现有 Python 单元测试、九个自带示例静态检查全部通过。历史 ZIP 的 146 个条目 CRC、SHA-256 及与保留原件逐文件字节比较通过；自带示例与普通输出历史路径分支均正确。检查后技能实际仍有 81 个文件，无新增字节码缓存。详见 [UCD 文件精简](../ucd-studio/file-consolidation.md)。

## UML 构建与类型

- `npm run build` 完整通过，已更新离线 HTML、运行时、Schema、Node 渲染器和 Vue 库。
- `npm run typecheck` 通过；三个公开入口分别作为实际消费者导入，在 `Bundler` / `NodeNext` 两种解析模式下使用 `skipLibCheck:false` 编译通过。覆盖模型、原生导出选项、`DiagramCanvas` props / 事件 / expose 方法，并通过负例确认无效鱼头、无效组件 props 和方法参数仍会报错。
- NodeNext 首轮发现归并声明的 `./core` 引用缺扩展，实施代理已改为声明专用 `./core.js` 引用，重新生成三份声明后两种模式均通过。
- `npm test`：98 个现有 Node 测试全部通过，覆盖 26 图场景册、全部类型、复杂布局、连线标注、原生四种格式与数据校验。
- 现有 `editor.browser.mjs` 在临时副本中仅补上“打开编辑器”的新默认操作并调整输出路径，完整交互断言通过。项目内没有新增或修改测试代码。

## 鱼头与离线交互

九种可选鱼头分别使用短中文、长中文和中英文混排的结果文字导出 SVG 与 PNG，共 54 次导出通过；递归原因文字、PNG 尺寸与每种轮廓标记保留。实际查看长文字拼图，文字没有超出轮廓或覆盖眼睛、嘴部。原版鱼头仍为默认，见下方新增要求专项复核。

Playwright 实际打开构建后的离线 HTML，验证初始编辑器和样式折叠、打开编辑器、鱼头选项保持草稿直到应用、无效 JSON 不替换画布、展开样式、导出 PNG Blob、保存 HTML 并重新离线打开。`headStyle` 随保存与重开保留。现有交互断言还覆盖表单检索、展开折叠、预览定位与平移手势。

1440px 桌面及 390px / 320px 窄屏均检查实际渲染；窄屏的默认、编辑与样式状态没有页面横向溢出，图表列表抽屉可打开关闭。没有实际向系统图片剪贴板写入，因此不宣称复制 PNG 已完成环境权限验收。

截图与导出审阅材料位于仓库临时目录 `temp/uml-delivery-validation/`：`desktop-default.png`、`desktop-editor-styles.png`、`mobile-editor.png`、`mobile-320.png`、`fish-heads-long-text.png`，以及逐样式 SVG/PNG 与往返保存的 HTML。临时材料不纳入提交。

## 文件、许可与设计检查

通过工作区命令实际启动 Vite 并打开开发页面，26 张图完整加载且编辑器可打开，优化缓存位于仓库 `temp/uml-studio-vite/`。完整构建和开发启动后最终递归盘点包含隐藏文件：UCD 为 81 个，UML 为 99 个；40 份 UML JSON 示例路径全部保留，无声明暂存残留。验证过程中一次误传开发启动参数生成的默认缓存及并发任务遗留的 Python 缓存已可逆移动至仓库临时目录，技能目录没有保留这些缓存。

逐文件核对完整 Fishbone Studio MIT 附录已进入第三方声明、五份 JS 产物与离线 HTML。最终对三个现存 Vue 文件运行一次 impeccable 机械检测，结果为 `[]`；源码和本轮文档空白检查通过。生成的第三方 ELK 多行字符串自带行尾空格，未为机械空白检查修改第三方字符串内容。

## 原默认鱼头与纯白主题专项复核

用户追加要求后再次完整 `npm run build`，并执行 `npm run typecheck` 及三个公开声明入口的 NodeNext / `skipLibCheck:false` 消费检查，全部通过。此前 98 个通用测试结果保留，没有无变化重复整套运行。

从提交 `6d231ea` 读取原版 `dist/core.mjs` 作为独立基线，使用海蓝、暖纸、午夜三种主题和短中文、长中文、中英文混排三种结果文字对比。当前未指定 `headStyle` 的默认渲染及显式 `classic` 的渲染，与原版完整 SVG 在仅统一 figure ID 后逐字相同，宽高也完全一致，共九组输入、18 次当前渲染对比通过。新增九种轮廓仍须显式选择，不替换原默认。

纯白主题通过全部 18 类图的渲染检查。CLI 实际执行 `--theme white` 生成鱼骨 PNG 与 HTML，PNG 左上角实测 RGBA 为 `255,255,255,255`；HTML 数据保留 `theme:"white"`。浏览器验证鱼头下拉初始为原版、点击“纯白”主题后预览与文档模型同步、浏览器 PNG 同一像素也为不透明纯白、JSON / HTML 数据往返以及离线 HTML 重开保持纯白与原默认鱼头，全部通过。没有浏览器脚本错误。

实际查看 `temp/uml-delivery-validation/classic-white-desktop.png` 和 `classic-white-mobile.png`，1440px 与 390px 布局、鱼骨原造型和纯白画布正常。专项完成后包含隐藏文件的最终数量仍为 UCD 81、UML 99。
