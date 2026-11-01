from __future__ import annotations

from collections.abc import Callable

import psycopg
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from shop_core.infra.schema import SCHEMA
from shop_core.settings import SettingsError

# Postgres が返す「パスワード認証に失敗した」の SQLSTATE
_AUTH_FAILED = "28P01"

Credentials = Callable[[], tuple[str, str]]


def make_engine(
    database_url: str,
    *,
    echo: bool = False,
    pool_size: int = 5,
    max_overflow: int = 10,
    pool_timeout: float = 30.0,
    pool_recycle: int = -1,
    pool_pre_ping: bool = True,
    credentials: Credentials | None = None,
) -> Engine:
    """Engine を作る。

    credentials に (user, password) を返す関数を渡すと、URL のユーザー名とパスワードは捨て、
    新しい接続を張るたびにその関数を呼んで埋める。Secrets Manager のローテーション向けで、
    次のように扱う。

    - 資格情報は接続ごとに遅延して取る。起動時に 1 度だけ読んで固定しない
    - 接続が「パスワード認証に失敗」(SQLSTATE 28P01)で拒否されたら、関数をもう 1 度呼んで 1 回だけやり直す
    - 既存の接続は古い資格情報のまま生きるが、切れたときは pool_pre_ping が検出して捨てる。
      張り直す接続は新しい資格情報で入る

    関数の側で Secrets Manager の応答を短時間キャッシュしておくと、接続のたびに API を呼ばずに済む。
    """
    url = make_url(database_url)
    if credentials is not None:
        url = url.set(username=None, password=None)
    engine = create_engine(
        url,
        echo=echo,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
        pool_recycle=pool_recycle,
        pool_pre_ping=pool_pre_ping,
        connect_args={"options": f"-c search_path={SCHEMA}"},
    )
    if credentials is not None:
        _attach_credentials(engine, credentials)
    return engine


def _attach_credentials(engine: Engine, credentials: Credentials) -> None:
    @event.listens_for(engine, "do_connect")
    def _fill(dialect, conn_rec, cargs, cparams):
        user, password = credentials()
        cparams["user"], cparams["password"] = user, password
        try:
            return dialect.connect(*cargs, **cparams)
        except psycopg.OperationalError as exc:
            # 接続時の失敗は libpq 由来で sqlstate が付かないことがあるので、メッセージでも見る
            if exc.sqlstate != _AUTH_FAILED and "password authentication failed" not in str(exc):
                raise
        # ローテーションで古くなった資格情報だった。取り直して 1 回だけやり直す
        user, password = credentials()
        cparams["user"], cparams["password"] = user, password
        return dialect.connect(*cargs, **cparams)


def assert_app_role(engine: Engine) -> None:
    """接続中のロールがスキーマに DDL を実行できるなら SettingsError。

    アプリには USAGE と DML だけのロールを使う。CREATE を持つロールはマイグレーション用なので、
    アプリの起動時にこれを呼んで取り違えを止める。
    """
    with engine.connect() as conn:
        can_ddl = conn.scalar(
            text("select has_schema_privilege(current_user, :schema, 'CREATE')"),
            {"schema": SCHEMA},
        )
        user = conn.scalar(text("select current_user"))
    if can_ddl:
        raise SettingsError(
            f"role {user!r} can create objects in schema {SCHEMA!r}; "
            "use an application role without CREATE (the migration role must not be used by apps)"
        )


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
