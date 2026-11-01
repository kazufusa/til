"""Unit of Work。トランザクション境界はここで閉じる。アプリ側は Session を触らない"""

from __future__ import annotations

from types import TracebackType
from typing import Protocol, Self

from sqlalchemy import event, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from sqlalchemy.orm import Session, sessionmaker

from shop_core.domain.events import EventBuffer, publish_events
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

# DB のトリガー(マイグレーション 0007)が見る、トランザクション内だけのフラグ。
# サービスの中('on')でだけガード列の変更を通す。set_config の第 3 引数 true はトランザクション内限り
_SET_IN_SERVICE_ON = "select set_config('app.in_service', 'on', true)"
_SET_IN_SERVICE_OFF = "select set_config('app.in_service', 'off', true)"

# 翻訳の対象になる、接続や実行の失敗
_DB_ERRORS = (DBAPIError, PoolTimeoutError)


def _mark_in_service(session: Session, transaction, connection) -> None:
    """Session が接続を取ってトランザクションを始めるたびに、サービスの中のフラグを立てる"""
    connection.exec_driver_sql(_SET_IN_SERVICE_ON)


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
    publisher の例外は EventPublishError に包まれて commit() から伝わる。書き込みはすでにコミットされている
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
        self._nested = None
        if self._joined:
            # 参加したときは SAVEPOINT を張り、例外を握りつぶされても部分的な書き込みを残さない。
            # フラグは SAVEPOINT の中で立てる(戻れば元に戻る。解放後は残るので、出口で下ろす)
            try:
                with translated_errors():
                    self._nested = self._session.begin_nested()
                    self._session.execute(text(_SET_IN_SERVICE_ON))
            except BaseException:
                # __exit__ は呼ばれないので、張りかけた SAVEPOINT をここで戻す
                self._rollback_nested(quiet=True)
                raise
        else:
            # 接続は最初の使用で張られる。その時点のトランザクションごとにフラグを立てる
            event.listen(self._session, "after_begin", _mark_in_service)
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
                # 外側のスコープに、サービスの外のフラグを残さない
                self._unmark_in_service()
            else:
                try:
                    if exc_type is not None:
                        self._session.rollback()
                finally:
                    self._session.close()
        except _DB_ERRORS:
            # 接続が切れていると rollback や close も失敗する。本体の例外を優先して翻訳する
            if not isinstance(exc, _DB_ERRORS):
                raise
        if isinstance(exc, _DB_ERRORS):
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
            publish_events(self._publisher, self.events.drain())

    def rollback(self) -> None:
        if self._nested is not None:
            self._rollback_nested()
        else:
            self._session.rollback()

    def _rollback_nested(self, *, quiet: bool = False) -> None:
        if self._nested is not None and self._nested.is_active:
            try:
                self._nested.rollback()
            except DBAPIError:
                if not quiet:
                    raise

    def _unmark_in_service(self) -> None:
        """参加したスコープの Session で、フラグを 'off' に戻す。使えない接続なら何もしない"""
        try:
            if self._session.in_transaction() and self._session.is_active:
                self._session.execute(text(_SET_IN_SERVICE_OFF))
        except DBAPIError:
            pass
