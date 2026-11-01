"""手書き DI(shop_core.di)の振る舞い。DB は使わない"""

import threading
import time

import pytest

from shop_core import Container, Settings, build_container
from shop_core.di import ContainerBase, provider


class Sample(ContainerBase):
    def __init__(self) -> None:
        super().__init__()
        self.created = 0

    @provider(singleton=True)
    def slow(self) -> object:
        # 同時に呼ばれたとき、鍵がなければ複数回作られるように遅くする
        self.created += 1
        time.sleep(0.05)
        return object()

    @provider()
    def fresh(self) -> object:
        return object()

    @provider(singleton=True)
    def dependent(self) -> tuple:
        # singleton の作成中に別の singleton を呼んでも固まらない
        return (self.slow(),)

    def not_a_provider(self) -> int:
        return 1


def test_singleton_is_created_once_under_concurrent_threads():
    c = Sample()
    results: list[object] = []
    barrier = threading.Barrier(8)

    def work():
        barrier.wait()
        results.append(c.slow())

    threads = [threading.Thread(target=work) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert c.created == 1
    assert len({id(r) for r in results}) == 1
    assert len(results) == 8


def test_factory_returns_new_object_each_call():
    c = Sample()
    assert c.fresh() is not c.fresh()


def test_singleton_can_call_another_singleton():
    c = Sample()
    assert c.dependent()[0] is c.slow()


def test_override_replaces_and_restores_factory_and_cached_singleton():
    c = Sample()
    original = c.slow()
    marker = object()
    with c.override(slow=lambda: marker, fresh=lambda: marker):
        assert c.slow() is marker
        assert c.fresh() is marker
    assert c.slow() is original
    assert c.fresh() is not marker
    assert c.created == 1


def test_override_nests_and_restores_previous_state():
    c = Sample()
    a, b = object(), object()
    with c.override(fresh=lambda: a):
        with c.override(fresh=lambda: b):
            assert c.fresh() is b
        assert c.fresh() is a
    assert c.fresh() not in (a, b)


def test_override_restores_after_exception():
    c = Sample()
    marker = object()
    with pytest.raises(RuntimeError):
        with c.override(fresh=lambda: marker):
            raise RuntimeError
    assert c.fresh() is not marker


@pytest.mark.parametrize("name", ["missing", "not_a_provider", "_cache"])
def test_override_with_unknown_name_raises_attribute_error(name):
    c = Sample()
    with pytest.raises(AttributeError):
        with c.override(**{name: lambda: None}):
            pass


def test_reset_drops_cached_singletons():
    c = Sample()
    first = c.slow()
    c.reset()
    assert c.slow() is not first


def test_build_container_does_not_read_env_when_settings_is_given(monkeypatch):
    def boom():
        raise AssertionError("Settings.from_env must not be called")

    monkeypatch.setattr(Settings, "from_env", staticmethod(boom))
    container = build_container(Settings(database_url="postgresql+psycopg://u:p@localhost:5432/shop"))
    assert container.settings().database_url.endswith("/shop")


def test_container_keeps_settings_given_by_argument():
    s = Settings(database_url="sqlite://")
    assert Container(s).settings() is s


def test_nested_container_resolves_core_services():
    # アプリのコンテナは核の Container を属性として持つ(app2.AppContainer と同じ形)
    class AppLike(ContainerBase):
        def __init__(self, core: Container) -> None:
            super().__init__()
            self.core = core

        @provider(singleton=True)
        def greeter(self) -> str:
            return f"users: {len(self.core.user_service().list())}"

    from shop_core.testing import InMemoryState, fake_backend

    core = Container()
    app = AppLike(core)
    with fake_backend(core, InMemoryState()):
        assert app.core.user_service().register("a@example.com", "A").id == 1
        assert app.greeter() == "users: 1"
    assert app.core is core
