# UML Studio 文件精简

## 实施状态

初始并发任务已在提交 6d231ea 完成，其后本轮界面与鱼头子代理均已结束交接。实施前重新核对工作区差异和相关文件修改时间，未发现使用 UML Studio 的 Vite / Node 开发进程。现已完成源码及构建流程的精简，并通过独立构建、功能与视觉验收。

2026-10-28 基线：技能目录实际 130 个文件，Git 跟踪 120 个；多出的 10 个为技能内 node_modules/.vite 开发缓存。dist 共 27 个文件，其中 22 个为分散生成的声明；示例数据 40 个文件。独立测试代理完成完整构建、离线浏览器验收和实际 Vite 开发启动后，包含隐藏文件在内实测为 99 个；三份公开声明已生成，没有旧声明、暂存文件或技能内开发缓存。

## 合并范围

| 调整 | 文件变化 | 影响 |
|---|---:|---|
| 22 份声明归并为 core/index/native 三份公开入口声明 | -19 | 保留公开 API 的准确类型 |
| canvas/editor/studio 三份 CSS 归入 Vue 组件 | -3 | 保留规则、顺序和全局作用域 |
| Vite 缓存移到仓库 temp | -10 个本机缓存 | 只改变缓存位置 |
| 新增 declarations.mjs | +1 | 独立维护复杂 AST 逻辑，不增加依赖 |
| 合计 | 130 → 99 | 整理后交付 99 个文件 |

40 份示例文件及内容、CLI 输入路径、图型、主题、布局、节点与鱼头几何、离线运行时及图片导出能力全部保留。没有将示例合并成新格式或减少场景。

## 类型声明生成

build.mjs 继续使用现有 vue-tsc 生成精确声明，临时逐文件声明输出到仓库 temp/uml-studio-types/build-*/。declarations.mjs 利用项目已有 TypeScript 编译器 API 归并为：

- dist/core.d.ts：公共模型、主题、布局、Schema、验证、渲染及文档 API。
- dist/index.d.ts：core API、HTML/浏览器导出和 DiagramCanvas，其 props、事件与 expose 类型沿用 vue-tsc 产物。
- dist/native.d.ts：从 core 引用模型，声明原生文件解析和图片导出 API。

归并器通过 TypeChecker 读取入口公开导出符号。每个内部模块放在唯一 ambient namespace 中，内部依赖使用 import-equals 重建；不同模块的私有同名符号自然隔离。外部模块 import 使用唯一别名。公共导出按原符号重建，避免意外公开 readStudioRuntime 等内部函数；Vue 默认组件重建为 DiagramCanvas 命名导出，Vue 私有辅助符号留在自身 namespace。Vue/Node 引用 core 模型而不复制，Node 显式导入 node:buffer 的 Buffer 类型。不支持的语法或缺失符号明确报错，没有手写近似签名、泛化 API 为 any 或用正则删除声明。

package.json 的 types 及三个 exports.types 已更新，三个公开包入口不变。原 dist/types 是构建细节，没有单独公开。三份声明全部生成到内存后再暂存并逐文件原子替换；生成阶段出错不覆盖旧入口，finally 清理已知暂存文件，避免失败残留撑大技能目录。这不宣称三个文件构成跨文件事务。

## 样式归并与原件保留

canvas.css 原样内联到 DiagramCanvas.vue 的全局 style，公共 DiagramCanvas 组件继续携带原画布样式。editor.css 和 studio.css 合并到 Studio.vue 的全局 style，编辑器规则在工作台规则之前；移除原导入及仅适用于独立 CSS 文件的字符集声明。保留全部选择器、媒体查询、减少动态效果规则与覆盖优先级，不增加 scoped，不改变任何设计决策。

旧声明、三份原 CSS 和 Vite 缓存在核验绝对源/目标路径后，使用原生 PowerShell Move-Item -LiteralPath 可逆移动至仓库 temp/uml-studio-consolidation-originals/。没有删除原件。完整构建不会再将逐文件声明写回技能目录。

## 开发缓存

vite.config.ts 以及 build.mjs 两次 configFile:false 的 Vite 构建均显式使用仓库 temp/uml-studio-vite/。技能独立安装且没有此仓库时，声明与 Vite 缓存使用系统临时目录下按技能路径区分的目录，避免多个安装实例冲突。外置临时目录不是长期备份，原件需要长期保留时应另行归档。

## 鱼头样式许可

LICENSE 已包含 Fishbone Studio 来源及完整 MIT 附录。原 collectLicenses 仅收集 npm dependencies，完整构建会覆盖 THIRD_PARTY_NOTICES.txt 并遗漏源码派生归属。

现构建从 LICENSE 读取并合入此附录，移除“所有依赖未修改”的笼统描述。归属与完整许可随原流程进入 THIRD_PARTY_NOTICES.txt、viewer、core/export/vue/native 产物及离线 HTML。没有新增单独许可文件，也不只修改生成产物。

## 验证交接

本次未新增项目测试代码。独立测试代理已完成以下核验：

1. 完整 npm run build 与 typecheck；在 temp 中编译三个公开入口的消费样例，检查 DiagramCanvas props、事件和 expose 类型，不能用 skipLibCheck 掩盖声明问题。
2. 使用既有原生导出及编辑器浏览器验证，检查桌面与窄屏、编辑/样式切换、缩放、九种鱼头及图片导出。
3. 核对 40 份示例及文件路径，校验单 HTML 内完整鱼头 MIT 附录。
4. 统计完整构建和开发启动后的实际文件数量，确认无技能内缓存、旧逐文件声明或暂存文件。

完整构建、typecheck、98 个现有 Node 测试和适配初始编辑状态后的现有浏览器交互断言均通过。三入口声明在 Bundler 与 NodeNext 模式下使用 `skipLibCheck:false` 消费通过；NodeNext 查出的相对路径扩展问题已修复并复核。九种鱼头分别完成短中文、长中文和中英文混排的 SVG/PNG 导出，桌面 1440px、窄屏 390px 和 320px 无页面横向溢出；40 份示例与完整 MIT 附录均保留。详见 [独立验证记录](validation.md)。

用户追加恢复默认鱼头与新增纯白主题后再次完整构建及专项核验通过：默认 / 显式 `classic` 与原提交 `6d231ea` 的 SVG 逐字一致（仅统一 figure ID），纯白主题支持全部 18 类图、CLI 与浏览器 PNG 均为不透明纯白背景，保存再打开保留主题与原默认鱼头。增量后的最终盘点仍为 99 个文件。
