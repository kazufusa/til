"""DB 制約違反と接続障害を、ドメインのエラーに翻訳する。

制約名からドメインのエラーを引く表(レジストリ)を持つ。
表にない制約の違反は想定外なので、翻訳せず元の IntegrityError のまま投げる。
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager

from sqlalchemy.exc import DBAPIError, IntegrityError

from shop_core.domain.constraints import CONSTRAINTS
from shop_core.domain.errors import DependencyError, DomainError

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
}


def classify_db_error(exc: DBAPIError) -> DependencyError | None:
    """接続切れ、起動中、直列化失敗、デッドロックなら DependencyError。それ以外は None"""
    sqlstate = getattr(exc.orig, "sqlstate", None)
    if sqlstate in _DEPENDENCY_SQLSTATES:
        code, message = _DEPENDENCY_SQLSTATES[sqlstate]
        return DependencyError(code, message)
    if exc.connection_invalidated or (sqlstate or "").startswith("08"):
        return DependencyError("db_unavailable", "database connection is unavailable")
    return None


def translate_db_error(exc: BaseException) -> DomainError | None:
    """flush や commit で出た DB 例外をドメインのエラーにする。翻訳できなければ None"""
    if isinstance(exc, IntegrityError):
        return translate_integrity_error(exc)
    if isinstance(exc, DBAPIError):
        return classify_db_error(exc)
    return None


@contextmanager
def translated_errors() -> Iterator[None]:
    """with の中で出た DB 例外を翻訳できれば DomainError に置き換える。翻訳できなければそのまま投げる"""
    try:
        yield
    except DBAPIError as exc:
        err = translate_db_error(exc)
        if err is None:
            raise
        raise err from exc
