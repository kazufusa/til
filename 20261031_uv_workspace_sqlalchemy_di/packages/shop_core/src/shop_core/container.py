"""DI コンテナ。アプリチームはこれを 1 つ作って、リクエストの処理から呼ぶだけ。

    container = Container()
    container.user_service().register(...)

仕組みは shop_core.di の provider デコレータだけで、外部の DI ライブラリは使わない。
singleton は初回に 1 度だけ作り、factory は呼ぶたびに作る。

接続設定は DATABASE_URL と SQL_ECHO を最初の DB アクセスで読む。
明示的に渡すときは次のようにする:

    Container(Settings(database_url="..."))

複数の操作を 1 トランザクションにまとめるときは transaction() を使う:

    with container.transaction() as tx:
        user_service.register(...)
        tx.execute(text("..."))
        order_service.place(...)

Engine を自前で作るとき(接続ごとの資格情報など)は、factory を渡す。
このとき DATABASE_URL は読まれない:

    Container(engine_factory=lambda: make_engine(url, credentials=get_secret))

ドメインイベントの送り先は event_publisher= で渡す。省くとログに出すだけの
LoggingEventPublisher になる(ローカル向け。ローカル以外は build_container が明示を求める):

    Container(settings, event_publisher=MyBrokerPublisher())

サービスを使わない直接の SQL や LISTEN/NOTIFY は container.db() を使う。
全テーブルの mapped class は shop_core.tables にある。
db にフェイクはないので、Postgres で確かめる:

    with container.db().connect() as conn:
        conn.execute(text("..."))

テストでは fake_backend で uow と transaction をまとめて差し替える。
個別に差し替えるときは override に関数を渡す:

    with fake_backend(container, state):
        ...
    with container.override(event_publisher=lambda: publisher):
        ...
"""

from collections.abc import Callable

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from shop_core.di import ContainerBase, provider
from shop_core.domain.ports import EventPublisher
from shop_core.infra.artifact_store import S3ImageStore
from shop_core.infra.database import Database
from shop_core.infra.events import LoggingEventPublisher
from shop_core.infra.db import make_engine, make_session_factory
from shop_core.settings import Settings
from shop_core.usecase.services import ExecutionService, OrderService, ProductService, UserService
from shop_core.usecase.async_support import AsyncTransactionScope
from shop_core.usecase.transaction import TransactionScope
from shop_core.usecase.uow import SqlAlchemyUnitOfWork


class Container(ContainerBase):
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        engine_factory: Callable[[], Engine] | None = None,
        event_publisher: EventPublisher | None = None,
    ) -> None:
        super().__init__()
        self._settings = settings
        # 外から publisher を渡す口。None なら LoggingEventPublisher(ログに出すだけ)
        self._event_publisher = event_publisher
        # 外から Engine の作り方を渡す口。None なら settings から作る
        self._engine_factory = engine_factory

    # 環境変数は最初に使うときに読む。フェイクだけのテストでは読まれない
    @provider(singleton=True)
    def settings(self) -> Settings:
        return self._settings if self._settings is not None else Settings.from_env()

    # engine_factory を渡したときは Settings の DB 接続設定を使わない
    @provider(singleton=True)
    def engine(self) -> Engine:
        if self._engine_factory is not None:
            return self._engine_factory()
        s = self.settings()
        return make_engine(
            database_url=s.database_url,
            echo=s.echo,
            pool_size=s.pool_size,
            max_overflow=s.max_overflow,
            pool_timeout=s.pool_timeout,
            pool_recycle=s.pool_recycle,
            pool_pre_ping=s.pool_pre_ping,
            statement_timeout_ms=s.statement_timeout_ms,
            lock_timeout_ms=s.lock_timeout_ms,
        )

    @provider(singleton=True)
    def session_factory(self) -> sessionmaker[Session]:
        return make_session_factory(self.engine())

    # 生の接続の窓口。fake_backend では差し替わらない
    @provider(singleton=True)
    def db(self) -> Database:
        return Database(self.engine())

    # ドメインイベントの送り先。最も外側の commit が成功したあとに publish される。fake_backend では InMemoryEventPublisher に差し替わる
    @provider(singleton=True)
    def event_publisher(self) -> EventPublisher:
        if self._event_publisher is not None:
            return self._event_publisher
        return LoggingEventPublisher()

    # factory なのでサービスが呼ぶたびに新しい UoW(=新しい Session)になる
    @provider()
    def uow(self) -> SqlAlchemyUnitOfWork:
        return SqlAlchemyUnitOfWork(
            session_factory=self.session_factory(), publisher=self.event_publisher()
        )

    # container.transaction() が with に渡せる。スコープの中のサービス呼び出しは同じ Session に参加し、抜けるときに 1 回だけ commit する
    @provider()
    def transaction(self) -> TransactionScope:
        return TransactionScope(
            session_factory=self.session_factory(), publisher=self.event_publisher()
        )

    # async 用。async with container.transaction_async() as tx: で使う。同期のスコープと同じ ContextVar を使う
    @provider()
    def transaction_async(self) -> AsyncTransactionScope:
        return AsyncTransactionScope(
            session_factory=self.session_factory(), publisher=self.event_publisher()
        )

    # サービスには self.uow(束縛メソッド)を渡す。呼ぶたびに override を見るので、
    # サービスを先に作っていても fake_backend の差し替えが効く
    @provider(singleton=True)
    def user_service(self) -> UserService:
        return UserService(uow=self.uow)

    @provider(singleton=True)
    def product_service(self) -> ProductService:
        return ProductService(uow=self.uow)

    @provider(singleton=True)
    def order_service(self) -> OrderService:
        return OrderService(uow=self.uow)

    @provider(singleton=True)
    def execution_service(self) -> ExecutionService:
        return ExecutionService(uow=self.uow)

    # オブジェクトストレージ。fake_backend では InMemoryImageStore に差し替わる
    @provider(singleton=True)
    def image_store(self) -> S3ImageStore:
        s = self.settings()
        return S3ImageStore(
            bucket=s.artifact_bucket,
            endpoint_url=s.s3_endpoint_url,
            public_endpoint_url=s.s3_public_endpoint_url,
            region=s.s3_region,
        )
