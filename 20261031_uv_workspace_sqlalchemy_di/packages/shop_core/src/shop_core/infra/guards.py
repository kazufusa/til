"""サービス経由でしか変えてはいけない列(ガード列)の検査。

在庫(products.stock)や実行の状態(executions.status)は、不変条件を持つサービスが変える。
shop_core.tables で直接書き換えると、その検査を飛ばせてしまう。
そこで列に info={"guarded": True} を付け、ORM の before_update で変更を見つけたら
GuardedColumnError を投げる。insert の初期値は許す。

サービスの中かどうかは ContextVar で判断する。SqlAlchemyUnitOfWork が入口で立て、出口で戻す。
サービスは必ず UoW を通るので、transaction() の中で tables を直接書いても立たない。

既知の穴: サービスの実行中に、同じ Session に溜まっていた直接の変更が autoflush で
一緒に書かれると、サービスの中とみなされて通る。ORM の外(Core の update 文や生 SQL)も見えない。
確実に防ぐには DB のトリガーを使う。UoW が各トランザクションの先頭で
set_config('app.in_service', 'on', true) を実行し、ガード列の BEFORE UPDATE トリガーが
current_setting('app.in_service', true) を見て、'on' でなければ例外にする。ここでは実装しない。
"""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

from sqlalchemy import event, inspect

from shop_core.infra.orm import Base

_in_service: ContextVar[bool] = ContextVar("shop_core_in_service", default=False)


class GuardedColumnError(RuntimeError):
    """サービスを通さずにガード列を変えた。ドメインのエラーではなく、呼び出し側のプログラムの誤り"""

    def __init__(self, table: str, column: str) -> None:
        super().__init__(
            f"{table}.{column} is guarded; change it through a service, not shop_core.tables"
        )
        self.table = table
        self.column = column


@contextmanager
def service_context() -> Iterator[None]:
    """この間はガード列を変えてよい。UoW が使う"""
    token = _in_service.set(True)
    try:
        yield
    finally:
        _in_service.reset(token)


def _check_guarded(mapper, connection, target) -> None:
    if _in_service.get():
        return
    state = inspect(target)
    for attr in mapper.column_attrs:
        if attr.columns[0].info.get("guarded") and state.attrs[attr.key].history.has_changes():
            raise GuardedColumnError(mapper.local_table.name, attr.columns[0].name)


event.listen(Base, "before_update", _check_guarded, propagate=True)
