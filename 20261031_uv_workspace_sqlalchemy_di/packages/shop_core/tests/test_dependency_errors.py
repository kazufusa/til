"""接続障害とタイムアウトが DependencyError になること。

接続拒否と資格情報の失敗は DB なしで確かめる。残りは TEST_DATABASE_URL がなければ skip
"""

import os
import threading
import time

import pytest
from sqlalchemy import text

from shop_core import Container, DependencyError, Settings
from shop_core.infra.db import make_engine

needs_pg = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)

# 何も待ち受けていないポート
DEAD_URL = "postgresql+psycopg://shop:shop@127.0.0.1:1/shop"


@pytest.fixture
def dead():
    c = Container(Settings(database_url=DEAD_URL, pool_pre_ping=False))
    yield c
    c.engine().dispose()


# --- 接続できない(DB なし) ---


def test_service_call_to_unreachable_db_is_db_unavailable(dead):
    with pytest.raises(DependencyError) as ei:
        dead.user_service().list()
    assert ei.value.code == "db_unavailable"
    assert ei.value.retryable is True


def test_db_connect_to_unreachable_db_is_db_unavailable(dead):
    with pytest.raises(DependencyError) as ei:
        with dead.db().connect():
            pass
    assert ei.value.code == "db_unavailable"


def test_db_autocommit_and_notify_to_unreachable_db_are_db_unavailable(dead):
    with pytest.raises(DependencyError) as ei:
        with dead.db().autocommit():
            pass
    assert ei.value.code == "db_unavailable"
    with pytest.raises(DependencyError):
        dead.db().notify("ch", "x")


def test_transaction_scope_to_unreachable_db_is_db_unavailable(dead):
    with pytest.raises(DependencyError) as ei:
        with dead.transaction() as tx:
            tx.execute(text("select 1"))
    assert ei.value.code == "db_unavailable"


@pytest.mark.anyio
async def test_async_scope_to_unreachable_db_is_db_unavailable(dead):
    with pytest.raises(DependencyError) as ei:
        async with dead.transaction_async() as tx:
            await tx.execute(text("select 1"))
    assert ei.value.code == "db_unavailable"


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_check_database_on_unreachable_db_is_db_unavailable(dead):
    from shop_core import check_database

    with pytest.raises(DependencyError) as ei:
        check_database(dead)
    assert ei.value.code == "db_unavailable"


def test_credentials_that_raise_become_credentials_unavailable():
    def credentials():
        raise RuntimeError("secrets manager is down")

    engine = make_engine(DEAD_URL, credentials=credentials)
    c = Container(engine_factory=lambda: engine)
    try:
        with pytest.raises(DependencyError) as ei:
            c.user_service().list()
        assert ei.value.code == "db_credentials_unavailable"
        assert "secrets manager is down" in ei.value.message
        with pytest.raises(DependencyError) as ei:
            with c.db().connect():
                pass
        assert ei.value.code == "db_credentials_unavailable"
    finally:
        engine.dispose()


# --- 本物の Postgres ---


@pytest.fixture
def tiny_pool_container(pg_url):
    engine = make_engine(pg_url, pool_size=1, max_overflow=0, pool_timeout=0.2)
    c = Container(engine_factory=lambda: engine)
    yield c
    engine.dispose()


@needs_pg
def test_pool_exhaustion_is_db_pool_exhausted(tiny_pool_container):
    c = tiny_pool_container
    with c.engine().connect():  # 唯一の接続を握る
        start = time.monotonic()
        with pytest.raises(DependencyError) as ei:
            c.user_service().list()
        assert time.monotonic() - start < 3
    assert ei.value.code == "db_pool_exhausted"


@needs_pg
def test_pool_exhaustion_in_transaction_scope_and_db(tiny_pool_container):
    c = tiny_pool_container
    with c.engine().connect():
        with pytest.raises(DependencyError) as ei:
            with c.transaction() as tx:
                tx.execute(text("select 1"))
        assert ei.value.code == "db_pool_exhausted"
        with pytest.raises(DependencyError) as ei:
            with c.db().connect():
                pass
        assert ei.value.code == "db_pool_exhausted"


@needs_pg
@pytest.mark.anyio
async def test_pool_exhaustion_in_async_scope(tiny_pool_container):
    c = tiny_pool_container
    with c.engine().connect():
        with pytest.raises(DependencyError) as ei:
            async with c.transaction_async() as tx:
                await tx.execute(text("select 1"))
        assert ei.value.code == "db_pool_exhausted"


@needs_pg
def test_statement_timeout_is_db_statement_timeout(pg_container):
    with pytest.raises(DependencyError) as ei:
        with pg_container.transaction() as tx:
            tx.execute(text("SET LOCAL statement_timeout = 100"))
            tx.execute(text("select pg_sleep(1)"))
    assert ei.value.code == "db_statement_timeout"


@needs_pg
def test_statement_timeout_setting_reaches_the_connection(pg_url):
    c = Container(Settings(database_url=pg_url, statement_timeout_ms=150, lock_timeout_ms=70))
    try:
        with c.db().connect() as conn:
            assert conn.scalar(text("show statement_timeout")) == "150ms"
            assert conn.scalar(text("show lock_timeout")) == "70ms"
            assert conn.scalar(text("show search_path")) == "shop"
        with pytest.raises(DependencyError) as ei:
            with c.db().connect() as conn:
                conn.execute(text("select pg_sleep(1)"))
        assert ei.value.code == "db_statement_timeout"
    finally:
        c.engine().dispose()


@needs_pg
def test_timeouts_default_to_unlimited(pg_url):
    c = Container(Settings(database_url=pg_url))
    try:
        with c.db().connect() as conn:
            assert conn.scalar(text("show statement_timeout")) == "0"
            assert conn.scalar(text("show lock_timeout")) == "0"
    finally:
        c.engine().dispose()


@needs_pg
def test_lock_timeout_is_db_lock_timeout_when_two_connections_contend(pg_url, pg_container):
    pg_container.product_service().add("pen", 100, 5)
    c = Container(Settings(database_url=pg_url, lock_timeout_ms=200))
    lock = text("select id from products where id = 1 for update")
    errors: list[BaseException] = []

    def other():
        try:
            with c.transaction() as tx:
                tx.execute(lock)
        except BaseException as e:  # noqa: BLE001
            errors.append(e)

    try:
        with pg_container.transaction() as tx:
            tx.execute(lock)  # 行ロックを握ったまま
            t = threading.Thread(target=other)
            t.start()
            t.join(10)
        assert len(errors) == 1
        assert isinstance(errors[0], DependencyError)
        assert errors[0].code == "db_lock_timeout"
    finally:
        c.engine().dispose()
