"""ガード列(products.stock、executions.status)をサービス以外から変えられないことを確かめる。

フェイクには ORM がないので、検査は Postgres だけで行う。TEST_DATABASE_URL がなければ skip
"""

import os

import pytest
from sqlalchemy import text

from shop_core import GuardedColumnError, new_id, tables

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


def _scalar(c, sql):
    with c.engine().connect() as conn:
        return conn.scalar(text(sql))


@pytest.fixture
def seeded(pg_container):
    c = pg_container
    user = c.user_service().register("a@example.com", "A")
    pen = c.product_service().add("pen", 100, 5)
    order = c.order_service().place(user.id, [(pen.id, 1)])
    return c, user, pen, order


def test_direct_stock_change_is_rejected_and_not_written(seeded):
    c, _, pen, _ = seeded
    with pytest.raises(GuardedColumnError, match="products.stock"):
        with c.transaction() as tx:
            tx.session.get(tables.Product, pen.id).stock = 0
            tx.flush()
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 4


def test_direct_non_guarded_column_change_works(seeded):
    c, _, pen, _ = seeded
    with c.transaction() as tx:
        tx.session.get(tables.Product, pen.id).name = "ink"
    assert _scalar(c, f"select name from products where id = {pen.id}") == "ink"


def test_service_still_changes_stock(seeded):
    c, user, pen, _ = seeded
    c.order_service().place(user.id, [(pen.id, 2)])
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 2


def test_service_inside_scope_still_changes_stock(seeded):
    c, user, pen, _ = seeded
    with c.transaction() as tx:
        # 直接の変更(ガード列でない)と、サービスによる在庫の変更が同じスコープに並ぶ
        tx.session.get(tables.Product, pen.id).name = "ink"
        c.order_service().place(user.id, [(pen.id, 2)])
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 2


def test_guard_is_off_again_after_service_returns(seeded):
    c, user, pen, _ = seeded
    with pytest.raises(GuardedColumnError):
        with c.transaction() as tx:
            c.order_service().place(user.id, [(pen.id, 1)])
            tx.session.get(tables.Product, pen.id).stock = 0
            tx.flush()
    # サービスの変更も同じトランザクションなので戻っている
    assert _scalar(c, f"select stock from products where id = {pen.id}") == 4


def test_direct_status_change_is_rejected_and_not_written(seeded):
    c, _, _, order = seeded
    ex = c.execution_service().start(order.id)
    with pytest.raises(GuardedColumnError, match="executions.status"):
        with c.transaction() as tx:
            tx.session.get(tables.Execution, ex.id).status = "done"
            tx.flush()
    assert _scalar(c, f"select status from executions where id = '{ex.id}'") == "running"


def test_direct_failure_reason_change_works(seeded):
    c, _, _, order = seeded
    ex = c.execution_service().start(order.id)
    with c.transaction() as tx:
        tx.session.get(tables.Execution, ex.id).failure_reason = "memo"
    assert _scalar(c, f"select failure_reason from executions where id = '{ex.id}'") == "memo"


def test_service_still_changes_status(seeded):
    c, _, _, order = seeded
    ex = c.execution_service().start(order.id)
    c.execution_service().complete(ex.id, [new_id()])
    assert _scalar(c, f"select status from executions where id = '{ex.id}'") == "done"


def test_insert_with_initial_guarded_values_is_allowed(pg_container):
    c = pg_container
    with c.transaction() as tx:
        tx.session.add(tables.Product(name="pen", price=1, stock=3))
    assert _scalar(c, "select stock from products") == 3
