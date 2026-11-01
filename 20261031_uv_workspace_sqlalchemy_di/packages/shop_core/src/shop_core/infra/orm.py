"""SQLAlchemy のマッピング。ドメインモデルとは別物で、相互変換は repositories が担う"""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Text,
    Index,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from shop_core.infra.schema import SCHEMA
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA)


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)


class ProductRow(Base):
    __tablename__ = "products"
    __table_args__ = (CheckConstraint("stock >= 0", name="ck_products_stock_nonnegative"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    # 在庫は OrderService 経由で変える(infra/guards.py)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, info={"guarded": True})


class OrderRow(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    lines: Mapped[list["OrderLineRow"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )


class OrderLineRow(Base):
    __tablename__ = "order_lines"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_order_lines_quantity_positive"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    order: Mapped[OrderRow] = relationship(back_populates="lines")


class SlackLinkRow(Base):
    __tablename__ = "slack_links"

    slack_user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ExecutionRow(Base):
    __tablename__ = "executions"
    __table_args__ = (
        # 注文ごとに実行中の Execution は 1 つだけ(部分一意インデックス)
        Index(
            "uq_executions_one_running_per_order",
            "order_id",
            unique=True,
            postgresql_where=text("status = 'running'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    # 状態遷移は ExecutionService 経由で行う(infra/guards.py)
    status: Mapped[str] = mapped_column(String(16), nullable=False, info={"guarded": True})
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    images: Mapped[list["ExecutionImageRow"]] = relationship(
        back_populates="execution",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ExecutionImageRow.ordinal",
    )
    # 楽観ロック。版は repositories が store のたびに明示的に上げる(generator は使わない)。
    # SQLAlchemy は属性が何も変わらないと UPDATE を出さないが、ここでは「変更なし」の
    # 更新でも競合を検出したい。そのため store は必ず version を上げて UPDATE を出させ、
    # UPDATE の WHERE が読んだ版と一致するかで競合を見分ける
    __mapper_args__ = {"version_id_col": version, "version_id_generator": False}


class ExecutionImageRow(Base):
    __tablename__ = "execution_images"
    __table_args__ = (
        UniqueConstraint("execution_id", "ordinal", name="uq_execution_images_ordinal"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    execution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("executions.id"), nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    execution: Mapped[ExecutionRow] = relationship(back_populates="images")


# ガード列の検査を Base に仕掛ける。orm を import すれば必ず有効になるようここで読み込む
import shop_core.infra.guards  # noqa: E402,F401
