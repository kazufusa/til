"""接続設定の解決。環境変数は初めて DB を使うときに読む"""

import pytest

from shop_core import Container, Execution, Settings, SettingsError, new_id
from shop_core.testing import InMemoryState, fake_backend


def test_from_env_requires_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(SettingsError, match="DATABASE_URL"):
        Settings.from_env()


def test_from_env_reads_url_and_echo(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.setenv("SQL_ECHO", "True")
    assert Settings.from_env() == Settings(database_url="sqlite://", echo=True)


def test_echo_defaults_to_false(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.delenv("SQL_ECHO", raising=False)
    assert Settings.from_env().echo is False


def test_fake_backend_does_not_need_env(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    container = Container()
    with fake_backend(container, InMemoryState()):
        user = container.user_service().register("a@example.com", "A")
    assert user.id is not None


def test_engine_without_env_raises(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(SettingsError):
        Container().engine()


_POOL_ENV = ("DB_POOL_SIZE", "DB_MAX_OVERFLOW", "DB_POOL_TIMEOUT", "DB_POOL_RECYCLE", "DB_POOL_PRE_PING")


def test_pool_defaults_when_env_unset(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    for name in _POOL_ENV:
        monkeypatch.delenv(name, raising=False)
    s = Settings.from_env()
    assert (s.pool_size, s.max_overflow, s.pool_timeout, s.pool_recycle, s.pool_pre_ping) == (
        5, 10, 30.0, -1, True
    )


def test_pool_env_is_parsed(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.setenv("DB_POOL_SIZE", "2")
    monkeypatch.setenv("DB_MAX_OVERFLOW", "0")
    monkeypatch.setenv("DB_POOL_TIMEOUT", "1.5")
    monkeypatch.setenv("DB_POOL_RECYCLE", "1800")
    monkeypatch.setenv("DB_POOL_PRE_PING", "false")
    s = Settings.from_env()
    assert (s.pool_size, s.max_overflow, s.pool_timeout, s.pool_recycle, s.pool_pre_ping) == (
        2, 0, 1.5, 1800, False
    )


def test_invalid_pool_size_names_variable(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.setenv("DB_POOL_SIZE", "abc")
    with pytest.raises(SettingsError, match="DB_POOL_SIZE"):
        Settings.from_env()


_S3_ENV = ("ENV", "ARTIFACT_BUCKET", "S3_ENDPOINT_URL", "S3_PUBLIC_ENDPOINT_URL", "AWS_REGION")


def test_s3_defaults(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    for name in _S3_ENV:
        monkeypatch.delenv(name, raising=False)
    s = Settings.from_env()
    assert (s.env, s.artifact_bucket, s.s3_endpoint_url, s.s3_region) == (
        "local", "shop-local-artifacts", None, "ap-northeast-1"
    )


def test_bucket_derives_from_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.delenv("ARTIFACT_BUCKET", raising=False)
    monkeypatch.setenv("ENV", "prod")
    assert Settings.from_env().artifact_bucket == "shop-prod-artifacts"


def test_s3_env_overrides(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.setenv("ENV", "dev")
    monkeypatch.setenv("ARTIFACT_BUCKET", "custom")
    monkeypatch.setenv("S3_ENDPOINT_URL", "http://minio:9000")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    s = Settings.from_env()
    assert (s.env, s.artifact_bucket, s.s3_endpoint_url, s.s3_region) == (
        "dev", "custom", "http://minio:9000", "us-east-1"
    )


def test_image_store_is_overridden_by_fake_without_env(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    container = Container()
    with fake_backend(container, InMemoryState()):
        assert container.image_store() is not None


def test_s3_public_endpoint_defaults_to_none_and_reads_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    for name in _S3_ENV:
        monkeypatch.delenv(name, raising=False)
    assert Settings.from_env().s3_public_endpoint_url is None
    monkeypatch.setenv("S3_PUBLIC_ENDPOINT_URL", "http://localhost:9000")
    assert Settings.from_env().s3_public_endpoint_url == "http://localhost:9000"
    monkeypatch.setenv("S3_PUBLIC_ENDPOINT_URL", "  ")
    assert Settings.from_env().s3_public_endpoint_url is None


def test_container_passes_public_endpoint_to_image_store(monkeypatch):
    settings = Settings(
        database_url="sqlite://",
        s3_endpoint_url="http://s3:9090",
        s3_public_endpoint_url="http://localhost:9000",
    )
    container = Container(settings)
    url = container.image_store().presigned_get_url(
        Execution(id=new_id(), order_id=1), new_id()
    )
    assert url.startswith("http://localhost:9000/")


def test_timeouts_default_to_zero(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.delenv("DB_STATEMENT_TIMEOUT_MS", raising=False)
    monkeypatch.delenv("DB_LOCK_TIMEOUT_MS", raising=False)
    s = Settings.from_env()
    assert (s.statement_timeout_ms, s.lock_timeout_ms) == (0, 0)


def test_timeouts_are_read_from_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.setenv("DB_STATEMENT_TIMEOUT_MS", "5000")
    monkeypatch.setenv("DB_LOCK_TIMEOUT_MS", "800")
    s = Settings.from_env()
    assert (s.statement_timeout_ms, s.lock_timeout_ms) == (5000, 800)


def test_timeout_must_be_a_number(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.setenv("DB_LOCK_TIMEOUT_MS", "soon")
    with pytest.raises(SettingsError, match="DB_LOCK_TIMEOUT_MS"):
        Settings.from_env()


def test_negative_timeouts_are_rejected():
    from dataclasses import replace

    from shop_core import validate_environment

    base = Settings(database_url="postgresql+psycopg://u:p@localhost:5432/shop")
    for kw in ({"statement_timeout_ms": -1}, {"lock_timeout_ms": -1}):
        with pytest.raises(SettingsError):
            validate_environment(replace(base, **kw))
