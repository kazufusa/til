"""transaction_async() をフェイクで検証する"""

import contextvars

import pytest

from shop_core import Container, run_sync
from shop_core.testing import InMemoryState, fake_backend

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def state():
    return InMemoryState()


@pytest.fixture
def container(state):
    c = Container()
    with fake_backend(c, state):
        yield c


async def test_two_services_commit_together(container, state):
    async with container.transaction_async() as tx:
        await tx.run(container.user_service().register, "a@example.com", "A")
        await tx.run(container.product_service().add, "pen", 100, 5)
        # スコープの中では共有 state に反映されない
        assert not state.users and not state.products
        assert len(tx.state.users) == 1 and len(tx.state.products) == 1
    assert len(state.users) == 1
    assert len(state.products) == 1


async def test_exception_rolls_back_both(container, state):
    with pytest.raises(RuntimeError):
        async with container.transaction_async() as tx:
            await tx.run(container.user_service().register, "a@example.com", "A")
            await tx.run(container.product_service().add, "pen", 100, 5)
            raise RuntimeError
    assert not state.users and not state.products


async def test_nested_scope_failure_is_discarded_but_outer_commits(container, state):
    async with container.transaction_async() as tx:
        await tx.run(container.user_service().register, "a@example.com", "A")
        with pytest.raises(RuntimeError):
            async with container.transaction_async() as inner:
                await inner.run(container.user_service().register, "b@example.com", "B")
                raise RuntimeError
    assert [u.email for u in state.users.values()] == ["a@example.com"]


async def test_scope_is_reset_after_exit(container, state):
    async with container.transaction_async():
        pass
    # スコープの外のサービス呼び出しは、メソッドごとに閉じる
    await run_sync(container.user_service().register, "a@example.com", "A")
    assert len(state.users) == 1


async def test_contextvar_is_propagated_to_worker_thread():
    var: contextvars.ContextVar[str] = contextvars.ContextVar("v", default="none")
    var.set("task")
    assert await run_sync(var.get) == "task"

    # ワーカースレッドでの set はタスク側に戻らない
    await run_sync(var.set, "worker")
    assert var.get() == "task"
