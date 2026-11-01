"""SQLAlchemy のマッピング。ドメインモデルとは別物で、相互変換は repositories が担う"""

from datetime import datetime

from sqlalchemy import CheckConstraint, MetaData, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    metadata = MetaData(schema="shop")


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
    stock: Mapped[int] = mapped_column(Integer, nullable=False)


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
