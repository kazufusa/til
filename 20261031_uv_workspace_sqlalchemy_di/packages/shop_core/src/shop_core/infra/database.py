"""生の接続を出す窓口。行ロックは transaction() で足りるので、これは LISTEN/NOTIFY と専用 SQL 向け"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from psycopg import sql
from sqlalchemy import Connection, Engine, text


@dataclass(frozen=True)
class Notification:
    channel: str
    payload: str
    pid: int


class Database:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    @contextmanager
    def connect(self) -> Iterator[Connection]:
        """1 トランザクションの接続。抜けるとき commit、例外なら rollback"""
        with self._engine.begin() as conn:
            yield conn

    @contextmanager
    def autocommit(self) -> Iterator[Connection]:
        """トランザクションを張らない接続。LISTEN や NOTIFY 向け"""
        with self._engine.connect() as conn:
            yield conn.execution_options(isolation_level="AUTOCOMMIT")

    def notify(self, channel: str, payload: str = "") -> None:
        with self.autocommit() as conn:
            conn.execute(text("select pg_notify(:c, :p)"), {"c": channel, "p": payload})

    def listen(self, channel: str, *, timeout: float | None = None) -> Iterator[Notification]:
        """専用の接続で通知を待つ。

        timeout は開始からの総時間で、その秒数がたつと通知の有無にかかわらず終わる。
        None なら終わらず、ジェネレータが生きている間、プールの接続を 1 本占有する。
        ジェネレータを閉じると接続を返す。
        """
        with self.autocommit() as conn:
            raw = conn.connection.dbapi_connection
            name = sql.Identifier(channel)
            raw.execute(sql.SQL("LISTEN {}").format(name))
            try:
                for n in raw.notifies(timeout=timeout):
                    yield Notification(n.channel, n.payload, n.pid)
            finally:
                # プールに戻る接続に LISTEN を残さない
                raw.execute(sql.SQL("UNLISTEN {}").format(name))
