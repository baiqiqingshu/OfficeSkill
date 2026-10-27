# 按需检索与定制

默认模板直接 init；只有模板无法表达需求或用户要求特定风格时才检索。

```text
python <skill>/scripts/ucd.py search "审批 筛选" --kind component --limit 2
python <skill>/scripts/ucd.py show table --example
python <skill>/scripts/ucd.py show jade --kind style --example
```

search/show 默认仅返回简短元数据。`--example` 返回单项 JSON 配置或主题 token；仅手工扩展 HTML 时才用 `show ID --code` 取代码。`--max-chars` 控制预算，预算不足时返回元数据，不截断 JSON。重名时加 `--kind component` 或 `--kind layout`。

已有页面先看摘要，不重复读取整份 page.json、HTML 和设计规范：

```text
python <skill>/scripts/ucd.py summary --dir output/approval
python <skill>/scripts/ucd.py summary --dir output/approval --block records
```

第一条只返回页面标识、主题和区块目录；第二条只返回目标区块，可加 `--max-chars`。大表格不要仅为改标题而加载所有行；直接 patch 已知字段。需要增删行才读取目标区块或针对 page.json 做本地数据处理。

init 的 `--config` 是 JSON Merge Patch：对象递归合并，数组替换，null 删除。配置文件相对当前目录；其中素材 source 相对配置文件目录。`--title` 优先于配置文件。init/patch/build 在写入前校验结构和离线特征，失败不提交生成产物；保留手工修改保护。

阅读层次：入口与默认命令 → 受影响区块配置 → 单项参考 → 仅手工扩展时读 CSS/JS。规范、清单、资源是交付产物，不必每次回读。普通模板任务不强制增加研究、风格比较或额外文档。
