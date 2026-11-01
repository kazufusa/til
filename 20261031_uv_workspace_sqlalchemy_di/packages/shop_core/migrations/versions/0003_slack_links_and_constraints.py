"""slack_links と不変条件の CHECK 制約

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "slack_links",
        sa.Column("slack_user_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["shop.users.id"]),
        sa.PrimaryKeyConstraint("slack_user_id"),
        schema="shop",
    )
    op.create_check_constraint("ck_products_stock_nonnegative", "products", "stock >= 0", schema="shop")
    op.create_check_constraint("ck_order_lines_quantity_positive", "order_lines", "quantity > 0", schema="shop")


def downgrade() -> None:
    op.drop_constraint("ck_order_lines_quantity_positive", "order_lines", type_="check", schema="shop")
    op.drop_constraint("ck_products_stock_nonnegative", "products", type_="check", schema="shop")
    op.drop_table("slack_links", schema="shop")
