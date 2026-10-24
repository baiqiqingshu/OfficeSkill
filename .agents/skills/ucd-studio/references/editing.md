# 修改规则

page.json 是生成源。patch 使用 RFC 7396：对象递归合并，数组整体替换；删除区块用 `{"blocks":{"id":null}}`。保留未受影响区块 ID；顺序为 blocks 对象的键顺序。

build/patch 核对 manifest：index.html、design-system.md、固定 lib、复制资源若被手工修改则拒绝覆盖。page.json 允许修改；editable 模式的 page.js 允许修改并保留。每次成功生成前保存 `.history/<时间戳>/`；校验失败不改已有交付物。

遇到手工修改：先读差异，将可表达内容归入 page.json；额外 HTML/CSS 可直接局部修改并同步规范，保留手工版本。若决定重新生成，先复制备份，再在新目录构建。工具没有强制覆盖开关。

editable 模式修改 DOM 后须检查 page.js 的选择器与事件；库升级需要人工合并。check 对脚本仅静态扫描，不替代实际浏览器验证。没有 page.json 的旧 HTML 采用局部编辑，不强制导入生成器。
