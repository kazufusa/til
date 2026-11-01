"""ExecutionRepository と ExecutionService を本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import os

import pytest
from sqlalchemy import select, text

from shop_core import ExecutionNotRunningError, OrderNotFoundError, new_id
from shop_core import tables
from shop_core.domain import Execution, Image

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture
def container(pg_container):
    return pg_container


@pytest.fixture
def order_id(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().add("pen", 100, 5)
    return container.order_service().place(user.id, [(pen.id, 1)]).id


def test_start_get_roundtrip(container, order_id):
    svc = container.execution_service()
    e = svc.start(order_id)
    got = svc.get(e.id)
    assert (got.id, got.order_id, got.status, got.images) == (e.id, order_id, "running", [])
    assert got.created_at is not None
    assert e.id.version == 7


def test_start_unknown_order(container):
    with pytest.raises(OrderNotFoundError):
        container.execution_service().start(999)


def test_complete_keeps_image_order_and_is_idempotent(container, order_id):
    svc = container.execution_service()
    e = svc.start(order_id)
    ids = [new_id() for _ in range(3)]
    ids_shuffled = [ids[2], ids[0], ids[1]]
    svc.complete(e.id, ids_shuffled)
    svc.complete(e.id, ids_shuffled)
    got = svc.get(e.id)
    assert got.status == "done"
    assert [i.id for i in got.images] == ids_shuffled
    with container.engine().connect() as conn:
        assert conn.scalar(text("select count(*) from execution_images")) == 3


def test_fail_and_state_machine(container, order_id):
    svc = container.execution_service()
    e = svc.start(order_id)
    svc.fail(e.id, "boom")
    got = svc.get(e.id)
    assert (got.status, got.failure_reason) == ("failed", "boom")
    with pytest.raises(ExecutionNotRunningError):
        svc.complete(e.id, [new_id()])


def test_resolve_by_order_id(container, order_id):
    svc = container.execution_service()
    # 実行中は注文ごとに 1 つなので、1 つ目を終わらせてから 2 つ目を始める
    a = svc.start(order_id)
    svc.fail(a.id, "x")
    b = svc.start(order_id)
    with container.uow() as uow:
        found = uow.executions.resolve_by_order_id(order_id)
        assert [e.id for e in found] == [a.id, b.id]
        assert uow.executions.resolve_by_order_id(999) == []


def test_tables_alias_is_writable(container, order_id):
    e = container.execution_service().start(order_id)
    with container.transaction() as tx:
        row = tx.session.scalar(select(tables.Execution).where(tables.Execution.id == e.id))
        assert row.status == "running"
        tx.session.add(tables.ExecutionImage(id=new_id(), execution_id=e.id, ordinal=0))
    assert len(container.execution_service().get(e.id).images) == 1


def test_rollback_in_transaction_leaves_no_execution(container, order_id):
    with pytest.raises(RuntimeError):
        with container.transaction():
            container.execution_service().start(order_id)
            raise RuntimeError("x")
    with container.engine().connect() as conn:
        assert conn.scalar(text("select count(*) from executions")) == 0


def test_domain_dataclass_has_no_key_rules():
    e = Execution(id=new_id(), order_id=1, images=[Image(id=new_id())])
    assert not hasattr(e, "image_key") and not hasattr(e, "artifact_prefix")
