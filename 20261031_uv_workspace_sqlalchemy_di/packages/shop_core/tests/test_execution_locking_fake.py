"""Execution の楽観ロックと、フェイクが再現する DB 制約を DB なしで検証する"""

import pytest

from shop_core import (
    BusinessRuleError,
    ConcurrentUpdateError,
    Container,
    Execution,
    InputError,
    Order,
    OrderLine,
    Product,
    User,
    new_id,
)
from shop_core.testing import FakeUnitOfWork, InMemoryState, fake_backend


@pytest.fixture
def state():
    return InMemoryState()


@pytest.fixture
def container(state):
    c = Container()
    with fake_backend(c, state):
        yield c


@pytest.fixture
def order_id(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().add("pen", 100, 5)
    return container.order_service().place(user.id, [(pen.id, 1)]).id


def _load(state, execution_id):
    with FakeUnitOfWork(state) as uow:
        return uow.executions.resolve_by_id(execution_id)


def _store(state, execution):
    with FakeUnitOfWork(state) as uow:
        stored = uow.executions.store(execution)
        uow.commit()
        return stored


class TestOptimisticLock:
    def test_new_execution_starts_at_version_zero_and_store_bumps(self, container, order_id, state):
        e = container.execution_service().start(order_id)
        assert e.version == 0
        done = container.execution_service().complete(e.id, [new_id()])
        assert done.version == 1
        assert _load(state, e.id).version == 1

    def test_stale_copy_conflicts(self, container, order_id, state):
        e = container.execution_service().start(order_id)
        first, second = _load(state, e.id), _load(state, e.id)
        first.complete([])
        assert _store(state, first).version == 1
        second.fail("x")
        with pytest.raises(ConcurrentUpdateError) as ei:
            _store(state, second)
        assert ei.value.code == "execution_concurrent_update"
        assert _load(state, e.id).status == "done"

    def test_conflict_is_detected_between_open_units_of_work(self, container, order_id, state):
        # 2 つの UoW が同じ版を読み、先にコミットした側だけが通る
        e = container.execution_service().start(order_id)
        with FakeUnitOfWork(state) as a, FakeUnitOfWork(state) as b:
            ea, eb = a.executions.resolve_by_id(e.id), b.executions.resolve_by_id(e.id)
            ea.complete([])
            a.executions.store(ea)
            a.commit()
            eb.fail("x")
            with pytest.raises(ConcurrentUpdateError):
                b.executions.store(eb)

    def test_unchanged_store_still_bumps_and_conflicts_with_stale_copy(
        self, container, order_id, state
    ):
        e = container.execution_service().start(order_id)
        stale = _load(state, e.id)
        fresh = _load(state, e.id)
        assert _store(state, fresh).version == 1  # 変更なしでも版は上がる
        with pytest.raises(ConcurrentUpdateError):
            _store(state, stale)

    def test_idempotent_complete_bumps_version(self, container, order_id):
        svc = container.execution_service()
        e = svc.start(order_id)
        ids = [new_id()]
        assert svc.complete(e.id, ids).version == 1
        assert svc.complete(e.id, ids).version == 2


class TestConstraints:
    def test_check_stock_negative(self, container):
        with FakeUnitOfWork(InMemoryState()) as uow:
            with pytest.raises(BusinessRuleError) as ei:
                uow.products.store(Product(id=None, name="x", price=1, stock=-1))
        assert ei.value.code == "product_stock_negative"

    def test_check_order_line_quantity(self, container):
        with FakeUnitOfWork(InMemoryState()) as uow:
            with pytest.raises(InputError) as ei:
                uow.orders.store(Order(id=None, user_id=1, lines=[OrderLine(1, 0, 10)]))
        assert ei.value.code == "order_line_quantity_invalid"

    def test_duplicate_email_via_store(self, state):
        with FakeUnitOfWork(state) as uow:
            uow.users.store(User(id=None, email="a@example.com", name="A"))
            with pytest.raises(BusinessRuleError) as ei:
                uow.users.store(User(id=None, email="a@example.com", name="B"))
        assert ei.value.code == "user_email_taken"

    def test_store_if_absent_returns_existing(self, state):
        with FakeUnitOfWork(state) as uow:
            first = uow.users.store_if_absent(User(id=None, email="a@example.com", name="A"))
            again = uow.users.store_if_absent(User(id=None, email="a@example.com", name="B"))
        assert again.id == first.id

    def test_second_running_execution_for_same_order(self, container, order_id):
        svc = container.execution_service()
        svc.start(order_id)
        with pytest.raises(BusinessRuleError) as ei:
            svc.start(order_id)
        assert ei.value.code == "execution_already_running"

    @pytest.mark.parametrize("finish", ["complete", "fail"])
    def test_new_start_is_allowed_after_finish(self, container, order_id, finish):
        svc = container.execution_service()
        first = svc.start(order_id)
        if finish == "complete":
            svc.complete(first.id, [new_id()])
        else:
            svc.fail(first.id, "boom")
        assert svc.start(order_id).id != first.id

    def test_running_executions_of_different_orders_are_independent(self, state):
        with FakeUnitOfWork(state) as uow:
            uow.executions.store(Execution(id=new_id(), order_id=1))
            uow.executions.store(Execution(id=new_id(), order_id=2))
