"""ガード列のトリガー(マイグレーション 0007)。ORM の検査を通らない書き方も止まることを確かめる。

トリガーはマイグレーションが作るので、migrate_to_head した DB を使う。TEST_DATABASE_URL がなければ skip
"""

import os

import pytest
from sqlalchemy import text, update

from shop_core import Container, GuardedColumnError, InsufficientStockError, Settings, new_id, tables

from conftest import migrate_to_head

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture
def c(pg_url):
    migrate_to_head(pg_url)
    container = Container(Settings(database_url=pg_url))
    yield container
    container.engine().dispose()


@pytest.fixture
def seeded(c):
    user = c.user_service().register("a@example.com", "A")
    pen = c.product_service().add("pen", 100, 5)
    order = c.order_service().place(user.id, [(pen.id, 1)])
    return c, user, pen, order


def _scalar(c, sql):
    with c.engine().connect() as conn:
        return conn.scalar(text(sql))


def test_raw_sql_stock_update_in_transaction_is_rejected(seeded):
    c, _, pen, _ = seeded
    with pytest.raises(GuardedColumnError, match="products.stock") as ei:
        with c.transaction() as tx:
            tx.execute(text(f"UPDATE shop.products SET stock = 0 WHERE id = {pen.id}"))
    assert (ei.value.table, ei.value.column) == ("products", "stock")
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 4


def test_raw_sql_stock_update_on_core_connection_is_rejected(seeded):
    c, _, pen, _ = seeded
    with pytest.raises(GuardedColumnError, match="products.stock"):
        with c.db().connect() as conn:
            conn.execute(text(f"UPDATE shop.products SET stock = 0 WHERE id = {pen.id}"))
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 4


def test_orm_bulk_update_is_rejected(seeded):
    c, _, pen, _ = seeded
    with pytest.raises(GuardedColumnError, match="products.stock"):
        with c.transaction() as tx:
            tx.session.execute(
                update(tables.Product).where(tables.Product.id == pen.id).values(stock=0)
            )
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 4


def test_orm_attribute_change_is_still_rejected_before_the_db(seeded):
    c, _, pen, _ = seeded
    with pytest.raises(GuardedColumnError, match="products.stock"):
        with c.transaction() as tx:
            tx.session.get(tables.Product, pen.id).stock = 0
            tx.flush()


def test_raw_sql_status_update_is_rejected(seeded):
    c, _, _, order = seeded
    ex = c.execution_service().start(order.id)
    with pytest.raises(GuardedColumnError, match="executions.status"):
        with c.db().connect() as conn:
            conn.execute(text(f"UPDATE shop.executions SET status = 'done' WHERE id = '{ex.id}'"))
    assert _scalar(c, f"select status from executions where id = '{ex.id}'") == "running"


def test_non_guarded_columns_and_unchanged_values_are_allowed(seeded):
    c, _, pen, _ = seeded
    with c.db().connect() as conn:
        conn.execute(text(f"UPDATE shop.products SET name = 'ink' WHERE id = {pen.id}"))
        # 値が変わらない更新は通る
        conn.execute(text(f"UPDATE shop.products SET stock = stock WHERE id = {pen.id}"))
    assert _scalar(c, f"select name from products where id = {pen.id}") == "ink"


def test_services_still_change_guarded_columns(seeded):
    c, user, pen, order = seeded
    c.order_service().place(user.id, [(pen.id, 2)])
    ex = c.execution_service().start(order.id)
    c.execution_service().complete(ex.id, [new_id()])
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 2
    assert _scalar(c, f"select status from executions where id = '{ex.id}'") == "done"


def test_services_inside_scope_work_and_flag_is_off_afterwards(seeded):
    c, user, pen, _ = seeded
    with pytest.raises(GuardedColumnError):
        with c.transaction() as tx:
            c.order_service().place(user.id, [(pen.id, 1)])
            # SAVEPOINT の解放後もフラグが残っていれば、この更新は通ってしまう
            tx.execute(text(f"UPDATE shop.products SET stock = 0 WHERE id = {pen.id}"))
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 4


def test_flag_is_off_after_a_failed_service_inside_scope(seeded):
    c, user, pen, _ = seeded
    with pytest.raises(GuardedColumnError):
        with c.transaction() as tx:
            with pytest.raises(InsufficientStockError):
                c.order_service().place(user.id, [(pen.id, 99)])
            tx.execute(text(f"UPDATE shop.products SET stock = 0 WHERE id = {pen.id}"))
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 4


def test_flag_does_not_leak_to_the_next_transaction_on_a_pooled_connection(seeded):
    c, user, pen, _ = seeded
    c.order_service().place(user.id, [(pen.id, 1)])
    with pytest.raises(GuardedColumnError):
        with c.db().connect() as conn:
            conn.execute(text(f"UPDATE shop.products SET stock = 0 WHERE id = {pen.id}"))


def test_trigger_function_reports_table_and_column(seeded):
    c, _, pen, _ = seeded
    with pytest.raises(Exception) as ei:
        with c.engine().begin() as conn:
            conn.execute(text(f"UPDATE shop.products SET stock = 0 WHERE id = {pen.id}"))
    # 翻訳を通らない生の engine では、DB のメッセージがそのまま見える
    assert "guarded column stock on products changed outside a service" in str(ei.value)
    assert ei.value.orig.sqlstate == "P0001"


def test_downgrade_removes_triggers_and_upgrade_restores_them(pg_url, c):
    from alembic import command
    from alembic.config import Config

    from conftest import _ROOT

    cfg = Config(str(_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(_ROOT / "migrations"))
    os.environ["DATABASE_URL"] = pg_url
    try:
        command.downgrade(cfg, "0006")
        assert _scalar(c, "select count(*) from pg_trigger where tgname like 'guard_%'") == 0
        assert _scalar(c, "select count(*) from pg_proc where proname = 'guard_column_change'") == 0
        command.upgrade(cfg, "head")
        assert _scalar(c, "select count(*) from pg_trigger where tgname like 'guard_%'") == 2
    finally:
        del os.environ["DATABASE_URL"]


@pytest.mark.anyio
async def test_async_scope_services_work_and_raw_sql_is_rejected(seeded):
    c, user, pen, _ = seeded
    async with c.transaction_async() as tx:
        await tx.run(c.order_service().place, user.id, [(pen.id, 1)])
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 3
    with pytest.raises(GuardedColumnError):
        async with c.transaction_async() as tx:
            await tx.execute(text(f"UPDATE shop.products SET stock = 0 WHERE id = {pen.id}"))
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 3


@pytest.fixture
def anyio_backend():
    return "asyncio"
