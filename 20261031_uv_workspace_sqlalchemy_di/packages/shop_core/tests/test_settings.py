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
