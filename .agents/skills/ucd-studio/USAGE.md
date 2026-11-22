# UCD Studio 离线技能包

本目录是完整可搬运技能，无需联网安装依赖。把整个 `ucd-studio` 目录复制到目标工具的技能目录（如 `.agents/skills/ucd-studio`），不要只复制 `SKILL.md`。新建后台原型默认使用配置工程，只修改小型 JSON 和自定义组件，交付可恢复源码的单 HTML。

## 推荐：配置工程 + 自定义组件（v1.1）

```text
python ucd-studio/scripts/ucd.py project --out output/approval --template crud --title "申请管理" --style ocean
python ucd-studio/scripts/ucd.py add-page --dir output/approval --id members --title "组织成员" --template tree-table
python ucd-studio/scripts/ucd.py add-component --dir output/approval --name biz-card --deps panel --css
python ucd-studio/scripts/ucd.py patch --dir output/approval --file pages/requests.json --node requests --set props.pageSize=10 --append props.columns=priority
python ucd-studio/scripts/ucd.py build --dir output/approval --out delivery/approval.html
```

- 内置 5 套后台模板：`crud`、`tree-table`、`dashboard`、`approval`、`settings`。
- 内置 19 个高频后台组件（Skill 内按类聚合成 4 个包，复制到工作目录和临时构建目录时自动按一组件一文件拆分）。
- 支持 `--from-spec spec.json` 一步把单份紧凑 JSON 拆成完整工程并构建单 HTML。
- 内置“霁蓝瓷面”视觉规范、自定义下拉框（替代原生 `<select>`）、`<dialog>` 确认弹窗与内联 SVG 图标。

接手单个 HTML 后继续修改：

```text
python ucd-studio/scripts/ucd.py unpack --html delivery/approval.html --out output/approval-edit
python ucd-studio/scripts/ucd.py summary --dir output/approval-edit
python ucd-studio/scripts/ucd.py build --dir output/approval-edit --out delivery/approval.html
```

脱离 skill 也能 `python output/approval-edit/build.py` 独立重建；重复解包到已有 UCD 工程目录可加 `--force`。外部手改的 HTML 默认受保护，`unpack --allow-modified` 仅恢复原内嵌源码。

打开 [配置工程示例](demo/project/index.html) 体验。完整协议见 [references/workspace.md](references/workspace.md)；运行 `ucd.py components [组件名]` 获取精简示例。

## 兼容：旧版 page.json 原型

已有只含 `page.json` 的旧目录可继续使用 `init/quick/patch/build/check`（详见 [references/page-spec.md](references/page-spec.md) 与 [references/output-modes.md](references/output-modes.md)）。用 `python ucd-studio/scripts/make_demo.py` 可重新生成示例目录。

离线承诺边界：脚本无网络调用、不安装依赖；生成页面无远程资源、带 CSP；交互数据仅保存在浏览器内存，刷新重置。
