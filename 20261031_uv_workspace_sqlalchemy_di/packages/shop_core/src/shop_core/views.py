"""基盤の公開ビューに対応する読み取り専用の mapped class。

読み取り専用です。add、属性変更、delete は flush で RuntimeError になります。
session.execute(update(...)) などの ORM 経由の一括 INSERT、UPDATE、DELETE も RuntimeError です。
単純なビューは Postgres が書き込みを通し、元のテーブルを書き換えてしまうためです。
Core の接続(container.db().connect() など)はこの検査を通らないので、
確実に防ぐには DB ロールの GRANT で書き込み権限を与えないことです。
alembic の Base とは別の ReadBase に載せているので、マイグレーションの対象にはなりません。
"""

from sqlalchemy import Delete, Insert, MetaData, Update, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class ReadBase(DeclarativeBase):
    metadata = MetaData(schema="shop")


def _forbid_write(mapper, connection, target):
    raise RuntimeError(f"{type(target).__name__} is read-only; views cannot be written")


for _name in ("before_insert", "before_update", "before_delete"):
    event.listen(ReadBase, _name, _forbid_write, propagate=True)


def _forbid_bulk_write(state) -> None:
    stmt = state.statement
    if isinstance(stmt, (Insert, Update, Delete)) and stmt.table.key in ReadBase.metadata.tables:
        raise RuntimeError(f"{stmt.table.name} is read-only; views cannot be written")


event.listen(Session, "do_orm_execute", _forbid_bulk_write)


class OrderSummary(ReadBase):
    __tablename__ = "v_order_summary"

    user_id: Mapped[int] = mapped_column(primary_key=True)
    user_name: Mapped[str]
    email: Mapped[str]
    order_count: Mapped[int]
    total_spent: Mapped[int]


class ProductStock(ReadBase):
    __tablename__ = "v_product_stock"

    product_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    price: Mapped[int]
    stock: Mapped[int]
