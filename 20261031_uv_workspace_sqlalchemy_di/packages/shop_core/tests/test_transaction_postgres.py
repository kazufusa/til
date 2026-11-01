"""transaction() を本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import os

import pytest
from sqlalchemy import text

from shop_core import Container, InsufficientStockError, Settings

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture
def container(pg_container):
    # 在庫の初期値を用意する(スコープの外で commit 済み)
    pg_container.product_service().add("pen", 100, 5)
    return pg_container


_DEC = text("update products set stock = stock - 1 where id = :id")


def _mixed(c, tx):
    user = c.user_service().register("a@example.com", "A")
    pen = c.product_service().list()[0]
    tx.execute(_DEC, {"id": pen.id})
    c.order_service().place(user.id, [(pen.id, 1)])


def test_mixed_scope_rolls_back_on_error(container):
    with pytest.raises(RuntimeError):
        with container.transaction() as tx:
            _mixed(container, tx)
            raise RuntimeError
    with container.engine().connect() as conn:
        assert conn.scalar(text("select count(*) from users")) == 0
        assert conn.scalar(text("select count(*) from orders")) == 0
        assert conn.scalar(text("select stock from products")) == 5


def test_mixed_scope_commits_all(container):
    with container.transaction() as tx:
        _mixed(container, tx)
    with container.engine().connect() as conn:
        assert conn.scalar(text("select count(*) from users")) == 1
        assert conn.scalar(text("select count(*) from orders")) == 1
        # 直接 SQL の -1 と place の -1
        assert conn.scalar(text("select stock from products")) == 3


def _count(container, sql):
    with container.engine().connect() as conn:
        return conn.scalar(text(sql))


def test_caught_exception_inside_transaction_leaves_no_partial_writes(pg_container):
    c = pg_container
    user = c.user_service().register("a@example.com", "A")
    p1 = c.product_service().add("p1", 100, 10)
    p2 = c.product_service().add("p2", 100, 10)
    with c.transaction():
        try:
            c.order_service().place(user.id, [(p1.id, 2), (p2.id, 999)])
        except InsufficientStockError:
            pass
    assert _count(c, f"select stock from products where id = {p1.id}") == 10
    assert _count(c, "select count(*) from orders") == 0
    assert _count(c, "select count(*) from order_lines") == 0


def test_nested_scope_failure_does_not_leak_but_outer_commits(pg_container):
    c = pg_container
    with c.transaction():
        c.user_service().register("a@example.com", "A")
        try:
            with c.transaction():
                c.user_service().register("b@example.com", "B")
                raise RuntimeError
        except RuntimeError:
            pass
    emails = [u.email for u in c.user_service().list()]
    assert emails == ["a@example.com"]


def test_service_inside_transaction_commits_at_scope_end(pg_container):
    c = pg_container
    user = c.user_service().register("a@example.com", "A")
    p1 = c.product_service().add("p1", 100, 10)
    with c.transaction():
        c.order_service().place(user.id, [(p1.id, 2)])
    assert _count(c, "select count(*) from orders") == 1
    assert _count(c, f"select stock from products where id = {p1.id}") == 8
