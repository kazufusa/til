"""DI コンテナ。アプリチームはこれを 1 つ作って wire するだけ。

    container = Container()
    container.wire(modules=[__name__])

接続設定は DATABASE_URL と SQL_ECHO を最初の DB アクセスで読む。
明示的に渡すときは次のようにする:

    Container(settings=providers.Object(Settings(database_url="...")))

複数の操作を 1 トランザクションにまとめるときは transaction() を使う:

    with container.transaction() as tx:
        user_service.register(...)
        tx.execute(text("..."))
        order_service.place(...)

Engine を自前で作るとき(接続ごとの資格情報など)は、factory を渡す。
このとき DATABASE_URL は読まれない:

    Container(engine_factory=providers.Object(lambda: make_engine(url, credentials=get_secret)))

サービスを使わない直接の SQL や LISTEN/NOTIFY は container.db() を使う。
全テーブルの mapped class は shop_core.tables にある。
db にフェイクはないので、Postgres で確かめる:

    with container.db().connect() as conn:
        conn.execute(text("..."))

テストでは fake_backend で uow と transaction をまとめて差し替える:

    with fake_backend(container, state):
        ...
"""

from collections.abc import Callable

from dependency_injector import containers, providers
from sqlalchemy import Engine

from shop_core.infra.artifact_store import S3ImageStore
from shop_core.infra.database import Database
from shop_core.infra.events import LoggingEventPublisher
from shop_core.infra.db import make_engine, make_session_factory
from shop_core.settings import Settings
from shop_core.usecase.services import ExecutionService, OrderService, ProductService, UserService
from shop_core.usecase.async_support import AsyncTransactionScope
from shop_core.usecase.transaction import TransactionScope
from shop_core.usecase.uow import SqlAlchemyUnitOfWork


def _build_engine(factory: Callable[[], Engine] | None, default: Callable[[], Engine]) -> Engine:
    return (factory or default)()


class Container(containers.DeclarativeContainer):
    # 環境変数は engine を初めて作るときに読む。フェイクだけのテストでは読まれない
    settings = providers.Singleton(Settings.from_env)

    # 既定の Engine。Settings から作る。engine_factory を渡したときは呼ばれない
    settings_engine = providers.Singleton(
        make_engine,
        database_url=settings.provided.database_url,
        echo=settings.provided.echo,
        pool_size=settings.provided.pool_size,
        max_overflow=settings.provided.max_overflow,
        pool_timeout=settings.provided.pool_timeout,
        pool_recycle=settings.provided.pool_recycle,
        pool_pre_ping=settings.provided.pool_pre_ping,
    )

    # 外から Engine の作り方を渡す口。None なら settings_engine を使う。
    # Container(engine_factory=providers.Object(fn)) で fn() -> Engine を差し込める
    engine_factory = providers.Object(None)

    engine = providers.Singleton(
        _build_engine, factory=engine_factory, default=settings_engine.provider
    )
    session_factory = providers.Singleton(make_session_factory, engine=engine)

    # 生の接続の窓口。fake_backend では差し替わらない
    db = providers.Singleton(Database, engine=engine)

    # ドメインイベントの送り先。最も外側の commit が成功したあとに publish される。fake_backend では InMemoryEventPublisher に差し替わる
    event_publisher = providers.Singleton(LoggingEventPublisher)

    # Factory なのでサービスが呼ぶたびに新しい UoW(=新しい Session)になる
    uow = providers.Factory(
        SqlAlchemyUnitOfWork, session_factory=session_factory, publisher=event_publisher
    )

    # container.transaction() が with に渡せる。スコープの中のサービス呼び出しは同じ Session に参加し、抜けるときに 1 回だけ commit する
    transaction = providers.Factory(
        TransactionScope, session_factory=session_factory, publisher=event_publisher
    )

    # async 用。async with container.transaction_async() as tx: で使う。同期のスコープと同じ ContextVar を使う
    transaction_async = providers.Factory(
        AsyncTransactionScope, session_factory=session_factory, publisher=event_publisher
    )

    user_service = providers.Singleton(UserService, uow=uow.provider)
    product_service = providers.Singleton(ProductService, uow=uow.provider)
    order_service = providers.Singleton(OrderService, uow=uow.provider)

    execution_service = providers.Singleton(ExecutionService, uow=uow.provider)

    # オブジェクトストレージ。fake_backend では InMemoryImageStore に差し替わる
    image_store = providers.Singleton(
        S3ImageStore,
        bucket=settings.provided.artifact_bucket,
        endpoint_url=settings.provided.s3_endpoint_url,
        public_endpoint_url=settings.provided.s3_public_endpoint_url,
        region=settings.provided.s3_region,
    )
