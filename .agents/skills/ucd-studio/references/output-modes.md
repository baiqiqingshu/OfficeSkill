# 输出方案

| 方案 | 模型工作量 | 交付 | 适用场景 |
|---|---|---|---|
| 单 HTML 内嵌 CSS/JS + 规范 + assets | 最低，只需配置和小补丁 | 无素材时 HTML 独立运行 | **默认推荐**，单页设计与评审 |
| HTML + 固定 lib + 规范 + assets | 低，不必读运行库 | 整体复制目录 | 团队统一运行时与版本治理 |
| HTML + 可修改 JS + 规范 + assets | 较高，需理解定制逻辑 | 整体复制目录 | 复杂交互及二次开发 |

三种模式均内嵌 CSS。生成端需要 Python 3.10+，阅读端只需支持原生 dialog、CSS Grid 的现代浏览器；普通 defer script 可在 file:// 打开，无 ES modules、fetch 和动态加载。

```text
python <skill>/scripts/ucd.py init --layout dashboard --mode single --out output/demo
```

节省上下文主要来自本地检索、代码切片和确定性生成，不是把 JS 拆出去。默认模式保留 page.json，同样能持续修改。固定库升级必须迁移版本，不能重算摘要掩盖修改；可编辑 JS 的自动合并不在本工具能力范围。

1.1.0 升级了模板、组件状态与默认设计规范，page.json 的数据协议 version 仍为 1。旧版输出受到工具版本保护，应保留原目录，在新目录重新生成并迁移配置与素材；不要手改 manifest 的版本或摘要来绕过保护。editable 模式的手工 page.js 行为需要人工保留、合并与复查。示例目录同样应先在新目录生成，再替换确认仅由生成器维护的旧产物。
