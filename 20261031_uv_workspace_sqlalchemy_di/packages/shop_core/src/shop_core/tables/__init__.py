"""全テーブルの mapped class。書き込めます。

ドメインの不変条件が絡む操作(在庫の引き当て、注文の作成)はサービスを使ってください。
サービスが無い単純な insert や update は、ここの mapped class で直接書けます。
不変条件の一部は DB 制約でも守られます(stock >= 0 など)。
shop_core.User などのドメインモデルとは別物で、DDL は基盤の alembic が持ちます。
"""

from shop_core.infra.orm import (
    ExecutionImageRow,
    ExecutionRow,
    OrderLineRow,
    OrderRow,
    ProductRow,
    SlackLinkRow,
    UserRow,
)

User = UserRow
Product = ProductRow
Order = OrderRow
OrderLine = OrderLineRow
SlackLink = SlackLinkRow
Execution = ExecutionRow
ExecutionImage = ExecutionImageRow

__all__ = ["Execution", "ExecutionImage", "Order", "OrderLine", "Product", "SlackLink", "User"]
