"""ガード列の変更をサービスの外から DB に書けなくするトリガーと、ビューの書き込み権限の取り消し

ガード列(products.stock、executions.status)は、不変条件を持つサービスだけが変える。
ORM の before_update 検査(infra/guards.py)は ORM の外(Core の update 文、生 SQL、別の言語のクライアント)を
見られないので、DB 側でも止める。

トリガー関数 shop.guard_column_change() は、BEFORE UPDATE で引数の列(TG_ARGV[0])が変わるとき、
current_setting('app.in_service', true) が 'on' でなければ、エラーコード P0001 で例外にする。
メッセージは `guarded column <列> on <テーブル> changed outside a service`。
フラグはサービスの UoW(SqlAlchemyUnitOfWork)が、トランザクションごとに
set_config('app.in_service', 'on', true) で立てる。第 3 引数が true なのでトランザクション内限りで、
SAVEPOINT に戻れば元に戻る。ライブラリはこの P0001 を GuardedColumnError に翻訳する。
列の比較は to_jsonb(NEW) と to_jsonb(OLD) の同名キーで行うので、拡張(hstore)は要らない。

あわせて、アプリ用ロール shop_app から、ビュー(v_order_summary、v_product_stock)への
INSERT / UPDATE / DELETE を取り消す。0006 はスキーマ内の全テーブルとビューに DML を付けたが、
単純なビューは書き込みが元のテーブルに通るため、トリガーも迂回できてしまう。
ロールがない環境ではスキップする(0006 と同じ)。

ALTER DEFAULT PRIVILEGES はテーブルとビューを区別できない。今後ビューを足すマイグレーションは、
作った直後に自分で `REVOKE INSERT, UPDATE, DELETE ON <view> FROM shop_app` を実行すること。

トリガーと GRANT / REVOKE は autogenerate の対象外なので、alembic check には影響しない。

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-02
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (テーブル, ガード列)。ORM 側の info={"guarded": True} と一致させる
GUARDED = (("products", "stock"), ("executions", "status"))
VIEWS = ("v_order_summary", "v_product_stock")


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION shop.guard_column_change() RETURNS trigger
        LANGUAGE plpgsql AS $fn$
        BEGIN
            IF coalesce(current_setting('app.in_service', true), '') <> 'on'
               AND (to_jsonb(NEW) ->> TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(OLD) ->> TG_ARGV[0])
            THEN
                RAISE EXCEPTION 'guarded column % on % changed outside a service',
                    TG_ARGV[0], TG_TABLE_NAME USING ERRCODE = 'P0001';
            END IF;
            RETURN NEW;
        END
        $fn$
        """
    )
    for table, column in GUARDED:
        op.execute(
            f"""
            CREATE TRIGGER guard_{table}_{column}
            BEFORE UPDATE ON shop.{table}
            FOR EACH ROW EXECUTE FUNCTION shop.guard_column_change('{column}')
            """
        )
    for view in VIEWS:
        op.execute(_when_role_exists(f"REVOKE INSERT, UPDATE, DELETE ON shop.{view} FROM shop_app"))


def downgrade() -> None:
    for view in VIEWS:
        op.execute(_when_role_exists(f"GRANT INSERT, UPDATE, DELETE ON shop.{view} TO shop_app"))
    for table, column in GUARDED:
        op.execute(f"DROP TRIGGER guard_{table}_{column} ON shop.{table}")
    op.execute("DROP FUNCTION shop.guard_column_change()")


def _when_role_exists(statement: str) -> str:
    return f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'shop_app') THEN
                {statement};
            END IF;
        END
        $$
        """
