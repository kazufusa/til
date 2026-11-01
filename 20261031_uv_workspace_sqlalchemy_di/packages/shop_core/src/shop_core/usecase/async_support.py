"""async なコードから shop_core を使うための部品。

shop_core のサービスと Session は同期のままで、AsyncSession は使わない。
async 側からはワーカースレッドで呼ぶ。

    async with container.transaction_async() as tx:
        uid = await tx.run(resolve_user_id, tx, users, slack_id, name)
        order = await tx.run(orders.place, uid, [(product_id, quantity)])
    # ここで commit。例外なら rollback。どちらもスレッドで走るのでイベントループは止まらない

    await run_sync(notifier.post, channel, text)   # スコープの外の同期処理

規則: 1 つのスコープを複数のタスクから同時に使わない(asyncio.gather など)。
Session は並行利用に耐えない。await を順に並べる使い方は問題ない。

contextvars の伝播: anyio.to_thread.run_sync は呼び出し側のコンテキストを
コピーしてワーカースレッドで実行する(anyio 4.x で確認済み。
tests/test_async_fake.py の test_contextvar_is_propagated_to_worker_thread が証拠)。
そのためスコープの ContextVar を入口でタスク側に張っておけば、run_sync の中のサービス呼び出しは
同じ Session に参加する。逆向きは伝わらない。ワーカースレッドで ContextVar を set / reset しても
タスク側には届かないので、スコープの set と reset は必ずタスク側で行う。
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeVar

import anyio
import anyio.to_thread
from sqlalchemy import Result
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, SessionTransaction, sessionmaker
from sqlalchemy.sql import Executable

from shop_core.domain.ports import EventPublisher
from shop_core.infra.constraints import translate_db_error, translated_errors
from shop_core.usecase.transaction import _ambient, begin_staging, end_staging

T = TypeVar("T")


def _commit_translated(target: Session | SessionTransaction) -> None:
    """commit で出る制約違反や接続障害を、同期のスコープと同じくドメインのエラーに翻訳する"""
    with translated_errors():
        target.commit()


def _flush_translated(session: Session) -> None:
    with translated_errors():
        session.flush()


async def run_sync(fn: Callable[..., T], /, *args: Any, **kwargs: Any) -> T:
    """同期の関数をワーカースレッドで実行する。呼び出し側のコンテキスト(ContextVar)はコピーされる。

    スコープの中で呼べば、fn の中のサービス呼び出しはスコープの Session に参加する。
    """
    if kwargs:
        return await anyio.to_thread.run_sync(lambda: fn(*args, **kwargs))
    return await anyio.to_thread.run_sync(fn, *args)


class AsyncTransaction:
    """async with で受け取る窓口。DB に触る操作はすべてスレッドで走る"""

    def __init__(self, session: Session) -> None:
        self.session = session

    async def run(self, fn: Callable[..., T], /, *args: Any, **kwargs: Any) -> T:
        return await run_sync(fn, *args, **kwargs)

    async def execute(self, statement: Executable, params: Any = None) -> Result[Any]:
        return await run_sync(self.session.execute, statement, params)

    async def flush(self) -> None:
        await run_sync(_flush_translated, self.session)


class AsyncTransactionScope:
    """container.transaction_async() が返す。呼ぶたびに新しいインスタンス(Factory)。

    入口で Session を作り ContextVar を張るのはタスク側で行う(Session の生成に I/O はない)。
    commit / rollback / close と SAVEPOINT はスレッドで行い、ContextVar の reset はタスク側で行う。
    入れ子は同期のスコープと同じく SAVEPOINT で囲む。
    イベントも同期のスコープと同じ規則で、最も外側の commit が成功したあとに
    publisher.publish をスレッドで呼ぶ(publisher の例外は呼び出し元に伝わる)。
    """

    def __init__(self, session_factory: sessionmaker[Session], publisher: EventPublisher) -> None:
        self._session_factory = session_factory
        self._publisher = publisher
        self._session: Session | None = None
        self._nested: SessionTransaction | None = None
        self._outer_session: Session | None = None
        self._token: Any = None

    async def __aenter__(self) -> AsyncTransaction:
        outer = _ambient.get()
        if outer is not None:
            self._outer_session = outer
            self._nested = await run_sync(outer.begin_nested)
            begin_staging(outer)
            return AsyncTransaction(outer)
        self._session = self._session_factory()
        begin_staging(self._session)
        self._token = _ambient.set(self._session)
        return AsyncTransaction(self._session)

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        # キャンセル中でも後始末は最後まで走らせる
        with anyio.CancelScope(shield=True):
            if self._nested is not None:
                nested = self._nested
                keep = False
                try:
                    if exc_type is None:
                        await run_sync(_commit_translated, nested)
                        keep = True
                    elif nested.is_active:
                        await run_sync(nested.rollback)
                        self._raise_translated(exc)
                finally:
                    # 入れ子が成功したときだけ、積んだイベントを親に渡す
                    assert self._outer_session is not None
                    end_staging(self._outer_session, keep=keep)
                return
            session = self._session
            assert session is not None
            try:
                if exc_type is None:
                    await run_sync(_commit_translated, session)
                    # commit が成功したあと、トランザクションの外で送る
                    await run_sync(self._publisher.publish, end_staging(session, keep=True))
                else:
                    await run_sync(session.rollback)
                    self._raise_translated(exc)
            except BaseException:
                await run_sync(session.rollback)
                raise
            finally:
                _ambient.reset(self._token)
                await run_sync(session.close)

    @staticmethod
    def _raise_translated(exc: BaseException | None) -> None:
        """本体(tx.run の中の flush など)で出た DB 例外を、翻訳できればドメインのエラーに置き換える"""
        if isinstance(exc, DBAPIError):
            err = translate_db_error(exc)
            if err is not None:
                raise err from exc
