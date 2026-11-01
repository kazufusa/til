"""Database を本物の Postgres で検証する。TEST_DATABASE_URL がなければ skip"""

import os
import threading
import time

import pytest
from dependency_injector import providers
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from shop_core import Container, Notification, Settings

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture
def container(pg_container):
    pg_container.product_service().add("pen", 100, 5)
    return pg_container


def _create_notes(container):
    with container.db().connect() as conn:
        conn.execute(text("create schema if not exists app_test"))
        conn.execute(text("create table app_test.notes (id int primary key)"))


def test_connect_commits_and_rolls_back(container):
    _create_notes(container)
    db = container.db()
    with db.connect() as conn:
        conn.execute(text("insert into app_test.notes values (1)"))
    with pytest.raises(RuntimeError):
        with db.connect() as conn:
            conn.execute(text("insert into app_test.notes values (2)"))
            raise RuntimeError
    with db.connect() as conn:
        assert conn.scalars(text("select id from app_test.notes")).all() == [1]


def test_listen_receives_notify(container):
    db = container.db()
    got: list[Notification] = []
    t = threading.Thread(target=lambda: got.extend(db.listen("shop_events", timeout=5)))
    t.start()
    # LISTEN 前の通知は捨てられるので、受け取るまで送り続ける
    for _ in range(40):
        db.notify("shop_events", "hello")
        t.join(0.1)
        if got:
            break
    t.join(10)
    assert got
    assert got[0].channel == "shop_events"
    assert got[0].payload == "hello"


def test_listen_ends_after_timeout(container):
    start = time.monotonic()
    assert list(container.db().listen("quiet", timeout=0.3)) == []
    assert time.monotonic() - start < 3


def test_for_update_in_transaction_locks_row(container):
    # アプリ自身のテーブルの行ロック。基盤のテーブルはサービスの中でロックされる
    _create_notes(container)
    with container.db().connect() as conn:
        conn.execute(text("insert into app_test.notes values (1)"))
    lock = text("select id from app_test.notes where id = 1 for update nowait")
    errors: list[BaseException] = []

    def other():
        try:
            with container.db().connect() as conn:
                conn.execute(lock)
        except BaseException as e:  # noqa: BLE001
            errors.append(e)

    with container.transaction() as tx:
        tx.execute(lock)
        t = threading.Thread(target=other)
        t.start()
        t.join(5)
    assert len(errors) == 1
    assert isinstance(errors[0], OperationalError)

    # スコープを抜ければロックは外れる
    with container.db().connect() as conn:
        conn.execute(lock)


def test_pool_settings_reach_the_pool():
    from sqlalchemy.exc import TimeoutError as PoolTimeout

    c = Container(
        settings=providers.Object(
            Settings(
                database_url=os.environ["TEST_DATABASE_URL"],
                pool_size=2,
                max_overflow=0,
                pool_timeout=0.5,
            )
        )
    )
    try:
        assert c.engine().pool.size() == 2
        db = c.db()
        with db.autocommit(), db.autocommit():
            start = time.monotonic()
            with pytest.raises(PoolTimeout):
                with db.connect():
                    pass
            assert time.monotonic() - start < 3
    finally:
        c.engine().dispose()
