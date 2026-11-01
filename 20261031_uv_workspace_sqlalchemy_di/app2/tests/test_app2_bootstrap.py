"""app2 のコンポジションルート。DB にも Slack にも接続しない"""

from shop_core import Settings
from shop_core.testing import InMemoryState, fake_backend

from app2.bootstrap import build_app_container


def test_build_app_container_resolves_core_services(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SLACK_BOT_TOKEN", raising=False)
    container = build_app_container(Settings(database_url="postgresql+psycopg://u:p@localhost:5432/shop"))
    core = container.core()
    with fake_backend(core, InMemoryState()):
        assert container.core.user_service().register("a@example.com", "A").id == 1
    assert core.settings().database_url.endswith("/shop")
