"""本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import os

import pytest
from dependency_injector import providers
from sqlalchemy import text

from shop_core import Container, InsufficientStockError, Settings
from shop_core.infra.orm import Base

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture
def container():
    c = Container(
        settings=providers.Object(Settings(database_url=os.environ["TEST_DATABASE_URL"]))
    )
    engine = c.engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield c
    engine.dispose()


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
