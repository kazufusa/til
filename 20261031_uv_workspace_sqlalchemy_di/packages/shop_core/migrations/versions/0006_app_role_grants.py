"""アプリ用ロール shop_app に shop スキーマの DML 権限を付ける

ロール自体はここでは作らない。ロールはクラスタ全体のもので、パスワードも環境ごとの運用
(Secrets Manager や初期化スクリプト)が決めるため、スキーマの持ち物であるマイグレーションの範囲外にある。
ローカルでは docker/postgres-init/01_app_role.sql が作る。

ロールがない環境(テスト用の DB など)でも移行を通すため、付与はロールが存在するときだけ行う。
付ける権限はスキーマの USAGE、テーブルとビューの DML、シーケンスの USAGE と SELECT。
CREATE は付けないので、アプリはスキーマに DDL を実行できない(assert_app_role が起動時に確かめる)。

ALTER DEFAULT PRIVILEGES は、この移行を実行するロール(マイグレーション用の shop)が今後作る
オブジェクトに効く。以降のマイグレーションで足すテーブルにも、権限を付け直さずに済む。
GRANT と ALTER DEFAULT PRIVILEGES は autogenerate の対象外なので、alembic check には影響しない。

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-01
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'shop_app') THEN
                GRANT USAGE ON SCHEMA shop TO shop_app;
                GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shop TO shop_app;
                GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA shop TO shop_app;
                ALTER DEFAULT PRIVILEGES IN SCHEMA shop
                    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO shop_app;
                ALTER DEFAULT PRIVILEGES IN SCHEMA shop
                    GRANT USAGE, SELECT ON SEQUENCES TO shop_app;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'shop_app') THEN
                ALTER DEFAULT PRIVILEGES IN SCHEMA shop
                    REVOKE USAGE, SELECT ON SEQUENCES FROM shop_app;
                ALTER DEFAULT PRIVILEGES IN SCHEMA shop
                    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM shop_app;
                REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA shop FROM shop_app;
                REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shop FROM shop_app;
                REVOKE USAGE ON SCHEMA shop FROM shop_app;
            END IF;
        END
        $$;
        """
    )
