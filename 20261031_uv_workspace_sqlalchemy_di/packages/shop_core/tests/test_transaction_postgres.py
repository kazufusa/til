"""transaction() を本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import os

import pytest
from dependency_injector import providers
from sqlalchemy import text

from shop_core import Container, Settings
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
    # 在庫の初期値を用意する(スコープの外で commit 済み)
    c.product_service().add("pen", 100, 5)
    yield c
    engine.dispose()


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
