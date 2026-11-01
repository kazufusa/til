"""コンポジションルート。検証と組み立てはフェイクで、起動時の検査は Postgres と S3 で確かめる。

Postgres は TEST_DATABASE_URL、S3 は TEST_S3_ENDPOINT_URL がなければ skip
"""

import os
import uuid
from dataclasses import replace

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ProgrammingError

from shop_core import (
    ArtifactStoreError,
    DependencyError,
    Settings,
    SettingsError,
    build_container,
    check_database,
    check_image_store,
    validate_environment,
)
from shop_core.infra.schema import HEAD_REVISION, SCHEMA
from shop_core.testing import InMemoryEventPublisher

from conftest import migrate_to_head

URL = "postgresql+psycopg://u:p@localhost:5432/shop"

needs_pg = pytest.mark.skipif("TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set")
S3_ENDPOINT = os.environ.get("TEST_S3_ENDPOINT_URL")
needs_s3 = pytest.mark.skipif(S3_ENDPOINT is None, reason="TEST_S3_ENDPOINT_URL not set")


def _settings(**kw) -> Settings:
    return replace(Settings(database_url=URL), **kw)


# --- validate_environment と build_container(DB も S3 も使わない) ---


def test_valid_settings_pass():
    assert validate_environment(_settings()) is None
    for env in ("local", "stg", "prd"):
        validate_environment(_settings(env=env))


@pytest.mark.parametrize(
    "kw",
    [
        {"env": "dev"},
        {"env": ""},
        {"pool_size": 0},
        {"max_overflow": -1},
        {"artifact_bucket": ""},
        {"database_url": "postgresql+psycopg://u:p@localhost:5432"},
        {"database_url": "postgresql+psycopg://u:p@localhost:5432/"},
        {"database_url": "not a url"},
    ],
)
def test_invalid_settings_raise(kw):
    with pytest.raises(SettingsError):
        validate_environment(_settings(**kw))


def test_build_container_does_not_connect():
    def credentials():
        raise AssertionError("credentials must not be called by build_container")

    container = build_container(_settings(), credentials=credentials)
    container.engine()  # Engine は作るが接続はしない
    assert container.user_service() is not None
    container.engine().dispose()


def test_build_container_validates():
    with pytest.raises(SettingsError):
        build_container(_settings(env="dev"))


def test_build_container_with_settings_never_reads_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    container = build_container(_settings())
    assert container.settings().database_url == URL
    # Engine を作っても(接続はしない)環境変数は要らない
    assert make_url(str(container.engine().url)).database == "shop"
    container.engine().dispose()


def test_build_container_reads_env_when_settings_omitted(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", URL)
    monkeypatch.setenv("ENV", "stg")
    container = build_container(publisher=InMemoryEventPublisher())
    assert container.settings().env == "stg"
    assert container.settings().artifact_bucket == "shop-stg-artifacts"


def test_publisher_is_required_outside_local():
    for env in ("stg", "prd"):
        with pytest.raises(SettingsError, match="event publisher must be configured outside local"):
            build_container(_settings(env=env))


def test_publisher_is_optional_in_local_and_defaults_to_logging():
    from shop_core import LoggingEventPublisher

    container = build_container(_settings(env="local"))
    assert isinstance(container.event_publisher(), LoggingEventPublisher)


def test_given_publisher_is_used_in_every_env():
    for env in ("local", "stg", "prd"):
        publisher = InMemoryEventPublisher()
        container = build_container(_settings(env=env), publisher=publisher)
        assert container.event_publisher() is publisher


def test_given_publisher_receives_the_events_of_a_commit():
    from shop_core.testing import FakeUnitOfWork, InMemoryState

    publisher = InMemoryEventPublisher()
    container = build_container(_settings(env="prd"), publisher=publisher)
    # uow だけをフェイクにして、publisher は渡したものを使う
    state = InMemoryState()

    with container.override(uow=lambda: FakeUnitOfWork(state, publisher=container.event_publisher())):
        container.user_service().register("a@example.com", "A")
    assert [e.email for e in publisher.published] == ["a@example.com"]


def test_build_container_fails_without_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(SettingsError):
        build_container()


def test_import_has_no_side_effects(monkeypatch):
    """import だけでは環境変数を読まず、Container も作らない"""
    import subprocess
    import sys

    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
    subprocess.run([sys.executable, "-c", "import shop_core"], env=env, check=True)


# --- check_database(Postgres) ---


@pytest.fixture
def app_role(pg_url):
    """CREATE を持たないロール。作れない環境では skip。終わりに必ず消す"""
    admin = create_engine(pg_url, isolation_level="AUTOCOMMIT")
    name = "boot_app_test"
    try:
        with admin.connect() as conn:
            conn.execute(text(f"drop role if exists {name}"))
            conn.execute(text(f"create role {name} login password 'pw'"))
            conn.execute(text(f"create schema if not exists {SCHEMA}"))
            conn.execute(text(f"grant usage on schema {SCHEMA} to {name}"))
    except Exception as exc:
        admin.dispose()
        pytest.skip(f"cannot create roles: {exc}")
    yield make_url(pg_url).set(username=name, password="pw").render_as_string(hide_password=False)
    with admin.connect() as conn:
        conn.execute(text(f"drop owned by {name}"))
        conn.execute(text(f"drop role if exists {name}"))
    admin.dispose()


@pytest.fixture
def schema_exists(pg_url):
    engine = create_engine(pg_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(text(f"create schema if not exists {SCHEMA}"))
    engine.dispose()


@needs_pg
def test_check_database_rejects_owner_role(pg_url, schema_exists):
    container = build_container(Settings(database_url=pg_url))
    try:
        with pytest.raises(SettingsError):
            check_database(container)
    finally:
        container.engine().dispose()


@needs_pg
def test_check_database_accepts_restricted_role(pg_url, app_role):
    # 版の検査があるので、head まで移行した DB で、版の表を読める権限を付ける
    migrate_to_head(pg_url)
    admin = create_engine(pg_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f"grant usage on schema {SCHEMA} to boot_app_test"))
        conn.execute(text(f"grant select on {SCHEMA}.alembic_version to boot_app_test"))
    admin.dispose()
    container = build_container(Settings(database_url=app_role))
    try:
        assert check_database(container) is None
    finally:
        container.engine().dispose()


@needs_pg
def test_check_database_fails_when_unreachable():
    container = build_container(
        Settings(database_url="postgresql+psycopg://u:p@127.0.0.1:1/shop")
    )
    try:
        with pytest.raises(DependencyError) as ei:
            check_database(container)
        assert ei.value.code == "db_unavailable"
    finally:
        container.engine().dispose()


# --- マイグレーション 0006 が付ける shop_app の権限(Postgres) ---


@pytest.fixture
def shop_app_role(pg_url):
    """マイグレーション 0006 が権限を付ける shop_app を作る。既にあるなら触らず skip"""
    admin = create_engine(pg_url, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            if conn.scalar(text("select 1 from pg_roles where rolname = 'shop_app'")):
                pytest.skip("role shop_app already exists in this cluster")
            conn.execute(text("create role shop_app login password 'shop_app'"))
    except pytest.skip.Exception:
        admin.dispose()
        raise
    except Exception as exc:
        admin.dispose()
        pytest.skip(f"cannot create roles: {exc}")
    yield
    with admin.connect() as conn:
        conn.execute(text("drop owned by shop_app"))
        conn.execute(text("drop role if exists shop_app"))
    admin.dispose()


@needs_pg
def test_shop_app_role_can_use_but_not_change_schema(pg_url, shop_app_role):
    migrate_to_head(pg_url)
    app_url = make_url(pg_url).set(username="shop_app", password="shop_app").render_as_string(
        hide_password=False
    )
    container = build_container(Settings(database_url=app_url))
    try:
        check_database(container)  # assert_app_role を通る
        with container.engine().begin() as conn:
            conn.execute(
                text("insert into users (email, name) values ('a@example.com', 'A')")
            )
            assert conn.scalar(text("select count(*) from users")) == 1
        with pytest.raises(ProgrammingError, match="permission denied"):
            with container.engine().begin() as conn:
                conn.execute(text("create table shop.x (id int)"))
        # サービス経由(シーケンスの採番を含む)も通る
        user = container.user_service().register("b@example.com", "B")
        assert user.id > 1
        # ビューには書き込めない(0007 が INSERT / UPDATE / DELETE を取り消す)。SELECT はできる
        with container.engine().connect() as conn:
            assert conn.scalar(text("select count(*) from v_product_stock")) == 0
        with pytest.raises(ProgrammingError, match="permission denied"):
            with container.engine().begin() as conn:
                conn.execute(
                    text("insert into v_product_stock (product_id, name, price, stock) "
                         "values (99, 'x', 1, 1)")
                )
    finally:
        container.engine().dispose()


@needs_pg
def test_migrations_pass_without_shop_app_role(pg_url):
    """ロールがない環境(テスト用 DB)でも 0006 は通る"""
    migrate_to_head(pg_url)
    engine = create_engine(pg_url)
    try:
        with engine.connect() as conn:
            assert conn.scalar(text("select version_num from shop.alembic_version")) == HEAD_REVISION
    finally:
        engine.dispose()


# --- check_image_store(S3) ---


@needs_s3
def test_check_image_store_passes_after_ensure_bucket():
    settings = Settings(
        database_url=URL,
        artifact_bucket=f"shop-boot-{uuid.uuid4().hex[:12]}",
        s3_endpoint_url=S3_ENDPOINT,
    )
    container = build_container(settings)
    container.image_store().ensure_bucket()
    assert check_image_store(container) is None


@needs_s3
def test_check_image_store_fails_for_missing_bucket():
    settings = Settings(
        database_url=URL,
        artifact_bucket=f"shop-boot-missing-{uuid.uuid4().hex[:12]}",
        s3_endpoint_url=S3_ENDPOINT,
    )
    with pytest.raises(ArtifactStoreError):
        check_image_store(build_container(settings))


def test_check_image_store_fails_for_wrong_endpoint(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "x")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "x")
    container = build_container(_settings(s3_endpoint_url="http://127.0.0.1:1"))
    with pytest.raises(ArtifactStoreError):
        check_image_store(container)


def test_build_container_accepts_engine_factory(monkeypatch):
    """ADR 0002: build_container(engine_factory=...) で Engine の作り方を丸ごと差し込める"""
    from sqlalchemy import create_engine

    monkeypatch.delenv("DATABASE_URL", raising=False)
    settings = Settings(database_url="postgresql+psycopg://u:p@localhost:1/db")
    calls = []

    def factory():
        calls.append(1)
        return create_engine("postgresql+psycopg://u:p@localhost:1/db")

    container = build_container(settings, engine_factory=factory)
    assert calls == []  # build_container は Engine を作らない
    assert container.engine() is container.engine()
    assert calls == [1]


def test_build_container_rejects_engine_factory_with_credentials():
    settings = Settings(database_url="postgresql+psycopg://u:p@localhost:1/db")
    with pytest.raises(SettingsError):
        build_container(settings, engine_factory=lambda: None, credentials=lambda: ("u", "p"))
