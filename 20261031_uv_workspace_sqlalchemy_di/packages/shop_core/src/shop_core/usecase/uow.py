"""Unit of Work。トランザクション境界はここで閉じる。アプリ側は Session を触らない"""

from __future__ import annotations

from types import TracebackType
from typing import Protocol, Self

from sqlalchemy.orm import Session, sessionmaker

from shop_core.domain.ports import OrderRepository, ProductRepository, UserRepository
from shop_core.infra.repositories import (
    SqlAlchemyOrderRepository,
    SqlAlchemyProductRepository,
    SqlAlchemyUserRepository,
)
from shop_core.usecase.transaction import current_session


class UnitOfWork(Protocol):
    users: UserRepository
    products: ProductRepository
    orders: OrderRepository

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
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

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
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._joined:
            # commit() で解放されていなければ SAVEPOINT まで戻す。外側の Session は閉じない
            self._rollback_nested()
            return
        try:
            if exc_type is not None:
                self._session.rollback()
        finally:
            self._session.close()

    def commit(self) -> None:
        if self._nested is not None:
            # SAVEPOINT を解放する。外側のトランザクションはスコープの終わりで commit される
            self._nested.commit()
        else:
            self._session.commit()

    def rollback(self) -> None:
        if self._nested is not None:
            self._rollback_nested()
        else:
            self._session.rollback()

    def _rollback_nested(self) -> None:
        if self._nested is not None and self._nested.is_active:
            self._nested.rollback()
