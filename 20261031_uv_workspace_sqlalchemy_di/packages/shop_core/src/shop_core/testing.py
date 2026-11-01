"""アプリチーム向けのフェイク。DB なしでサービスの振る舞いをテストできる

    state = InMemoryState()
    container.uow.override(providers.Factory(FakeUnitOfWork, state=state))

transaction() も含めて差し替えるなら:

    with fake_backend(container, state):
        ...

フェイクの tx は state だけを持つ。tx.session や tx.execute を使う処理は、
関数に切り出して monkeypatch で差し替える。container.db() はフェイクにならない。
"""

from __future__ import annotations

import copy
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import UTC, datetime
from types import TracebackType
from typing import Any, Self

from dependency_injector import providers

from shop_core.domain.models import Order, Product, User


@dataclass
class InMemoryState:
    users: dict[int, User] = field(default_factory=dict)
    products: dict[int, Product] = field(default_factory=dict)
    orders: dict[int, Order] = field(default_factory=dict)
    _seq: int = 0

    def next_id(self) -> int:
        self._seq += 1
        return self._seq


def _snapshot(work: InMemoryState) -> InMemoryState:
    return copy.deepcopy(work)


def _restore(work: InMemoryState, snap: InMemoryState) -> None:
    # 外側のスコープが同じ参照を持っているので、置き換えずに中身を入れ替える
    work.users = snap.users
    work.products = snap.products
    work.orders = snap.orders
    work._seq = snap._seq


_ambient_work: ContextVar[InMemoryState | None] = ContextVar("shop_core_fake_work", default=None)


class _Users:
    def __init__(self, state: InMemoryState) -> None:
        self._st = state

    def store(self, user: User) -> User:
        user.id = self._st.next_id()
        self._st.users[user.id] = copy.deepcopy(user)
        return user

    def resolve_by_id(self, user_id: int) -> User | None:
        u = self._st.users.get(user_id)
        return copy.deepcopy(u) if u else None

    def resolve_by_email(self, email: str) -> User | None:
        return next((copy.deepcopy(u) for u in self._st.users.values() if u.email == email), None)

    def resolve_all(self) -> list[User]:
        return [copy.deepcopy(u) for u in self._st.users.values()]


class _Products:
    def __init__(self, state: InMemoryState) -> None:
        self._st = state

    def store(self, product: Product) -> Product:
        if product.id is None:
            product.id = self._st.next_id()
        elif product.id not in self._st.products:
            raise ValueError(f"product {product.id} is not persisted")
        self._st.products[product.id] = copy.deepcopy(product)
        return product

    def resolve_by_id(self, product_id: int) -> Product | None:
        p = self._st.products.get(product_id)
        return copy.deepcopy(p) if p else None

    resolve_by_id_for_update = resolve_by_id

    def resolve_all(self) -> list[Product]:
        return [copy.deepcopy(p) for p in self._st.products.values()]


class _Orders:
    def __init__(self, state: InMemoryState) -> None:
        self._st = state

    def store(self, order: Order) -> Order:
        order.id = self._st.next_id()
        order.created_at = datetime.now(UTC)
        self._st.orders[order.id] = copy.deepcopy(order)
        return order

    def resolve_by_id(self, order_id: int) -> Order | None:
        o = self._st.orders.get(order_id)
        return copy.deepcopy(o) if o else None

    def resolve_by_user_id(self, user_id: int) -> list[Order]:
        return [copy.deepcopy(o) for o in self._st.orders.values() if o.user_id == user_id]


class FakeUnitOfWork:
    """commit しなければ state に反映しない、という点だけ本物と同じにしてある"""

    def __init__(self, state: InMemoryState) -> None:
        self._shared = state

    def __enter__(self) -> Self:
        ambient = _ambient_work.get()
        self._joined = ambient is not None
        # transaction() の中なら外側の work を直接使う
        self._work = ambient if ambient is not None else copy.deepcopy(self._shared)
        self.users = _Users(self._work)
        self.products = _Products(self._work)
        self.orders = _Orders(self._work)
        self.committed = False
        # 参加したときは入った時点の状態を控えておき、例外や commit() 忘れなら戻す
        self._snap = _snapshot(self._work) if self._joined else None
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._joined and (exc_type is not None or not self.committed):
            self._restore_snapshot()

    def commit(self) -> None:
        if self._joined:
            self.committed = True
            return
        self._shared.users = self._work.users
        self._shared.products = self._work.products
        self._shared.orders = self._work.orders
        self._shared._seq = self._work._seq
        self.committed = True

    def rollback(self) -> None:
        if self._joined:
            self._restore_snapshot()
            return
        self._work = copy.deepcopy(self._shared)

    def _restore_snapshot(self) -> None:
        if self._snap is not None:
            _restore(self._work, self._snap)


class FakeTransaction:
    """session も execute も持たない。state だけを見せる"""

    def __init__(self, state: InMemoryState) -> None:
        self.state = state


class FakeTransactionScope:
    """本物の TransactionScope と同じく、入れ子は外側に参加し、例外なら入れ子の分だけ捨てる"""

    def __init__(self, state: InMemoryState) -> None:
        self._shared = state
        self._cm = self._scope()

    def __enter__(self) -> FakeTransaction:
        return self._cm.__enter__()

    def __exit__(self, *exc: Any) -> bool | None:
        return self._cm.__exit__(*exc)

    @contextmanager
    def _scope(self) -> Iterator[FakeTransaction]:
        outer = _ambient_work.get()
        if outer is not None:
            snap = _snapshot(outer)
            try:
                yield FakeTransaction(outer)
            except BaseException:
                _restore(outer, snap)
                raise
            return
        work = copy.deepcopy(self._shared)
        token = _ambient_work.set(work)
        try:
            yield FakeTransaction(work)
        finally:
            _ambient_work.reset(token)
        # 例外ならここに来ない
        self._shared.users = work.users
        self._shared.products = work.products
        self._shared.orders = work.orders
        self._shared._seq = work._seq


@contextmanager
def fake_backend(container: Any, state: InMemoryState) -> Iterator[None]:
    """uow と transaction を同じ state のフェイクに差し替える"""
    with (
        container.uow.override(providers.Factory(FakeUnitOfWork, state=state)),
        container.transaction.override(providers.Factory(FakeTransactionScope, state=state)),
    ):
        yield
