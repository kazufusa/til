"""shop_core.views の mapped class を本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import os

import pytest
from sqlalchemy import delete, select, update

from shop_core import Container, OrderSummary, ProductStock, Settings

from conftest import migrate_to_head

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture
def container(pg_url):
    migrate_to_head(pg_url)
    c = Container(Settings(database_url=pg_url))
    yield c
    c.engine().dispose()


def test_order_summary_orm(container):
    container.user_service().register("a@example.com", "A")
    container.user_service().register("b@example.com", "B")
    with container.transaction() as tx:
        rows = tx.session.scalars(
            select(OrderSummary).order_by(OrderSummary.user_id).limit(2)
        ).all()
    assert [r.email for r in rows] == ["a@example.com", "b@example.com"]
    assert all(r.order_count == 0 and r.total_spent == 0 for r in rows)


def test_product_stock_reflects_order(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().add("pen", 100, 5)
    container.order_service().place(user.id, [(pen.id, 2)])
    with container.transaction() as tx:
        row = tx.session.get(ProductStock, pen.id)
        assert (row.name, row.price, row.stock) == ("pen", 100, 3)


def test_write_through_view_class_raises(container):
    pen = container.product_service().add("pen", 100, 5)
    with pytest.raises(RuntimeError, match="read-only"):
        with container.transaction() as tx:
            tx.session.get(ProductStock, pen.id).stock = 0
    with pytest.raises(RuntimeError, match="read-only"):
        with container.transaction() as tx:
            tx.session.add(
                OrderSummary(user_id=99, user_name="x", email="x", order_count=0, total_spent=0)
            )
    assert container.product_service().list()[0].stock == 5


def test_bulk_dml_on_view_class_raises(container):
    pen = container.product_service().add("pen", 100, 5)
    with pytest.raises(RuntimeError, match="read-only"):
        with container.transaction() as tx:
            tx.session.execute(update(ProductStock).values(stock=1))
    with pytest.raises(RuntimeError, match="read-only"):
        with container.transaction() as tx:
            tx.session.execute(delete(ProductStock))
    products = container.product_service().list()
    assert [(p.id, p.stock) for p in products] == [(pen.id, 5)]
