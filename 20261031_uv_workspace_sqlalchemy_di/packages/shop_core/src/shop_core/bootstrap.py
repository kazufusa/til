"""コンポジションルート。import しただけでは何も実行しない。

プロセスの入口(FastAPI の lifespan、main())で次の順に呼ぶ。

    container = build_container()   # 設定を読んで検証する。接続も S3 への通信もしない
    check_database(container)       # DB を使うプロセスだけ
    check_image_store(container)    # ストアを使うプロセスだけ
    container.wire(modules=[...])

返り値の Container がこの層の唯一の取っ手で、モジュールのグローバルには持たない。
終了時は container.engine().dispose() と container.unwire() で片付ける。
"""

from collections.abc import Callable

from dependency_injector import providers
from sqlalchemy import text
from sqlalchemy.engine import make_url

from shop_core.container import Container
from shop_core.infra.db import assert_app_role, make_engine
from shop_core.settings import Settings, SettingsError

_ENVIRONMENTS = {"local", "stg", "prd"}


def validate_environment(settings: Settings) -> None:
    """設定の値を検査する。I/O はしない。不正なら SettingsError"""
    if settings.env not in _ENVIRONMENTS:
        raise SettingsError(f"ENV must be one of {sorted(_ENVIRONMENTS)}: {settings.env!r}")
    if settings.pool_size < 1:
        raise SettingsError(f"pool_size must be >= 1: {settings.pool_size}")
    if settings.max_overflow < 0:
        raise SettingsError(f"max_overflow must be >= 0: {settings.max_overflow}")
    if not settings.artifact_bucket:
        raise SettingsError("artifact_bucket must not be empty")
    try:
        database = make_url(settings.database_url).database
    except Exception as exc:
        raise SettingsError(f"database_url is not a valid URL: {exc}") from None
    if not database:
        raise SettingsError("database_url has no database name")


def build_container(
    settings: Settings | None = None,
    *,
    credentials: Callable[[], tuple[str, str]] | None = None,
) -> Container:
    """設定を検証して Container を作る。DB にも S3 にも接続しない。

    settings を省くと環境変数から読む。明示したときは DATABASE_URL などを読まない。
    credentials は接続を張るたびに呼ばれるので、ここでは呼ばれない。

    返り値がただ 1 つの取っ手になる。モジュールのグローバルに持たず、
    プロセスの入口(FastAPI の lifespan や main())から呼ぶ。
    """
    settings = settings or Settings.from_env()
    validate_environment(settings)
    return Container(
        settings=providers.Object(settings),
        engine_factory=providers.Object(
            lambda: make_engine(
                settings.database_url,
                echo=settings.echo,
                pool_size=settings.pool_size,
                max_overflow=settings.max_overflow,
                pool_timeout=settings.pool_timeout,
                pool_recycle=settings.pool_recycle,
                pool_pre_ping=settings.pool_pre_ping,
                credentials=credentials,
            )
        ),
    )


def check_database(container: Container) -> None:
    """DB に接続できること、接続中のロールがアプリ用(スキーマに CREATE できない)ことを確かめる。

    DB を使うプロセスだけが、起動時に 1 度呼ぶ。マイグレーション用のロールで起動すると SettingsError。
    """
    engine = container.engine()
    assert_app_role(engine)
    with engine.connect() as conn:
        conn.execute(text("select 1"))


def check_image_store(container: Container) -> None:
    """設定のバケットに head_bucket が通ることを確かめる。

    ストアを使うプロセスだけが、起動時に 1 度呼ぶ。失敗は ArtifactStoreError。
    """
    container.image_store().ping()
