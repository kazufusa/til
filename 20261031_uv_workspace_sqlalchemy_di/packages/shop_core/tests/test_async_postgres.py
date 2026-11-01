"""transaction_async() を本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import asyncio
import os
import time

import pytest
from sqlalchemy import text

pytestmark = [
    pytest.mark.anyio,
    pytest.mark.skipif("TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"),
]


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _count(c, sql):
    with c.engine().connect() as conn:
        return conn.scalar(text(sql))


_INSERT_PEN = text("insert into products (name, price, stock) values ('pen', 100, 5)")


async def test_run_and_execute_share_one_transaction(pg_container):
    c = pg_container
    async with c.transaction_async() as tx:
        await tx.run(c.user_service().register, "a@example.com", "A")
        await tx.execute(_INSERT_PEN)
        await tx.flush()
        # 別の接続からはまだ何も見えない
        assert _count(c, "select count(*) from users") == 0
        assert _count(c, "select count(*) from products") == 0
    assert _count(c, "select count(*) from users") == 1
    assert _count(c, "select count(*) from products") == 1


async def test_exception_rolls_back(pg_container):
    c = pg_container
    with pytest.raises(RuntimeError):
        async with c.transaction_async() as tx:
            await tx.run(c.user_service().register, "a@example.com", "A")
            await tx.execute(_INSERT_PEN)
            raise RuntimeError
    assert _count(c, "select count(*) from users") == 0
    assert _count(c, "select count(*) from products") == 0


async def test_nested_scope_uses_savepoint(pg_container):
    c = pg_container
    async with c.transaction_async() as tx:
        await tx.run(c.user_service().register, "a@example.com", "A")
        with pytest.raises(RuntimeError):
            async with c.transaction_async() as inner:
                await inner.run(c.user_service().register, "b@example.com", "B")
                raise RuntimeError
        async with c.transaction_async() as inner:
            await inner.run(c.user_service().register, "c@example.com", "C")
        assert _count(c, "select count(*) from users") == 0
    emails = sorted(u.email for u in c.user_service().list())
    assert emails == ["a@example.com", "c@example.com"]


async def test_sync_service_after_scope_is_not_ambient(pg_container):
    c = pg_container
    async with c.transaction_async():
        pass
    # スコープを抜けたあとは、メソッドごとに commit される
    c.user_service().register("a@example.com", "A")
    assert _count(c, "select count(*) from users") == 1


async def test_event_loop_is_not_blocked(pg_container):
    c = pg_container
    ticks = 0

    async def ticker():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    task = asyncio.create_task(ticker())
    try:
        async with c.transaction_async() as tx:
            start = time.monotonic()
            await tx.run(lambda: tx.session.execute(text("select pg_sleep(0.5)")))
            assert time.monotonic() - start >= 0.5
            during = ticks
    finally:
        task.cancel()
    assert during > 10
