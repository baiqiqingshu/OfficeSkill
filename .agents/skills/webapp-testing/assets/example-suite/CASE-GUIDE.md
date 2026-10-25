# 改写业务用例

此目录是需按目标应用改写的示例。接口、业务状态、响应码、表名和 DOM ID 均为示范，不能直接代表任意真实订单项目。

先确认接口契约与权限，修改 suite.json；接口优先创建客户与订单，capture ID，审批后通过详情、页面和 SQL 检查结果。SQL 文件仅查询本用例 ID 和标记。真实项目可能禁止删除已审批订单，此时替换为合法撤销/回收路径或测试库定向清理，不能为了清理而放宽业务规则。

预处理位于 setup，执行语句位于 cases，清理位于 teardown。需要额外 SQL 预处理时，将单条 SQL 文件放 sql/，并在 setup 中用 type: sql 引用；不要清空业务表。用户可以只保留后端步骤，也可以替换为由浏览器创建数据、再用 API/SQL 验证。

修改后使用本 skill 的 export 命令生成独立执行包，包内 run.py 支持前端 URL 和运行时 token。数据库 TEST_DATABASE_URL 与 Lightpanda 原生 HTTP MCP 服务需作为运行环境准备；默认浏览器不依赖 Playwright。需要保留 CDP 时显式设 browser.backend=playwright。services 默认为空，连接已运行前后端；若需启动服务，请按 references/services.md 填写项目实际命令。
