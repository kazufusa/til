"""本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import os

import pytest
from sqlalchemy import text

from shop_core import Container, InsufficientStockError, Settings

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture
def container(pg_container):
    return pg_container


def test_place_order_roundtrip(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().add("pen", 100, 5)
    order = container.order_service().place(user.id, [(pen.id, 3)])
    assert order.id is not None
    assert order.created_at is not None
    assert container.order_service().list_by_user(user.id)[0].total == 300
    assert container.product_service().list()[0].stock == 2


def test_failed_order_leaves_no_rows(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().add("pen", 100, 1)
    with pytest.raises(InsufficientStockError):
        container.order_service().place(user.id, [(pen.id, 2)])
    with container.engine().connect() as conn:
        assert conn.scalar(text("select count(*) from orders")) == 0
        assert conn.scalar(text("select stock from products")) == 1


def test_opposite_order_lines_do_not_deadlock(container):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    user = container.user_service().register("a@example.com", "A")
    a = container.product_service().add("a", 10, 100)
    b = container.product_service().add("b", 10, 100)
    rounds = 5
    barrier = Barrier(2)

    def run(items):
        for _ in range(rounds):
            barrier.wait()
            container.order_service().place(user.id, items)

    with ThreadPoolExecutor(2) as pool:
        futures = [
            pool.submit(run, [(a.id, 1), (b.id, 1)]),
            pool.submit(run, [(b.id, 1), (a.id, 1)]),
        ]
        for f in futures:
            f.result()  # OperationalError(deadlock detected) があればここで上がる
    assert {p.name: p.stock for p in container.product_service().list()} == {"a": 90, "b": 90}
    assert len(container.order_service().list_by_user(user.id)) == rounds * 2
