"""shop_core.tables の mapped class を本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import os

import pytest
from dependency_injector import providers
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from shop_core import Container, Settings, tables

from conftest import migrate_to_head

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture
def container(pg_url):
    migrate_to_head(pg_url)
    c = Container(settings=providers.Object(Settings(database_url=pg_url)))
    yield c
    c.engine().dispose()


def _counts(container):
    with container.engine().connect() as conn:
        links = conn.execute(text("select count(*) from slack_links")).scalar_one()
        orders = conn.execute(text("select count(*) from orders")).scalar_one()
    return links, orders


def test_read_users(container):
    container.user_service().register("a@example.com", "A")
    container.user_service().register("b@example.com", "B")
    with container.transaction() as tx:
        rows = tx.session.scalars(
            select(tables.User).order_by(tables.User.id).limit(2)
        ).all()
    assert [r.email for r in rows] == ["a@example.com", "b@example.com"]


def test_read_order_with_lines(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().add("pen", 100, 5)
    container.order_service().place(user.id, [(pen.id, 2)])
    with container.transaction() as tx:
        order = tx.session.scalars(select(tables.Order)).one()
        assert order.user_id == user.id
        assert order.lines[0].quantity == 2
        assert order.lines[0].unit_price == 100


def test_link_and_order_commit_together(container):
    pen = container.product_service().add("pen", 100, 5)
    with container.transaction() as tx:
        user = container.user_service().register("U1@slack.local", "alice")
        tx.session.add(tables.SlackLink(slack_user_id="U1", user_id=user.id))
        container.order_service().place(user.id, [(pen.id, 2)])
    assert _counts(container) == (1, 1)


def test_rollback_drops_link_and_order(container):
    pen = container.product_service().add("pen", 100, 5)
    with pytest.raises(RuntimeError):
        with container.transaction() as tx:
            user = container.user_service().register("U1@slack.local", "alice")
            tx.session.add(tables.SlackLink(slack_user_id="U1", user_id=user.id))
            container.order_service().place(user.id, [(pen.id, 2)])
            raise RuntimeError("boom")
    assert _counts(container) == (0, 0)


def test_direct_update_persists(container):
    user = container.user_service().register("a@example.com", "A")
    with container.transaction() as tx:
        tx.session.get(tables.User, user.id).name = "renamed"
    assert container.user_service().get(user.id).name == "renamed"


def test_negative_stock_violates_check_constraint(container):
    pen = container.product_service().add("pen", 100, 5)
    with pytest.raises(IntegrityError, match="ck_products_stock_nonnegative"):
        with container.transaction() as tx:
            tx.session.get(tables.Product, pen.id).stock = -1
    assert container.product_service().list()[0].stock == 5


def test_join(container):
    a = container.user_service().register("a@example.com", "A")
    container.user_service().register("b@example.com", "B")
    pen = container.product_service().add("pen", 100, 5)
    container.order_service().place(a.id, [(pen.id, 1)])
    container.order_service().place(a.id, [(pen.id, 1)])
    with container.transaction() as tx:
        rows = tx.session.execute(
            select(tables.User.name, func.count(tables.Order.id))
            .join(tables.Order, tables.Order.user_id == tables.User.id)
            .group_by(tables.User.name)
        ).all()
    assert [tuple(r) for r in rows] == [("A", 2)]
