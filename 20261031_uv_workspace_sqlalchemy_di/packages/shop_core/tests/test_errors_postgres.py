"""制約違反と接続障害の翻訳を本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from shop_core import BusinessRuleError, DependencyError, tables
from shop_core.infra.guards import service_context

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


def _count(container, table: str) -> int:
    with container.engine().connect() as conn:
        return conn.scalar(text(f"select count(*) from {table}"))


def test_registered_constraint_becomes_domain_error_and_rolls_back(pg_container):
    pen = pg_container.product_service().add("pen", 100, 5)
    with pytest.raises(BusinessRuleError) as ei:
        with pg_container.transaction() as tx:
            tx.session.add(tables.User(email="a@example.com", name="A"))
            tx.flush()
            product = tx.session.get(tables.Product, pen.id)
            # DB の CHECK を確かめるため、ガード列の検査は通す
            with service_context():
                product.stock = -1
                tx.flush()
    assert ei.value.code == "product_stock_negative"
    assert isinstance(ei.value.__cause__, IntegrityError)
    # スコープ全体が戻っている
    assert _count(pg_container, "users") == 0
    assert pg_container.product_service().list()[0].stock == 5


def test_registered_constraint_translated_at_commit(pg_container):
    # flush せずにスコープを抜けると、commit 時の autoflush で違反が出る
    pen = pg_container.product_service().add("pen", 100, 5)
    with pytest.raises(BusinessRuleError) as ei:
        with service_context(), pg_container.transaction() as tx:
            tx.session.get(tables.Product, pen.id).stock = -1
    assert ei.value.code == "product_stock_negative"
    assert pg_container.product_service().list()[0].stock == 5


def test_unregistered_constraint_stays_integrity_error(pg_container):
    with pytest.raises(IntegrityError):
        with pg_container.transaction() as tx:
            user = tables.User(email="a@example.com", name="A")
            tx.session.add(user)
            tx.flush()
            order = tables.Order(user_id=user.id)
            tx.session.add(order)
            tx.flush()
            tx.session.add(
                tables.OrderLine(order_id=order.id, product_id=999999, quantity=1, unit_price=1)
            )
            tx.flush()
    assert _count(pg_container, "users") == 0


def test_register_concurrently_creates_one_row(pg_container):
    workers = 8
    barrier = Barrier(workers)
    svc = pg_container.user_service()

    def register(_):
        barrier.wait()
        return svc.register("same@example.com", "Same").id

    with ThreadPoolExecutor(workers) as pool:
        ids = list(pool.map(register, range(workers)))
    assert len(set(ids)) == 1
    assert _count(pg_container, "users") == 1


def test_terminated_backend_raises_dependency_error(pg_container):
    with pytest.raises(DependencyError) as ei:
        with pg_container.transaction() as tx:
            pid = tx.execute(text("select pg_backend_pid()")).scalar_one()
            with pg_container.engine().connect() as admin:
                admin.execute(text("select pg_terminate_backend(:pid)"), {"pid": pid})
            tx.execute(text("select 1"))
    assert ei.value.code == "db_unavailable"
    assert ei.value.retryable is True
    # プールは壊れた接続を捨てて、次の呼び出しは通る
    assert pg_container.user_service().list() == []


def test_terminated_backend_at_commit_raises_dependency_error(pg_container):
    with pytest.raises(DependencyError) as ei:
        with pg_container.transaction() as tx:
            pid = tx.execute(text("select pg_backend_pid()")).scalar_one()
            tx.session.add(tables.User(email="a@example.com", name="A"))
            with pg_container.engine().connect() as admin:
                admin.execute(text("select pg_terminate_backend(:pid)"), {"pid": pid})
    assert ei.value.code == "db_unavailable"
    assert pg_container.user_service().list() == []
