# 提取与安全边界

## 提取已有 PPTX

`extract` 将能够表示的普通文字、图片、表格和简单形状转为组件，输出库清单中的内联 HTML、样式、默认内容和可重建的 JSON。局部文字样式使用 runs。原生母版、布局、主题和固定背景保留在 PPTX，不经 HTML 重画。

提取是原型转换，不能自动判断所有公司的固定装饰意图。请查看 `extraction-report.json`：被成功提取的正文从输出母版清除；不支持的对象留为静态内容并明确报告。复杂组合、SmartArt、图表、旋转、合并表格等不保证能转为可编辑 HTML 元素，不应宣称任意 PPTX 无损往返。可以先在本地 PowerPoint 简化源页，再提取。

源文件不会被修改。输出页中的 `masterSlide` 对应源页编号；重复和重排通过 JSON 完成。自带静态标题或正文的母版页会继续显示这些文字，应先清空不需要保留的正文，避免与 JSON 内容重叠。

所有输出 PPTX 都执行布局检查：`render` 的 `report.json` 同时记录编译场景及已保存 PPTX 的检查；`starter` 的 `report.json`、`extract` 的 `extraction-report.json` 记录输出母版的原生对象几何检查。`nativeChecks` 以文件名索引结果，包含 `checked`、`status`、`issueCount`、`issues` 和检查方法。`--strict-layout` 在存在问题时返回非零退出码，仍保留 PPTX、预览及报告，方便修正；不带此选项也始终检查，不代表问题可以忽略。

原生检查覆盖页面对象及可见的布局/母版固定对象，检测越界和重叠；组合对象按外框检查。文字和表格的高度估算来自受限编译场景，不等同于 PowerPoint 的真实字体排版。提取后的空母版通过检查也不代表重建后的正文通过检查，仍需对 `deck.json` 执行 `validate` 与 `render`。预览 HTML 不显示原生母版，不可用来证明公司模板无碰撞。

## 母版标题与页脚区域

```text
python SKILL_DIR/scripts/ppt_tool.py inspect-master master.pptx
```

输出每页 `masterRegions`、识别来源 `sources` 和 `placeholderCandidates`；尺寸单位是 96dpi 像素。标题高度表示从页面顶部到标题区下边界的保留带，页脚高度表示从页脚区顶部到页面底部的保留带。版式/母版中未实例化的占位符只列候选，不自动压缩正文；实际源页上的标题/页脚占位符即使为空，也按其具体位置保留区域。

配置顶层设置 `"masterRegions":{"titleHeight":96,"footerHeight":32,"detect":true}`；页面内同名字段覆盖顶层。显式高度优先于读取值；`detect:false` 关闭推断但保留显式高度。母版与 JSON 页面尺寸不同时，读取的母版高度自动换算为 JSON 页面的坐标。有效正文为 `y >= titleHeight` 且 `y+h <= pageHeight-footerHeight`；高度必须为非负有限值，两者之和小于页面高度。

元素可写 `"region":"body"`、`"title"`、`"footer"` 或 `"full"`。默认正文；内置 `title`、`eyebrow`、`ar-header` 推断为标题，`footnote` 为页脚，`cover`、`section-break`、`thanks` 为全页。设定了对应高度后，标题/页脚元素也检查是否超出所属区域。全页元素只跳过保留区检查，仍检查页面边界和内容溢出。需要放在正文下方的脚注请显式指定 `region:body`。

## 数据与本地执行

- 框架不发起网络请求，不上传内容，不调用云端工具，不执行第三方库里的程序，不自动安装依赖。
- 配置资源限制在配置目录，库资源限制在库目录；拒绝远程/UNC/穿越路径和符号链接逃逸。
- PPTX 包校验拒绝外部关系、宏、ActiveX、OLE/嵌入对象和危险 XML。源备注、批注及旧元数据不应进入最终交付。
- HTML 预览为静态内容，图片嵌入离线文件；原生 PPTX 母版不在 HTML 中重建。
- `--overwrite` 只对带本工具标记的输出目录有效，整个目录会被替换；输出目录应专用，不保存其他资料。

宿主 agent 的模型部署、工作目录是否云同步、第三方查看器与操作系统的数据流由内网部署环境负责。将此 skill 复制到内网并不自动保证宿主模型的输入数据也留在内网。
