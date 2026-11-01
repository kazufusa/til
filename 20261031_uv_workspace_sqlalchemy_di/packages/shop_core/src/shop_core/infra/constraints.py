"""DB 制約違反と接続障害を、ドメインのエラーに翻訳する。

制約名からドメインのエラーを引く表(レジストリ)を持つ。
表にない制約の違反は想定外なので、翻訳せず元の IntegrityError のまま投げる。

接続障害は DependencyError(時間を置いてやり直せる)にする。code は次のとおり。

- db_unavailable: 接続できない、接続が切れた、起動中、接続数の上限
- db_pool_exhausted: コネクションプールの待ちがタイムアウトした
- db_statement_timeout: statement_timeout で文が打ち切られた
- db_lock_timeout: lock_timeout で行ロックの待ちが打ち切られた
- db_serialization_failure / db_deadlock: 直列化失敗とデッドロック
- db_credentials_unavailable: 資格情報を返す関数が失敗した(infra/db.py が投げる)

DB のトリガーが出すガード列の違反(P0001、メッセージが guarded column で始まる)は、
ORM の検査と同じ GuardedColumnError にする。
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager

import re

import psycopg
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError

from shop_core.domain.constraints import CONSTRAINTS
from shop_core.domain.errors import DependencyError, DomainError
from shop_core.infra.guards import GuardedColumnError

ErrorFactory = Callable[[], DomainError]

# 制約名 -> エラー。宣言は domain/constraints.py にあり、フェイクも同じ表を使う
CONSTRAINT_ERRORS: dict[str, ErrorFactory] = {c.name: c.error for c in CONSTRAINTS}


def translate_integrity_error(exc: IntegrityError) -> DomainError | None:
    """登録済みの制約の違反ならドメインのエラー。未登録なら None"""
    diag = getattr(exc.orig, "diag", None)
    name = getattr(diag, "constraint_name", None)
    factory = CONSTRAINT_ERRORS.get(name) if name else None
    return factory() if factory else None


# SQLSTATE のうち、時間を置いてやり直せるもの
_DEPENDENCY_SQLSTATES = {
    "57P01": ("db_unavailable", "database connection was terminated by the administrator"),
    "57P02": ("db_unavailable", "database crashed"),
    "57P03": ("db_unavailable", "database is starting up"),
    "53300": ("db_unavailable", "database has too many connections"),
    "40001": ("db_serialization_failure", "transaction could not be serialized"),
    "40P01": ("db_deadlock", "deadlock detected"),
    "57014": ("db_statement_timeout", "statement timed out"),
    "55P03": ("db_lock_timeout", "could not obtain lock in time"),
}

# 0007 のトリガー関数 shop.guard_column_change が出すメッセージ
_GUARD_MESSAGE = re.compile(r"guarded column (\w+) on (\w+) changed outside a service")


def classify_db_error(exc: DBAPIError) -> DependencyError | GuardedColumnError | None:
    """接続できない・切れた、タイムアウト、直列化失敗、デッドロックなら DependencyError。

    ガード列のトリガー違反なら GuardedColumnError。それ以外は None
    """
    orig = exc.orig
    sqlstate = getattr(orig, "sqlstate", None)
    if sqlstate == "P0001":
        match = _GUARD_MESSAGE.search(str(orig))
        if match:
            return GuardedColumnError(match.group(2), match.group(1))
    if sqlstate in _DEPENDENCY_SQLSTATES:
        code, message = _DEPENDENCY_SQLSTATES[sqlstate]
        return DependencyError(code, message)
    if exc.connection_invalidated or (sqlstate or "").startswith(("08", "28")):
        return DependencyError("db_unavailable", "database connection is unavailable")
    # 接続を張る前の失敗(接続拒否、名前解決、タイムアウト)は SQLSTATE を持たない
    if sqlstate is None and isinstance(orig, psycopg.OperationalError):
        return DependencyError("db_unavailable", "database connection is unavailable")
    return None


def translate_db_error(
    exc: BaseException,
) -> DomainError | GuardedColumnError | None:
    """flush や commit、接続の取得で出た DB 例外をドメインのエラーにする。翻訳できなければ None"""
    if isinstance(exc, IntegrityError):
        return translate_integrity_error(exc)
    if isinstance(exc, DBAPIError):
        return classify_db_error(exc)
    if isinstance(exc, PoolTimeoutError):
        return DependencyError("db_pool_exhausted", "database connection pool is exhausted")
    return None


@contextmanager
def translated_errors() -> Iterator[None]:
    """with の中で出た DB 例外を翻訳できれば DomainError に置き換える。翻訳できなければそのまま投げる"""
    try:
        yield
    except (DBAPIError, PoolTimeoutError) as exc:
        err = translate_db_error(exc)
        if err is None:
            raise
        raise err from exc
