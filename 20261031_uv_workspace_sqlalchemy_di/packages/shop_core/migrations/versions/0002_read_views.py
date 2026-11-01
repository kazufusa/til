"""read views

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-01
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        create view shop.v_order_summary as
        select
            u.id as user_id,
            u.name as user_name,
            u.email,
            count(distinct o.id) as order_count,
            coalesce(sum(l.quantity * l.unit_price), 0)::bigint as total_spent
        from shop.users u
        left join shop.orders o on o.user_id = u.id
        left join shop.order_lines l on l.order_id = o.id
        group by u.id, u.name, u.email
        """
    )
    op.execute(
        """
        create view shop.v_product_stock as
        select id as product_id, name, price, stock from shop.products
        """
    )


def downgrade() -> None:
    op.execute("drop view shop.v_product_stock")
    op.execute("drop view shop.v_order_summary")
