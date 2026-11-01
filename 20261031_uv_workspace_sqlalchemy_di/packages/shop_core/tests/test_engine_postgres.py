"""Engine の注入、接続ごとの資格情報、ロールの検査。TEST_DATABASE_URL がなければ skip"""

import os

import psycopg
import pytest
from dependency_injector import providers
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from shop_core import Container, SettingsError
from shop_core.infra.db import assert_app_role, make_engine
from shop_core.infra.orm import Base
from shop_core.infra.schema import SCHEMA

pytestmark = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


@pytest.fixture
def admin(pg_url):
    engine = create_engine(pg_url, isolation_level="AUTOCOMMIT")
    yield engine
    engine.dispose()


@pytest.fixture
def role(admin):
    """ロールを作って、終わりに必ず消す。作れない環境では skip"""
    created: list[str] = []

    def create(name: str, password: str, *, grant_schema: bool = True) -> None:
        try:
            with admin.connect() as conn:
                conn.execute(text(f"drop role if exists {name}"))
                conn.execute(text(f"create role {name} login password '{password}'"))
        except Exception as exc:  # 権限がない環境
            pytest.skip(f"cannot create roles: {exc}")
        created.append(name)
        if grant_schema:
            with admin.connect() as conn:
                conn.execute(text(f"create schema if not exists {SCHEMA}"))
                conn.execute(text(f"grant usage on schema {SCHEMA} to {name}"))

    yield create
    with admin.connect() as conn:
        for name in created:
            conn.execute(text(f"drop owned by {name}"))
            conn.execute(text(f"drop role if exists {name}"))


def test_container_uses_injected_engine_factory(pg_url, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    calls = []

    def factory():
        calls.append(1)
        return make_engine(pg_url)

    c = Container(engine_factory=providers.Object(factory))
    try:
        with c.engine().begin() as conn:
            conn.execute(text(f"create schema if not exists {SCHEMA}"))
        Base.metadata.create_all(c.engine())
        user = c.user_service().register("a@example.com", "A")
        assert c.user_service().get(user.id).email == "a@example.com"
        with c.db().connect() as conn:
            assert conn.scalar(text("select count(*) from users")) == 1
        assert calls == [1]  # Singleton なので 1 回だけ
    finally:
        c.engine().dispose()


def test_assert_app_role_rejects_superuser(pg_url, admin):
    with admin.connect() as conn:
        conn.execute(text(f"create schema if not exists {SCHEMA}"))
    engine = make_engine(pg_url)
    try:
        with pytest.raises(SettingsError):
            assert_app_role(engine)
    finally:
        engine.dispose()


def test_assert_app_role_accepts_role_without_create(pg_url, role):
    role("app_ro_test", "pw")
    url = make_url(pg_url).set(username="app_ro_test", password="pw")
    engine = make_engine(url.render_as_string(hide_password=False))
    try:
        assert_app_role(engine)
    finally:
        engine.dispose()


def test_credentials_refetched_once_after_rotation(pg_url, admin, role):
    role("rot_test", "p1")
    calls: list[int] = []
    passwords = iter(["p1"])  # 最初の取得

    def credentials():
        calls.append(1)
        return "rot_test", next(passwords)

    engine = make_engine(pg_url, credentials=credentials, pool_size=2)
    try:
        with engine.connect() as conn:
            assert conn.scalar(text("select current_user")) == "rot_test"
        assert len(calls) == 1

        # ローテーション。プールの接続は捨て、次の接続は古い資格情報(p1)から試す
        with admin.connect() as conn:
            conn.execute(text("alter role rot_test password 'p2'"))
        engine.dispose()
        calls.clear()
        passwords = iter(["p1", "p2"])

        with engine.connect() as conn:
            assert conn.scalar(text("select current_user")) == "rot_test"
        assert len(calls) == 2
    finally:
        engine.dispose()


def test_credentials_other_errors_are_not_retried(pg_url, role):
    role("rot_test", "p1")
    calls: list[int] = []

    def credentials():
        calls.append(1)
        return "no_such_role", "x"

    engine = make_engine(pg_url, credentials=credentials)
    try:
        with pytest.raises(Exception) as ei:
            engine.connect()
        # 存在しないロールも 28P01(パスワード認証失敗)で返ってくるので、2 回呼ばれて失敗する
        assert isinstance(ei.value.orig, psycopg.OperationalError)
        assert len(calls) == 2
    finally:
        engine.dispose()
