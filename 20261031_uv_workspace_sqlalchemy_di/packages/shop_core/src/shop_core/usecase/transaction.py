"""外側から張るトランザクション。

    with container.transaction() as tx:
        user = user_service.register(...)      # tx に参加する(commit しない)
        tx.session.execute(text("..."))         # 同じ Session で直接 SQL
        order_service.place(user.id, ...)       # これも同じ Session
    # ここで 1 回だけ commit。途中で例外なら全部 rollback

スコープの外でサービスを呼んだときは、今まで通りメソッドごとに閉じる。
スコープの中で開いた UnitOfWork は、スコープの Session を使い、
SAVEPOINT を張る。commit() は SAVEPOINT の解放になり、例外や commit() 忘れなら
SAVEPOINT まで戻す。入れ子のスコープも同じ。

ドメインイベントは Session の info["event_stack"](リストのリスト)に積む。
最も外側のスコープが 1 つ目のリストを作り、入れ子のスコープは入るときに 1 つ足す。
入れ子が成功すれば親のリストに足し、例外なら捨てる。サービス(UoW)は commit() で
いちばん上のリストに足す。最も外側のスコープは commit が成功したあとにだけ、
1 つ目のリストを EventPublisher に渡す。publish はトランザクションの外で呼ばれ、
publisher の例外は EventPublishError に包まれて呼び出し元に伝わる。書き込みはすでにコミットされているので、
送れなかったイベントは失われる(アウトボックスがない限り、送る側は at-most-once)。
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

from sqlalchemy import Result
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.sql import Executable

from shop_core.domain.events import DomainEvent, publish_events
from shop_core.domain.ports import EventPublisher
from shop_core.infra.constraints import translate_db_error, translated_errors

_ambient: ContextVar[Session | None] = ContextVar("shop_core_ambient_session", default=None)


EVENT_STACK = "event_stack"


def begin_staging(session: Session) -> None:
    """イベントの置き場を 1 段足す。最も外側なら最初の 1 つを作る"""
    session.info.setdefault(EVENT_STACK, []).append([])


def end_staging(session: Session, *, keep: bool) -> list[DomainEvent]:
    """いちばん上の置き場を外す。keep なら親に足す。親がなければ(最も外側)中身を返す"""
    stack: list[list[DomainEvent]] = session.info[EVENT_STACK]
    top = stack.pop()
    if keep and stack:
        stack[-1].extend(top)
        return []
    return top if keep else []


def stage_events(session: Session, events: list[DomainEvent]) -> None:
    """joined な UoW が commit() したイベントを、いちばん上の置き場に足す"""
    session.info.setdefault(EVENT_STACK, [[]])[-1].extend(events)


def current_session() -> Session | None:
    """張られているトランザクションの Session。なければ None"""
    return _ambient.get()


class Transaction:
    """スコープの中で直接 DB を触るための窓口。ORM(shop_core.tables)や生 SQL の読み書きに使う。

    行ロックは tx.session.execute(select(...).with_for_update()) で取る。
    ロックはスコープを抜けるまで続く。
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    def execute(self, statement: Executable, params: Any = None) -> Result[Any]:
        return self.session.execute(statement, params)

    def flush(self) -> None:
        # 登録済みの制約違反はドメインのエラーになる。未登録のものは IntegrityError のまま
        with translated_errors():
            self.session.flush()


class TransactionScope:
    """container.transaction() が返す。呼ぶたびに新しいインスタンス(Factory)"""

    def __init__(self, session_factory: sessionmaker[Session], publisher: EventPublisher) -> None:
        self._session_factory = session_factory
        self._publisher = publisher
        self._cm = self._scope()

    def __enter__(self) -> Transaction:
        return self._cm.__enter__()

    def __exit__(self, *exc: Any) -> bool | None:
        return self._cm.__exit__(*exc)

    @contextmanager
    def _scope(self) -> Iterator[Transaction]:
        outer = _ambient.get()
        if outer is not None:
            # 入れ子は SAVEPOINT で囲む。外側の Session の commit と close は外側がやる
            with translated_errors():
                nested = outer.begin_nested()
            begin_staging(outer)
            keep = False
            try:
                try:
                    yield Transaction(outer)
                except BaseException as exc:
                    _quiet(lambda: nested.rollback() if nested.is_active else None)
                    _reraise_translated(exc)
                with translated_errors():
                    nested.commit()
                keep = True
            finally:
                # 入れ子が成功したときだけ、積んだイベントを親に渡す
                end_staging(outer, keep=keep)
            return
        session = self._session_factory()
        token = _ambient.set(session)
        begin_staging(session)
        try:
            yield Transaction(session)
            with translated_errors():
                session.commit()
            # commit が成功したあとにだけ、トランザクションの外で送る
            publish_events(self._publisher, end_staging(session, keep=True))
        except BaseException as exc:
            _quiet(session.rollback)
            _reraise_translated(exc)
        finally:
            _ambient.reset(token)
            _quiet(session.close)


def _quiet(action) -> None:
    """後始末の失敗は握りつぶす。接続が切れていると rollback や close も失敗するが、
    投げたいのは本体の例外のほう"""
    try:
        action()
    except DBAPIError:
        pass


def _reraise_translated(exc: BaseException) -> None:
    """DB 例外は翻訳できればドメインのエラーにして、できなければそのまま投げ直す"""
    err = translate_db_error(exc)
    if err is not None:
        raise err from exc
    raise exc
