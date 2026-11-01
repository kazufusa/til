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

サービスを使わない直接の SQL や LISTEN/NOTIFY は container.db() を使う。
全テーブルの mapped class は shop_core.tables にある。
db にフェイクはないので、Postgres で確かめる:

    with container.db().connect() as conn:
        conn.execute(text("..."))

テストでは fake_backend で uow と transaction をまとめて差し替える:

    with fake_backend(container, state):
        ...
"""

from dependency_injector import containers, providers

from shop_core.infra.database import Database
from shop_core.infra.db import make_engine, make_session_factory
from shop_core.settings import Settings
from shop_core.usecase.services import OrderService, ProductService, UserService
from shop_core.usecase.transaction import TransactionScope
from shop_core.usecase.uow import SqlAlchemyUnitOfWork


class Container(containers.DeclarativeContainer):
    # 環境変数は engine を初めて作るときに読む。フェイクだけのテストでは読まれない
    settings = providers.Singleton(Settings.from_env)

    engine = providers.Singleton(
        make_engine,
        database_url=settings.provided.database_url,
        echo=settings.provided.echo,
        pool_size=settings.provided.pool_size,
        max_overflow=settings.provided.max_overflow,
        pool_timeout=settings.provided.pool_timeout,
        pool_recycle=settings.provided.pool_recycle,
        pool_pre_ping=settings.provided.pool_pre_ping,
    )
    session_factory = providers.Singleton(make_session_factory, engine=engine)

    # 生の接続の窓口。fake_backend では差し替わらない
    db = providers.Singleton(Database, engine=engine)

    # Factory なのでサービスが呼ぶたびに新しい UoW(=新しい Session)になる
    uow = providers.Factory(SqlAlchemyUnitOfWork, session_factory=session_factory)

    # container.transaction() が with に渡せる。スコープの中のサービス呼び出しは同じ Session に参加し、抜けるときに 1 回だけ commit する
    transaction = providers.Factory(TransactionScope, session_factory=session_factory)

    user_service = providers.Singleton(UserService, uow=uow.provider)
    product_service = providers.Singleton(ProductService, uow=uow.provider)
    order_service = providers.Singleton(OrderService, uow=uow.provider)
