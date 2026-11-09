# PPTX Builder 更名与清理实施文档

## 范围

将技能统一命名为 `pptx-builder`，主体迁移至 `.agents/skills/pptx-builder`。按用户要求移除 `.agents/skills/native-ppt` 与 `.agents/skills/intranet-ppt`，不保留旧技能或旧命令转发目录。

实施以当前代码为依据；既有 docs 仅在完成后用于文档同步，不作为开发依据。

## 方案与分工

- 主代理：先落地本方案、准备目录迁移、协调接口、审查并提交。
- 代码迁移代理：内部包统一为 `pptx_builder`；更新入口、CLI、Schema、原生形状标记、输出目录标记及相关名称，删除旧技能兼容入口。保留安全覆盖校验，不能放宽对任意目录的覆盖限制。
- 说明与演示代理：更新 SKILL、元素库和演示品牌、同步历史说明的现行链接；重新生成离线演示。文档不再声明旧 CLI 兼容。
- 独立验证代理：校验新入口、示例严格生成、布局报告、元素库演示及旧目录清理；不新增测试代码。

本次仅调整身份与路径，保留黑色正文、原生分点、母版安全区域及强制布局检查等已有能力。临时产物放 `temp/pptx-builder-verification/`，不提交测试代码或临时文件。

## 验收与结果

技能、Python 包及输出产物使用统一名称：技能目录为 `.agents/skills/pptx-builder`，内部包为 `scripts/pptx_builder`。旧技能目录与转发入口已清理，不再支持旧命令路径。输出专用目录使用 `.pptx-builder-output` 标记；覆盖仍须满足本工具产物校验。

SKILL、CLI、Schema、元素库与离线演示已同步名称。原实施文档的现行能力说明合并至本文，7 份 `intranet-ppt-*.md` 作为历史记录保留，顶部链接统一指向本文与 [PPTX Builder SKILL](../.agents/skills/pptx-builder/SKILL.md)，历史正文不作为当前规范。

独立验证全部通过，无未解决失败：

- 新 SKILL 基础校验通过，新 CLI 可从不同工作目录执行 `catalog`、`starter`。
- 7 份示例共 67 页通过严格校验；现代元素 5 页、技术汇报 3 页严格生成，布局问题均为 0。
- `render`、`starter`、`extract` 的输出 PPTX 均有已执行的检查报告，`inspect-master` 可用。
- 原生列表 XML、`pptx-builder:` 形状名称及布局检查识别一致；新输出标记的专用目录允许覆盖，无标记目录被拒绝且原文件保留。
- 离线演示包含 59 个组件、7 份示例、67 页，无跳过；11 份相关文档的 22 个本地 Markdown 链接均可达，无旧技能链接。
- `.agents/skills/native-ppt`、`.agents/skills/intranet-ppt`、旧 Python 包及旧演示标记均已实际移除。

验证记录位于 `temp/pptx-builder-verification/verification-report.md`；不新增持久测试代码，临时验证输出不进入提交。

## 当前能力

### 布局检查

`render`、`starter`、`extract` 均检查保存后的 PPTX，报告通过 `nativeChecks` 按文件名索引。`render` 另外检查编译场景的文字/表格溢出、元素重叠、页面边界与母版保留区；报告包含 `checked`、`status`、`issueCount`、`issues`。`--strict-layout` 在发现问题时退出 2，同时保留诊断产物；不加参数仍执行检查。交付前需修正布局问题。

原生检查区分母版固定内容与新增组件，并将同一组件内部形状归组。固定文字、图片、表格包含新增内容时仍检查遮挡，真正的背景矩形可作为容器。检查采用几何判断及受限场景的排版估算；组合、图表、旋转对象只检查外框，报告记录限制，不能代替 Office 的实际排版。

### 字体与原生列表

默认文字为微软雅黑、黑色 `#000000`，正文和各浅色主题保持黑色；标题、关键词及状态允许显式颜色、粗体等强调。显式选择 `graphite` 时使用浅色对比文字。

列表支持 1–4 级，使用 DrawingML 的 `a:buChar`、`a:buAutoNum` 和段落悬挂缩进，符号不拼入正文。富文本、条目内软换行、HTML 预览、字号适配及高度估算同步支持。不能安全提取的源原生列表保留在母版中并明确报告。

### 母版区域

```text
python .agents/skills/pptx-builder/scripts/ppt_tool.py inspect-master master.pptx
python .agents/skills/pptx-builder/scripts/ppt_tool.py render deck.json --out output/deck --strict-layout
```

配置顶层和逐页支持 `masterRegions`，例如 `{"detect":true,"titleHeight":96,"footerHeight":32}`；逐页覆盖全局，显式高度覆盖读取结果。区域高度以 JSON 页面的像素计，母版尺寸不同会自动换算读取值。源样例页实际存在的标题/页脚占位符参与保留区计算；版式或母版中未实例化的占位符仅作为候选返回。

元素 `region` 支持 `body/title/footer/full`，正文检查 `titleHeight <= y` 且不侵入底部页脚区。内置标题、脚注及封面组件可自动识别；第三方组件可显式声明。`full` 仅跳过保留区检查，仍检查页面边界和内容溢出。

### 元素库与示例

内置库包含 59 个组件，其中包括洞察卡、价值卡、决策卡、里程碑横条、风险卡、行动卡、摘要横幅、前后对比横条、能力卡和结论面板。`examples/modern-elements.json` 提供 5 页整页编排；全部示例合计 7 份、67 页。离线演示位于 [library-demo.html](../.agents/skills/pptx-builder/assets/demo/library-demo.html)。

### 已完成的能力验证

此前独立验证已覆盖 67 页示例严格生成、59 个组件默认样例、原生列表 XML、母版高度读取/覆盖/缩放、保留区侵入、固定内容碰撞及背景容器对照。本机 PowerPoint 曾实际打开并导出新元素 5 页和列表 3 页，未发现文字高度溢出；孤立标点换行已处理。此记录说明既有能力验证范围，本次更名后的入口与产物由独立验证代理再次确认。
