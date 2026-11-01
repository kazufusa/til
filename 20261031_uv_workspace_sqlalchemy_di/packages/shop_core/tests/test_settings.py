"""接続設定の解決。環境変数は初めて DB を使うときに読む"""

import pytest

from shop_core import Container, Settings, SettingsError
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
