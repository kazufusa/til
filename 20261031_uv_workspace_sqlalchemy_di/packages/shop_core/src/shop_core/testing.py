"""アプリチーム向けのフェイク。DB なしでサービスの振る舞いをテストできる

    state = InMemoryState()
    container.uow.override(providers.Factory(FakeUnitOfWork, state=state))

transaction() も含めて差し替えるなら:

    with fake_backend(container, state):
        ...

ドメインイベントは state.events(InMemoryEventPublisher)に溜まる。
本物と同じく、最も外側のコミットが成功したあとにだけ published に入る。
コミットされなかった書き込みのイベントは入らない。

    assert state.events.published == [...]

フェイクの tx は state だけを持つ。tx.session や tx.execute を使う処理は、
関数に切り出して monkeypatch で差し替える。container.db() はフェイクにならない。

フェイクはガード列(shop_core.tables から直接変えると GuardedColumnError になる列)を
検査しない。ORM がないので、検査するものがないため。ガード列の検査は Postgres のテストで確かめる。
"""

from __future__ import annotations

import copy
import hashlib
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import UTC, datetime
from types import SimpleNamespace, TracebackType
from typing import Any, Self
from urllib.parse import urlencode
from uuid import UUID

from dependency_injector import providers

from shop_core.domain.constraints import CONSTRAINTS
from shop_core.domain.errors import ArtifactNotFoundError, ConcurrentUpdateError
from shop_core.domain.events import DomainEvent, EventBuffer
from shop_core.domain.execution import Execution
from shop_core.domain.models import Order, Product, User
from shop_core.domain.ports import ArtifactInfo, EventPublisher


class InMemoryImageStore:
    """ImageStore のフェイク。objects は (execution_id, image_id) -> (data, content_type, metadata)"""

    def __init__(self) -> None:
        self.objects: dict[tuple[UUID, UUID], tuple[bytes, str, dict[str, str]]] = {}

    def ping(self) -> None:
        """フェイクは常に到達できる"""

    def put(
        self,
        execution: Execution,
        image_id: UUID,
        data: bytes,
        *,
        content_type: str,
        metadata: Mapping[str, str] | None = None,
    ) -> None:
        if not content_type or content_type == "binary/octet-stream":
            raise ValueError("content_type is required and must not be binary/octet-stream")
        self.objects[(execution.id, image_id)] = (bytes(data), content_type, dict(metadata or {}))

    def get(self, execution: Execution, image_id: UUID) -> bytes:
        return self._find(execution, image_id)[0]

    def head(self, execution: Execution, image_id: UUID) -> ArtifactInfo:
        data, content_type, metadata = self._find(execution, image_id)
        return ArtifactInfo(
            content_type=content_type,
            size=len(data),
            metadata=dict(metadata),
            etag=hashlib.md5(data).hexdigest(),
        )

    def exists(self, execution: Execution, image_id: UUID) -> bool:
        return (execution.id, image_id) in self.objects

    def delete(self, execution: Execution, image_id: UUID) -> None:
        self.objects.pop((execution.id, image_id), None)

    def replace_metadata(
        self,
        execution: Execution,
        image_id: UUID,
        *,
        content_type: str,
        metadata: Mapping[str, str],
    ) -> None:
        data = self._find(execution, image_id)[0]
        self.objects[(execution.id, image_id)] = (data, content_type, dict(metadata))

    def presigned_get_url(
        self,
        execution: Execution,
        image_id: UUID,
        *,
        expires_in: int = 900,
        response_content_type: str | None = None,
        filename: str | None = None,
    ) -> str:
        self._find(execution, image_id)
        query: dict[str, Any] = {"expires_in": expires_in}
        if response_content_type:
            query["content_type"] = response_content_type
        if filename:
            query["filename"] = filename
        return f"memory://{execution.id}/{image_id}?{urlencode(query)}"

    def _find(self, execution: Execution, image_id: UUID) -> tuple[bytes, str, dict[str, str]]:
        try:
            return self.objects[(execution.id, image_id)]
        except KeyError:
            raise ArtifactNotFoundError(f"{execution.id}/{image_id}") from None


class InMemoryEventPublisher:
    """EventPublisher のフェイク。送られたイベントを published に順に溜める"""

    def __init__(self) -> None:
        self.published: list[DomainEvent] = []

    def publish(self, events: Any) -> None:
        self.published.extend(events)


@dataclass
class InMemoryState:
    users: dict[int, User] = field(default_factory=dict)
    products: dict[int, Product] = field(default_factory=dict)
    orders: dict[int, Order] = field(default_factory=dict)
    executions: dict[UUID, Execution] = field(default_factory=dict)
    # オブジェクトはトランザクションの対象外なので、スナップショットには含めない
    image_store: InMemoryImageStore = field(default_factory=InMemoryImageStore)
    events: InMemoryEventPublisher = field(default_factory=InMemoryEventPublisher)
    # トランザクションの作業用コピーだけが使う、イベントの置き場の段(本物の session.info["event_stack"] 相当)
    event_stack: list[list[DomainEvent]] = field(default_factory=list)
    _seq: int = 0

    def next_id(self) -> int:
        self._seq += 1
        return self._seq


def _copy_state(state: InMemoryState) -> InMemoryState:
    """image_store と events は共有のまま、DB 相当の部分だけ複製する"""
    memo = {id(state.image_store): state.image_store, id(state.events): state.events}
    return copy.deepcopy(state, memo)


def _snapshot(work: InMemoryState) -> InMemoryState:
    return _copy_state(work)


def _restore(work: InMemoryState, snap: InMemoryState) -> None:
    # 外側のスコープが同じ参照を持っているので、置き換えずに中身を入れ替える
    work.users = snap.users
    work.products = snap.products
    work.orders = snap.orders
    work.executions = snap.executions
    work._seq = snap._seq


_ambient_work: ContextVar[InMemoryState | None] = ContextVar("shop_core_fake_work", default=None)


# 制約の collection -> (集約を持つ state の属性, 集約から (識別子, 行) の列を取り出す関数)。
# DB の行に当たるものを集約から導く。制約を足すときは domain/constraints.py に書けばよく、
# 新しい collection のときだけここに 1 行足す
_COLLECTIONS: dict[str, tuple[str, Any]] = {
    "users": ("users", lambda u: [(u.id, u)]),
    "products": ("products", lambda p: [(p.id, p)]),
    "order_lines": ("orders", lambda o: [((o.id, n), line) for n, line in enumerate(o.lines)]),
    "executions": ("executions", lambda e: [(e.id, e)]),
    "execution_images": (
        "executions",
        lambda e: [
            ((e.id, n), SimpleNamespace(execution_id=e.id, ordinal=n))
            for n, _ in enumerate(e.images)
        ],
    ),
}


def _enforce(state: InMemoryState, aggregate: Any, *, attr: str) -> None:
    """保存する集約が、登録された制約(domain/constraints.py)を破るなら error() を投げる。

    DB の一意制約・部分一意・CHECK と同じ判定を、state の中の他の行に対して行う。
    attr は集約を持つ state の属性名(users、orders など)。
    """
    for c in CONSTRAINTS:
        agg_attr, rows_of = _COLLECTIONS[c.collection]
        if agg_attr != attr:
            continue
        new_rows = rows_of(aggregate)
        new_ids = {ident for ident, _ in new_rows}
        # 保存済みの行。同じ集約の古い行は上書きされるので除く
        others = [
            r for a in getattr(state, attr).values() for r in rows_of(a) if r[0] not in new_ids
        ]
        for ident, row in new_rows:
            if c.kind == "check":
                if not c.predicate(row):
                    raise c.error()
                continue
            if c.where is not None and not c.where(row):
                continue
            key = c.key(row)
            for other_ident, other in others + new_rows:
                if other_ident == ident:
                    continue
                if (c.where is None or c.where(other)) and c.key(other) == key:
                    raise c.error()


class _Users:
    def __init__(self, state: InMemoryState) -> None:
        self._st = state

    def store(self, user: User) -> User:
        user.id = self._st.next_id()
        _enforce(self._st, user, attr="users")
        self._st.users[user.id] = copy.deepcopy(user)
        return user

    def store_if_absent(self, user: User) -> User:
        existing = self.resolve_by_email(user.email)
        return existing if existing is not None else self.store(user)

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
        _enforce(self._st, product, attr="products")
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
        _enforce(self._st, order, attr="orders")
        self._st.orders[order.id] = copy.deepcopy(order)
        return order

    def resolve_by_id(self, order_id: int) -> Order | None:
        o = self._st.orders.get(order_id)
        return copy.deepcopy(o) if o else None

    def resolve_by_user_id(self, user_id: int) -> list[Order]:
        return [copy.deepcopy(o) for o in self._st.orders.values() if o.user_id == user_id]


class _Executions:
    def __init__(self, state: InMemoryState, committed: InMemoryState | None = None) -> None:
        self._st = state
        # 他のトランザクションがコミットした最新の状態。版の検査に使う
        self._committed = committed

    def store(self, execution: Execution) -> Execution:
        """本物と同じ楽観ロック。保存済みの版と違えば ConcurrentUpdateError、保存のたびに版が 1 上がる"""
        stored = self._latest(execution.id)
        if stored is not None and execution.version != stored.version:
            raise ConcurrentUpdateError("execution", execution.id)
        _enforce(self._st, execution, attr="executions")
        if execution.created_at is None:
            execution.created_at = datetime.now(UTC)
        if stored is not None:
            execution.version = stored.version + 1
        self._st.executions[execution.id] = copy.deepcopy(execution)
        return execution

    def _latest(self, execution_id: UUID) -> Execution | None:
        """自分のトランザクションの書き込みか、他がコミットした最新のうち、版が新しい方"""
        found = [self._st.executions.get(execution_id)]
        if self._committed is not None:
            found.append(self._committed.executions.get(execution_id))
        return max((e for e in found if e is not None), key=lambda e: e.version, default=None)

    def resolve_by_id(self, execution_id: UUID) -> Execution | None:
        e = self._st.executions.get(execution_id)
        return copy.deepcopy(e) if e else None

    def resolve_by_order_id(self, order_id: int) -> list[Execution]:
        found = [e for e in self._st.executions.values() if e.order_id == order_id]
        return [copy.deepcopy(e) for e in sorted(found, key=lambda e: e.id)]


class FakeUnitOfWork:
    """commit しなければ state に反映しない、という点だけ本物と同じにしてある"""

    def __init__(self, state: InMemoryState, publisher: EventPublisher | None = None) -> None:
        self._shared = state
        self._publisher = publisher if publisher is not None else state.events

    def __enter__(self) -> Self:
        ambient = _ambient_work.get()
        self._joined = ambient is not None
        # transaction() の中なら外側の work を直接使う
        self._work = ambient if ambient is not None else _copy_state(self._shared)
        self.users = _Users(self._work)
        self.products = _Products(self._work)
        self.orders = _Orders(self._work)
        self.executions = _Executions(self._work, self._shared)
        self.committed = False
        self.events = EventBuffer()
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
        # commit されなかったイベントは捨てる
        self.events.clear()

    def commit(self) -> None:
        if self._joined:
            self.committed = True
            # SAVEPOINT の解放に当たる。送るのは最も外側のスコープが終わったあと
            if not self._work.event_stack:
                self._work.event_stack.append([])
            self._work.event_stack[-1].extend(self.events.drain())
            return
        self._shared.users = self._work.users
        self._shared.products = self._work.products
        self._shared.orders = self._work.orders
        self._shared.executions = self._work.executions
        self._shared._seq = self._work._seq
        self.committed = True
        self._publisher.publish(self.events.drain())

    def rollback(self) -> None:
        if self._joined:
            self._restore_snapshot()
            return
        self._work = _copy_state(self._shared)

    def _restore_snapshot(self) -> None:
        if self._snap is not None:
            _restore(self._work, self._snap)


class FakeTransaction:
    """session も execute も持たない。state だけを見せる"""

    def __init__(self, state: InMemoryState) -> None:
        self.state = state


class FakeTransactionScope:
    """本物の TransactionScope と同じく、入れ子は外側に参加し、例外なら入れ子の分だけ捨てる"""

    def __init__(self, state: InMemoryState, publisher: EventPublisher | None = None) -> None:
        self._shared = state
        self._publisher = publisher if publisher is not None else state.events
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
            outer.event_stack.append([])
            keep = False
            try:
                yield FakeTransaction(outer)
                keep = True
            except BaseException:
                _restore(outer, snap)
                raise
            finally:
                # 入れ子が成功したときだけ、積んだイベントを親に渡す
                top = outer.event_stack.pop()
                if keep:
                    outer.event_stack[-1].extend(top)
            return
        work = _copy_state(self._shared)
        work.event_stack = [[]]
        token = _ambient_work.set(work)
        try:
            yield FakeTransaction(work)
        finally:
            _ambient_work.reset(token)
        # 例外ならここに来ない
        self._shared.users = work.users
        self._shared.products = work.products
        self._shared.orders = work.orders
        self._shared.executions = work.executions
        self._shared._seq = work._seq
        # コミットしたあとに送る。publisher の例外は書き込みを戻さない
        self._publisher.publish(work.event_stack[0])


class FakeAsyncTransaction(FakeTransaction):
    """async 版。session はなく state だけを見せる。run は実物と同じくスレッドで走る"""

    async def run(self, fn: Any, /, *args: Any, **kwargs: Any) -> Any:
        from shop_core.usecase.async_support import run_sync

        return await run_sync(fn, *args, **kwargs)


class FakeAsyncTransactionScope:
    """FakeTransactionScope の async 版。ContextVar はタスク側で張り、タスク側で戻す"""

    def __init__(self, state: InMemoryState, publisher: EventPublisher | None = None) -> None:
        self._shared = state
        self._publisher = publisher if publisher is not None else state.events
        self._outer: InMemoryState | None = None
        self._snap: InMemoryState | None = None
        self._work: InMemoryState | None = None
        self._token: Any = None

    async def __aenter__(self) -> FakeAsyncTransaction:
        outer = _ambient_work.get()
        if outer is not None:
            self._outer = outer
            self._snap = _snapshot(outer)
            outer.event_stack.append([])
            return FakeAsyncTransaction(outer)
        self._work = _copy_state(self._shared)
        self._work.event_stack = [[]]
        self._token = _ambient_work.set(self._work)
        return FakeAsyncTransaction(self._work)

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        if self._outer is not None:
            if exc_type is not None and self._snap is not None:
                _restore(self._outer, self._snap)
            top = self._outer.event_stack.pop()
            if exc_type is None:
                self._outer.event_stack[-1].extend(top)
            return
        work = self._work
        assert work is not None
        _ambient_work.reset(self._token)
        if exc_type is not None:
            return
        self._shared.users = work.users
        self._shared.products = work.products
        self._shared.orders = work.orders
        self._shared.executions = work.executions
        self._shared._seq = work._seq
        from shop_core.usecase.async_support import run_sync

        await run_sync(self._publisher.publish, work.event_stack[0])


@contextmanager
def fake_backend(container: Any, state: InMemoryState) -> Iterator[None]:
    """uow、transaction、image_store、event_publisher を同じ state のフェイクに差し替える"""
    with (
        container.uow.override(
            providers.Factory(FakeUnitOfWork, state=state, publisher=container.event_publisher)
        ),
        container.transaction.override(
            providers.Factory(
                FakeTransactionScope, state=state, publisher=container.event_publisher
            )
        ),
        container.image_store.override(providers.Object(state.image_store)),
        container.event_publisher.override(providers.Object(state.events)),
        container.transaction_async.override(
            providers.Factory(
                FakeAsyncTransactionScope, state=state, publisher=container.event_publisher
            )
        ),
    ):
        yield
