"""外側から張るトランザクション。

    with container.transaction() as tx:
        user = user_service.register(...)      # tx に参加する(commit しない)
        tx.session.execute(text("..."))         # 同じ Session で直接 SQL
        order_service.place(user.id, ...)       # これも同じ Session
    # ここで 1 回だけ commit。途中で例外なら全部 rollback

スコープの外でサービスを呼んだときは、今まで通りメソッドごとに閉じる。
スコープの中で開いた UnitOfWork は、スコープの Session を使い、
commit() は flush() になる。
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

from sqlalchemy import Result
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.sql import Executable

_ambient: ContextVar[Session | None] = ContextVar("shop_core_ambient_session", default=None)


def current_session() -> Session | None:
    """張られているトランザクションの Session。なければ None"""
    return _ambient.get()


class Transaction:
    """スコープの中で直接 DB を触るための窓口。読み取り(CQ の Q 側)にも使う"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def execute(self, statement: Executable, params: Any = None) -> Result[Any]:
        return self.session.execute(statement, params)

    def flush(self) -> None:
        self.session.flush()


class TransactionScope:
    """container.transaction() が返す。呼ぶたびに新しいインスタンス(Factory)"""

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory
        self._cm = self._scope()

    def __enter__(self) -> Transaction:
        return self._cm.__enter__()

    def __exit__(self, *exc: Any) -> bool | None:
        return self._cm.__exit__(*exc)

    @contextmanager
    def _scope(self) -> Iterator[Transaction]:
        outer = _ambient.get()
        if outer is not None:
            # 入れ子は外側に参加するだけ。commit も rollback も外側がやる
            yield Transaction(outer)
            return
        session = self._session_factory()
        token = _ambient.set(session)
        try:
            yield Transaction(session)
            session.commit()
        except BaseException:
            session.rollback()
            raise
        finally:
            _ambient.reset(token)
            session.close()
