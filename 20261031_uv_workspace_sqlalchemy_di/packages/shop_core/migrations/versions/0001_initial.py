"""initial

Revision ID: 0001
Revises:
Create Date: 2026-10-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("create schema if not exists shop")
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        schema="shop",
    )
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("stock", sa.Integer(), nullable=False),
        schema="shop",
    )
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("shop.users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        schema="shop",
    )
    op.create_table(
        "order_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("shop.orders.id"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("shop.products.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Integer(), nullable=False),
        schema="shop",
    )


def downgrade() -> None:
    op.drop_table("order_lines", schema="shop")
    op.drop_table("orders", schema="shop")
    op.drop_table("products", schema="shop")
    op.drop_table("users", schema="shop")
    # スキーマは alembic_version を持つので、ここでは落とさない
