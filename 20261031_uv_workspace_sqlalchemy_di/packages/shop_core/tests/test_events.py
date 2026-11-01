"""ドメインイベントの発行。フェイクと本物の Postgres で同じシナリオを流す。

Postgres 側は TEST_DATABASE_URL がなければ skip する。
"""

import os
from datetime import UTC, timedelta

import pytest

from shop_core import (
    Container,
    DomainError,
    EventPublishError,
    ExecutionCompleted,
    ExecutionFailed,
    ExecutionStarted,
    InsufficientStockError,
    OrderPlaced,
    UserRegistered,
    new_id,
)
from shop_core.domain.events import DomainEvent
from shop_core.testing import InMemoryEventPublisher, InMemoryState, fake_backend


@pytest.fixture(params=["fake", "postgres"])
def kit(request):
    """container と、イベントの送り先(published を持つ)の組"""
    if request.param == "fake":
        state = InMemoryState()
        c = Container()
        with fake_backend(c, state):
            yield c, state.events
        return
    if "TEST_DATABASE_URL" not in os.environ:
        pytest.skip("TEST_DATABASE_URL not set")
    c = request.getfixturevalue("pg_container")
    pub = InMemoryEventPublisher()
    with c.override(event_publisher=lambda: pub):
        yield c, pub


@pytest.fixture
def anyio_backend():
    return "asyncio"


class ExplodingPublisher:
    def publish(self, events):
        raise ConnectionError("broker down")


def _names(pub):
    return [type(e).__name__ for e in pub.published]


def _seed(c, pub):
    """利用者、商品、注文を作って、イベントは捨てる"""
    user = c.user_service().register("seed@example.com", "Seed")
    pen = c.product_service().add("pen", 100, 10)
    order = c.order_service().place(user.id, [(pen.id, 2)])
    pub.published.clear()
    return user, pen, order


def test_each_service_publishes_after_commit(kit):
    c, pub = kit
    user = c.user_service().register("a@example.com", "A")
    pen = c.product_service().add("pen", 100, 10)
    order = c.order_service().place(user.id, [(pen.id, 2), (pen.id, 1)])
    ex = c.execution_service().start(order.id)
    imgs = [new_id(), new_id()]
    c.execution_service().complete(ex.id, imgs)
    ex2 = c.execution_service().start(order.id)
    c.execution_service().fail(ex2.id, "boom")

    assert _names(pub) == [
        "UserRegistered",
        "OrderPlaced",
        "ExecutionStarted",
        "ExecutionCompleted",
        "ExecutionStarted",
        "ExecutionFailed",
    ]
    registered, placed, started, completed, _, failed = pub.published
    assert registered == UserRegistered(
        event_id=registered.event_id, occurred_at=registered.occurred_at, user_id=user.id, email="a@example.com"
    )
    assert placed.order_id == order.id and placed.user_id == user.id and placed.total == 300
    assert started.execution_id == ex.id and started.order_id == order.id
    assert completed.execution_id == ex.id and completed.image_ids == tuple(imgs)
    assert failed.execution_id == ex2.id and failed.reason == "boom"


def test_register_existing_email_publishes_nothing(kit):
    c, pub = kit
    c.user_service().register("a@example.com", "A")
    pub.published.clear()
    c.user_service().register("a@example.com", "A")
    assert pub.published == []


def test_failing_service_publishes_nothing(kit):
    c, pub = kit
    user, pen, _ = _seed(c, pub)
    with pytest.raises(InsufficientStockError):
        c.order_service().place(user.id, [(pen.id, 999)])
    assert pub.published == []


def test_idempotent_complete_publishes_no_event(kit):
    c, pub = kit
    _, _, order = _seed(c, pub)
    ex = c.execution_service().start(order.id)
    imgs = [new_id()]
    c.execution_service().complete(ex.id, imgs)
    pub.published.clear()
    c.execution_service().complete(ex.id, imgs)
    assert pub.published == []


def test_idempotent_fail_publishes_no_event(kit):
    c, pub = kit
    _, _, order = _seed(c, pub)
    ex = c.execution_service().start(order.id)
    c.execution_service().fail(ex.id, "x")
    pub.published.clear()
    c.execution_service().fail(ex.id, "x")
    assert pub.published == []


def test_scope_publishes_in_order_only_at_exit(kit):
    c, pub = kit
    with c.transaction():
        user = c.user_service().register("a@example.com", "A")
        pen = c.product_service().add("pen", 100, 10)
        c.order_service().place(user.id, [(pen.id, 1)])
        assert pub.published == []
    assert _names(pub) == ["UserRegistered", "OrderPlaced"]


def test_scope_that_raises_publishes_nothing(kit):
    c, pub = kit
    with pytest.raises(RuntimeError):
        with c.transaction():
            c.user_service().register("a@example.com", "A")
            raise RuntimeError
    assert pub.published == []


def test_caught_exception_drops_that_services_events_only(kit):
    c, pub = kit
    with c.transaction():
        c.user_service().register("a@example.com", "A")
        try:
            # イベントを足したあと、commit しないまま例外で抜ける(SAVEPOINT が戻る)
            with c.uow() as uow:
                uow.events.add(UserRegistered(user_id=999, email="dropped@example.com"))
                raise RuntimeError
        except RuntimeError:
            pass
        with c.uow() as uow:
            # commit なしで抜けたときも捨てる
            uow.events.add(UserRegistered(user_id=998, email="dropped2@example.com"))
        c.user_service().register("b@example.com", "B")
    assert [e.email for e in pub.published] == ["a@example.com", "b@example.com"]


def test_nested_scope_that_raises_drops_its_events(kit):
    c, pub = kit
    with c.transaction():
        c.user_service().register("a@example.com", "A")
        try:
            with c.transaction():
                c.user_service().register("b@example.com", "B")
                raise RuntimeError
        except RuntimeError:
            pass
        c.user_service().register("c@example.com", "C")
    assert [e.email for e in pub.published] == ["a@example.com", "c@example.com"]


def test_nested_scope_success_hands_events_to_parent(kit):
    c, pub = kit
    with c.transaction():
        c.user_service().register("a@example.com", "A")
        with c.transaction():
            c.user_service().register("b@example.com", "B")
            with c.transaction():
                c.user_service().register("c@example.com", "C")
        assert pub.published == []
    assert [e.email for e in pub.published] == ["a@example.com", "b@example.com", "c@example.com"]


def test_publisher_error_after_commit_keeps_data_and_propagates(kit):
    c, pub = kit
    with c.override(event_publisher=lambda: ExplodingPublisher()):
        with pytest.raises(EventPublishError) as ei:
            c.user_service().register("a@example.com", "A")
    # 元の例外は __cause__、送れなかった束は events。DomainError ではない
    assert isinstance(ei.value.__cause__, ConnectionError)
    assert [type(e).__name__ for e in ei.value.events] == ["UserRegistered"]
    assert not isinstance(ei.value, DomainError)
    assert [u.email for u in c.user_service().list()] == ["a@example.com"]


def test_publisher_error_at_scope_exit_keeps_data_and_propagates(kit):
    c, pub = kit
    with c.override(event_publisher=lambda: ExplodingPublisher()):
        with pytest.raises(EventPublishError):
            with c.transaction():
                c.user_service().register("a@example.com", "A")
                c.user_service().register("b@example.com", "B")
    assert [u.email for u in c.user_service().list()] == ["a@example.com", "b@example.com"]


def test_scope_is_reusable_after_publisher_error(kit):
    c, pub = kit
    with c.override(event_publisher=lambda: ExplodingPublisher()):
        with pytest.raises(EventPublishError):
            with c.transaction():
                c.user_service().register("a@example.com", "A")
    # 失敗したスコープのイベントが次のスコープに残らない
    with c.transaction():
        c.user_service().register("b@example.com", "B")
    assert [e.email for e in pub.published] == ["b@example.com"]


def test_event_ids_differ_and_occurred_at_is_utc(kit):
    c, pub = kit
    with c.transaction():
        c.user_service().register("a@example.com", "A")
        c.user_service().register("b@example.com", "B")
    first, second = pub.published
    assert first.event_id != second.event_id
    for e in pub.published:
        assert e.occurred_at.tzinfo is not None
        assert e.occurred_at.utcoffset() == timedelta(0)
        assert e.occurred_at.tzinfo == UTC


def test_domain_event_base_is_frozen():
    e = DomainEvent()
    with pytest.raises(AttributeError):
        e.event_id = new_id()  # type: ignore[misc]


@pytest.mark.anyio
async def test_async_scope_publishes_after_exit(kit):
    c, pub = kit
    async with c.transaction_async() as tx:
        await tx.run(c.user_service().register, "a@example.com", "A")
        await tx.run(c.user_service().register, "b@example.com", "B")
        assert pub.published == []
    assert [e.email for e in pub.published] == ["a@example.com", "b@example.com"]


@pytest.mark.anyio
async def test_async_scope_that_raises_publishes_nothing(kit):
    c, pub = kit
    with pytest.raises(RuntimeError):
        async with c.transaction_async() as tx:
            await tx.run(c.user_service().register, "a@example.com", "A")
            raise RuntimeError
    assert pub.published == []


@pytest.mark.anyio
async def test_async_nested_scope_drops_failed_events(kit):
    c, pub = kit
    async with c.transaction_async() as tx:
        await tx.run(c.user_service().register, "a@example.com", "A")
        with pytest.raises(RuntimeError):
            async with c.transaction_async() as inner:
                await inner.run(c.user_service().register, "b@example.com", "B")
                raise RuntimeError
        async with c.transaction_async() as inner:
            await inner.run(c.user_service().register, "c@example.com", "C")
        assert pub.published == []
    assert [e.email for e in pub.published] == ["a@example.com", "c@example.com"]


@pytest.mark.anyio
async def test_async_publisher_error_keeps_data_and_propagates(kit):
    c, pub = kit
    with c.override(event_publisher=lambda: ExplodingPublisher()):
        with pytest.raises(EventPublishError):
            async with c.transaction_async() as tx:
                await tx.run(c.user_service().register, "a@example.com", "A")
    assert [u.email for u in c.user_service().list()] == ["a@example.com"]
