"""Unit of Work。トランザクション境界はここで閉じる。アプリ側は Session を触らない"""

from __future__ import annotations

from types import TracebackType
from typing import Protocol, Self

from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker

from shop_core.domain.events import EventBuffer
from shop_core.domain.ports import EventPublisher
from shop_core.infra.constraints import translated_errors
from shop_core.infra.guards import service_context
from shop_core.domain.ports import (
    ExecutionRepository,
    OrderRepository,
    ProductRepository,
    UserRepository,
)
from shop_core.infra.repositories import (
    SqlAlchemyExecutionRepository,
    SqlAlchemyOrderRepository,
    SqlAlchemyProductRepository,
    SqlAlchemyUserRepository,
)
from shop_core.usecase.transaction import current_session, stage_events


class UnitOfWork(Protocol):
    users: UserRepository
    products: ProductRepository
    orders: OrderRepository
    executions: ExecutionRepository
    # サービスは commit() の直前に events.add(event) で足す。commit 後に publisher へ渡る
    events: EventBuffer

    def __enter__(self) -> Self: ...
    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...


class SqlAlchemyUnitOfWork:
    """events の扱い:

    スコープの外(joined でない)なら、commit() で Session の commit が成功したあとに publisher へ渡す。
    commit が失敗すれば何も送らず、rollback や commit なしの終了では捨てる。
    スコープの中(joined)なら、commit() で SAVEPOINT を解放したときにスコープの置き場へ移し、
    送るのは最も外側のスコープの commit のあと。SAVEPOINT が戻れば捨てる。
    publisher の例外は commit() から伝わる。書き込みはすでにコミットされている
    (アウトボックスがない限り、送る側は at-most-once)。
    """

    def __init__(self, session_factory: sessionmaker[Session], publisher: EventPublisher) -> None:
        self._session_factory = session_factory
        self._publisher = publisher

    def __enter__(self) -> Self:
        ambient = current_session()
        self._joined = ambient is not None
        # transaction() の中なら外側の Session に参加し、commit も close もしない
        self._session = ambient if ambient is not None else self._session_factory()
        # 参加したときは SAVEPOINT を張り、例外を握りつぶされても部分的な書き込みを残さない
        self._nested = self._session.begin_nested() if self._joined else None
        self.users = SqlAlchemyUserRepository(self._session)
        self.products = SqlAlchemyProductRepository(self._session)
        self.orders = SqlAlchemyOrderRepository(self._session)
        self.executions = SqlAlchemyExecutionRepository(self._session)
        self.events = EventBuffer()
        # サービスの中ではガード列を変えてよい(infra/guards.py)。最後に立てて __exit__ で戻す
        self._service_ctx = service_context()
        self._service_ctx.__enter__()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        try:
            self._exit(exc_type, exc, tb)
        finally:
            self.events.clear()
            self._service_ctx.__exit__(exc_type, exc, tb)

    def _exit(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        try:
            if self._joined:
                # commit() で解放されていなければ SAVEPOINT まで戻す。外側の Session は閉じない
                self._rollback_nested()
            else:
                try:
                    if exc_type is not None:
                        self._session.rollback()
                finally:
                    self._session.close()
        except DBAPIError:
            # 接続が切れていると rollback や close も失敗する。本体の例外を優先して翻訳する
            if not isinstance(exc, DBAPIError):
                raise
        if isinstance(exc, DBAPIError):
            # 状態は戻し終えた。本体の flush で出た DB 例外を、翻訳できればドメインのエラーにして投げる
            with translated_errors():
                raise exc

    def commit(self) -> None:
        with translated_errors():
            if self._nested is not None:
                # SAVEPOINT を解放する。外側のトランザクションはスコープの終わりで commit される
                self._nested.commit()
                stage_events(self._session, self.events.drain())
            else:
                self._session.commit()
        if self._nested is None:
            # commit が成功したあと、トランザクションの外で送る
            self._publisher.publish(self.events.drain())

    def rollback(self) -> None:
        if self._nested is not None:
            self._rollback_nested()
        else:
            self._session.rollback()

    def _rollback_nested(self) -> None:
        if self._nested is not None and self._nested.is_active:
            self._nested.rollback()
