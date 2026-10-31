"""アプリチーム向けのフェイク。DB なしでサービスの振る舞いをテストできる

    state = InMemoryState()
    container.uow.override(providers.Factory(FakeUnitOfWork, state=state))

transaction() も含めて差し替えるなら:

    with fake_backend(container, state):
        ...
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
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        pass

    def commit(self) -> None:
        if self._joined:
            return
        self._shared.users = self._work.users
        self._shared.products = self._work.products
        self._shared.orders = self._work.orders
        self._shared._seq = self._work._seq
        self.committed = True

    def rollback(self) -> None:
        if self._joined:
            return
        self._work = copy.deepcopy(self._shared)


class FakeTransaction:
    def __init__(self, state: InMemoryState) -> None:
        self.state = state


class FakeTransactionScope:
    """本物の TransactionScope と同じく、入れ子は外側に参加し、例外なら全部捨てる"""

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
            yield FakeTransaction(outer)
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
