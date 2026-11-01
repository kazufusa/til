"""コンポジションルート。import しただけでは何も実行しない。

プロセスの入口(FastAPI の lifespan、main())で次の順に呼ぶ。

    container = build_container()   # 設定を読んで検証する。接続も S3 への通信もしない
    check_database(container)       # DB を使うプロセスだけ
    check_image_store(container)    # ストアを使うプロセスだけ

返り値の Container がこの層の唯一の取っ手で、モジュールのグローバルには持たない。
終了時は container.engine().dispose() で片付ける。
"""

from collections.abc import Callable

from sqlalchemy import Engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ProgrammingError

from shop_core.container import Container
from shop_core.domain.ports import EventPublisher
from shop_core.infra.constraints import translated_errors
from shop_core.infra.db import assert_app_role, make_engine
from shop_core.infra.schema import HEAD_REVISION, SCHEMA
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
    if settings.statement_timeout_ms < 0:
        raise SettingsError(f"statement_timeout_ms must be >= 0: {settings.statement_timeout_ms}")
    if settings.lock_timeout_ms < 0:
        raise SettingsError(f"lock_timeout_ms must be >= 0: {settings.lock_timeout_ms}")
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
    publisher: EventPublisher | None = None,
    engine_factory: Callable[[], Engine] | None = None,
) -> Container:
    """設定を検証して Container を作る。DB にも S3 にも接続しない。

    settings を省くと環境変数から読む。明示したときは DATABASE_URL などを読まない。
    credentials は接続を張るたびに呼ばれるので、ここでは呼ばれない。
    engine_factory を渡すと、Engine の作り方を丸ごと差し込む。credentials とは同時に渡せない。

    publisher はドメインイベントの送り先。ENV が local 以外では必須で、省くと SettingsError。
    ログに出すだけの既定の送り先のまま、本番でイベントを失う事故を防ぐため。
    local では省ける(LoggingEventPublisher)。

    返り値がただ 1 つの取っ手になる。モジュールのグローバルに持たず、
    プロセスの入口(FastAPI の lifespan や main())から呼ぶ。
    """
    settings = settings or Settings.from_env()
    validate_environment(settings)
    if settings.env != "local" and publisher is None:
        raise SettingsError("event publisher must be configured outside local")
    if engine_factory is not None and credentials is not None:
        raise SettingsError("engine_factory and credentials cannot be combined")
    return Container(
        settings,
        event_publisher=publisher,
        engine_factory=engine_factory or (lambda: make_engine(
            settings.database_url,
            echo=settings.echo,
            pool_size=settings.pool_size,
            max_overflow=settings.max_overflow,
            pool_timeout=settings.pool_timeout,
            pool_recycle=settings.pool_recycle,
            pool_pre_ping=settings.pool_pre_ping,
            credentials=credentials,
            statement_timeout_ms=settings.statement_timeout_ms,
            lock_timeout_ms=settings.lock_timeout_ms,
        )),
    )


def check_database(container: Container) -> None:
    """DB に接続できること、アプリ用のロールであること、スキーマの版が合っていることを確かめる。

    DB を使うプロセスだけが、起動時に 1 度呼ぶ。次のとおり失敗する。

    - 接続できない: DependencyError(db_unavailable など)
    - 接続中のロールがスキーマに CREATE できる(マイグレーション用): SettingsError
    - shop.alembic_version がライブラリの head と違う、または無い: SettingsError
      (マイグレーションの適用前に、新しいコードを起動しない)
    """
    engine = container.engine()
    with translated_errors():
        assert_app_role(engine)
        with engine.connect() as conn:
            try:
                revision = conn.scalar(text(f"select version_num from {SCHEMA}.alembic_version"))
            except ProgrammingError:
                raise SettingsError(
                    f"{SCHEMA}.alembic_version not found; apply the migrations first"
                ) from None
    if revision != HEAD_REVISION:
        raise SettingsError(
            f"database schema is at {revision}, library expects {HEAD_REVISION}"
        )


def check_image_store(container: Container) -> None:
    """設定のバケットに head_bucket が通ることを確かめる。

    ストアを使うプロセスだけが、起動時に 1 度呼ぶ。失敗は ArtifactStoreError。
    """
    container.image_store().ping()
