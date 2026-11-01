"""手書きの DI の部品。外部の DI ライブラリは使わない。

使える依存を増やせない環境でも同じ形で書けるよう、ライブラリなしで持つ。
大事なのは仕組みの名前ではなく、次の 4 つの形である。

- 最初に使うまで作らない singleton
- 呼ぶたびに作る factory
- コンテナを属性として持つことによる入れ子
- テストでの差し替え(override)

使い方:

    class Container(ContainerBase):
        @provider(singleton=True)
        def engine(self) -> Engine: ...

        @provider()
        def uow(self) -> UnitOfWork: ...

    with container.override(uow=lambda: FakeUnitOfWork(state=state)):
        ...
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from functools import wraps
from typing import Any

_MARK = "_is_provider"


def provider(*, singleton: bool = False) -> Callable[[Callable[[Any], Any]], Callable[[Any], Any]]:
    """引数のないメソッドをプロバイダにする。

    singleton=True なら初回に 1 度だけ作ってコンテナに保持する(スレッドから同時に呼ばれても 1 度)。
    False なら呼ぶたびに作る。override されている名前は、どちらでも差し替えた関数の結果を返す。
    """

    def decorate(fn: Callable[[Any], Any]) -> Callable[[Any], Any]:
        name = fn.__name__

        @wraps(fn)
        def wrapper(self: ContainerBase) -> Any:
            override = self._overrides.get(name)
            if override is not None:
                return override()
            if not singleton:
                return fn(self)
            if name in self._cache:
                return self._cache[name]
            with self._lock:
                if name not in self._cache:
                    self._cache[name] = fn(self)
                return self._cache[name]

        setattr(wrapper, _MARK, True)
        return wrapper

    return decorate


class ContainerBase:
    """プロバイダを持つコンテナの親。サブクラスは __init__ で super().__init__() を呼ぶ"""

    def __init__(self) -> None:
        self._cache: dict[str, Any] = {}
        self._overrides: dict[str, Callable[[], Any]] = {}
        # singleton の作成中に別の singleton を呼ぶので、再入できる鍵にする
        self._lock = threading.RLock()

    @contextmanager
    def override(self, **factories: Callable[[], Any]) -> Iterator[None]:
        """with の間だけ、名前のプロバイダを factories の関数に差し替える。

        入れ子にでき、抜けると直前の状態に戻る。singleton の保持済みの値は触らないので、
        抜けたあとは元の値がそのまま返る。プロバイダでない名前は AttributeError。
        """
        for name in factories:
            if not getattr(getattr(type(self), name, None), _MARK, False):
                raise AttributeError(f"{type(self).__name__} has no provider {name!r}")
        previous = dict(self._overrides)
        self._overrides.update(factories)
        try:
            yield
        finally:
            self._overrides = previous

    def reset(self) -> None:
        """保持している singleton を捨てる。engine.dispose() のあとで作り直したいときに使う"""
        with self._lock:
            self._cache.clear()
