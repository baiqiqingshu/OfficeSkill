-- 仅查询本次接口创建的订单；按实际表名/字段/租户规则修改。
SELECT status, quantity
FROM orders
WHERE id = :id AND name = :test_name
