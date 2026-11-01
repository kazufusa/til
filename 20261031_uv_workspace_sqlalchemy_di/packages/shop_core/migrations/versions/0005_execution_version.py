"""executions に楽観ロック用の version と、注文ごとに実行中は 1 件の部分一意インデックスを足す

version は既存の行を 0 にするため server_default を残す。
部分一意インデックスは、status が running の行だけを order_id で一意にする。
既に同じ注文に running が 2 件以上あると、この移行は失敗する(先に片方を整理する)。

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "executions",
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("0")),
        schema="shop",
    )
    op.create_index(
        "uq_executions_one_running_per_order",
        "executions",
        ["order_id"],
        unique=True,
        schema="shop",
        postgresql_where=sa.text("status = 'running'"),
    )


def downgrade() -> None:
    op.drop_index("uq_executions_one_running_per_order", table_name="executions", schema="shop")
    op.drop_column("executions", "version", schema="shop")
