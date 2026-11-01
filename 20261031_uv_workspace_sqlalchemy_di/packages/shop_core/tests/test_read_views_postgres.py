"""公開ビューを本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import os

import pytest
from sqlalchemy import text

from shop_core import Container, Settings

from conftest import migrate_to_head

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)

_SUMMARY = text("select * from v_order_summary where user_id = :id")


@pytest.fixture
def container(pg_url):
    migrate_to_head(pg_url)
    c = Container(Settings(database_url=pg_url))
    c.product_service().add("pen", 100, 5)
    yield c
    c.engine().dispose()


def test_order_summary(container):
    buyer = container.user_service().register("a@example.com", "A")
    idle = container.user_service().register("b@example.com", "B")
    pen = container.product_service().list()[0]
    container.order_service().place(buyer.id, [(pen.id, 2)])

    with container.db().connect() as conn:
        row = conn.execute(_SUMMARY, {"id": buyer.id}).mappings().one()
        assert (row["user_name"], row["email"]) == ("A", "a@example.com")
        assert (row["order_count"], row["total_spent"]) == (1, 200)
        row = conn.execute(_SUMMARY, {"id": idle.id}).mappings().one()
        assert (row["order_count"], row["total_spent"]) == (0, 0)


def test_product_stock(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().list()[0]
    container.order_service().place(user.id, [(pen.id, 2)])

    with container.db().connect() as conn:
        row = conn.execute(
            text("select * from v_product_stock where product_id = :id"), {"id": pen.id}
        ).mappings().one()
    assert (row["name"], row["price"], row["stock"]) == ("pen", 100, 3)


def test_view_sees_uncommitted_order_in_transaction(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().list()[0]
    with container.transaction() as tx:
        container.order_service().place(user.id, [(pen.id, 1)])
        row = tx.execute(_SUMMARY, {"id": user.id}).mappings().one()
        assert (row["order_count"], row["total_spent"]) == (1, 100)
