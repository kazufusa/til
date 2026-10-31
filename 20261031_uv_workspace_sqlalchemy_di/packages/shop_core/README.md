# shop_core

アプリチーム向けの共有ライブラリです。
ユーザー、商品、注文のドメインモデルと、それを操作するユースケースサービスを提供します。
DB の接続、トランザクション、マイグレーションはこのライブラリが持ちます。

アプリチームがやることは 3 つです。

- `Container` を 1 つ作って wire する(接続は環境変数 `DATABASE_URL` から読まれる)
- サービスを DI で受け取って呼ぶ
- `DomainError` を HTTP ステータスに変換する

`Session` や `commit()` を書く必要はありません。
書いてしまうと、トランザクション境界がサービスとずれるので、書かないでください。

## 導入

ワークスペース内のアプリは `pyproject.toml` に次を書きます。
`<app>` はアプリのディレクトリ名に置き換えてください。

```toml
[project]
name = "<app>"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = ["shop-core", "fastapi", "uvicorn"]

[tool.uv.sources]
shop-core = { workspace = true }

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/<app>"]
dev-mode-dirs = ["src"]
```

`dev-mode-dirs` は、app1 のようにアプリがワークスペースの直下にあるときに必要です。
直下のディレクトリ名が `src/<app>` を隠すのを防ぎます。

`dependency_injector.wiring` や `sqlalchemy.text` は、アプリから import して構いません。
`pyproject.toml` に書かなくても、shop_core がバージョンを保証します。

import は `shop_core` の直下からだけ行います。

```python
from shop_core import (
    Container, Settings, SettingsError,
    UserService, ProductService, OrderService,
    User, Product, Order, OrderLine,
    DomainError, NotFoundError, UserNotFoundError, ProductNotFoundError, InsufficientStockError,
)
```

`shop_core.infra` と `shop_core.usecase.uow` はアプリから import しないでください。
内部構造なので予告なく変えます。

## ドメインモデル

すべて SQLAlchemy に依存しない `dataclass` です。
サービスが返すのはこの型で、ORM のオブジェクトは外に出しません。
受け取った後に lazy load や session の寿命を気にする必要はありません。

### User

| 属性 | 型 | 説明 |
|---|---|---|
| `id` | `int \| None` | 永続化前は `None` |
| `email` | `str` | 一意。同じ email で `register` すると既存のものが返ります |
| `name` | `str` | 表示名 |

### Product

| 属性 | 型 | 説明 |
|---|---|---|
| `id` | `int \| None` | |
| `name` | `str` | |
| `price` | `int` | 税込の円。小数は扱いません |
| `stock` | `int` | 在庫数。負にはなりません |

`reserve(quantity)` で在庫を引き当てます。
足りなければ `InsufficientStockError` を投げ、在庫は変わりません。
アプリから直接呼ぶものではなく、`OrderService.place` の中で使われます。

### Order と OrderLine

| 属性 | 型 | 説明 |
|---|---|---|
| `Order.id` | `int \| None` | |
| `Order.user_id` | `int` | 注文したユーザー |
| `Order.lines` | `list[OrderLine]` | 明細。空の注文も作れます |
| `Order.created_at` | `datetime \| None` | DB が付けます。タイムゾーン付き |
| `Order.total` | `int` | 明細の小計の合計(プロパティ) |
| `OrderLine.product_id` | `int` | |
| `OrderLine.quantity` | `int` | |
| `OrderLine.unit_price` | `int` | 注文時点の単価。後で商品の価格が変わっても動きません |
| `OrderLine.subtotal` | `int` | `quantity * unit_price`(プロパティ) |

### 不変条件

モデルとサービスが守るルールです。アプリ側で二重に検査する必要はありません。

- email は一意です
- 在庫は負になりません
- 注文の明細は、注文時点の単価を保持します
- 注文の作成と在庫の引き当ては同時に成功するか、同時に失敗します

## ユースケースサービス

サービスのメソッド 1 回が、トランザクション 1 回です。
メソッドの中で DB セッションを開き、成功すれば commit、例外なら rollback して閉じます。
呼ぶ側はメソッドの戻り値だけを見ればよく、途中の状態を気にする必要はありません。

逆に言うと、2 つのメソッドを続けて呼んでも、そのままでは 1 つのトランザクションになりません。
まとめたいときは `container.transaction()` を使います(後述)。

### UserService

| メソッド | 戻り値 | 例外 | 説明 |
|---|---|---|---|
| `register(email, name)` | `User` | | 登録します。同じ email があれば既存の `User` を返します(冪等) |
| `get(user_id)` | `User` | `UserNotFoundError` | |
| `list()` | `list[User]` | | id 順 |

### ProductService

| メソッド | 戻り値 | 例外 | 説明 |
|---|---|---|---|
| `add(name, price, stock)` | `Product` | | |
| `list()` | `list[Product]` | | id 順 |

### OrderService

| メソッド | 戻り値 | 例外 | 説明 |
|---|---|---|---|
| `place(user_id, items)` | `Order` | `UserNotFoundError`, `ProductNotFoundError`, `InsufficientStockError` | `items` は `(product_id, quantity)` の列。在庫を引き当てて注文を作ります |
| `list_by_user(user_id)` | `list[Order]` | | id 順。ユーザーが存在しなければ空のリスト |

`place` は商品ごとに行ロックを取ります。
同じ商品に同時に注文が来ても、在庫が負になることはありません。
`items` の途中で在庫が足りなければ、それ以前の商品の引き当ても戻ります。

### 例外

```
DomainError
├── NotFoundError
│   ├── UserNotFoundError      .user_id
│   └── ProductNotFoundError   .product_id
└── InsufficientStockError     .product_id .requested .available
```

HTTP に変換するなら、`NotFoundError` を 404、それ以外の `DomainError` を 409 にするのが目安です。
`str(exc)` は人が読める英語のメッセージです。そのまま `detail` に入れて構いません。
`Product.id` が `None` の商品で `InsufficientStockError` が出たときは、`product_id` が 0 になります。

## 使い方

### Container の作成

アプリのモジュールで 1 つだけ作ります。

```python
from shop_core import Container

container = Container()
```

接続設定はライブラリが環境変数から読みます。
アプリ側で `DATABASE_URL` を渡すコードは書きません。

#### 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | はい | `postgresql+psycopg://user:pass@host:5432/db` の形式 |
| `SQL_ECHO` | いいえ | `1`、`true`、`yes`(大文字小文字は問わない)で SQL をログに出します。既定は出さない |

環境変数は、最初に DB へアクセスするときに読みます。
`DATABASE_URL` がなければ、そこで `SettingsError` を投げます。
起動時に失敗させたいなら、`Settings.from_env()` を先に呼んで確かめられます。
`Container()` を作る時点では読まないので、フェイクだけのテストに環境変数は要りません。

テストや CLI で明示的に渡すときは、`settings` を差し替えます。

```python
from dependency_injector import providers
from shop_core import Container, Settings

container = Container(
    settings=providers.Object(Settings(database_url="postgresql+psycopg://...", echo=True))
)
```

`Container` のうち、アプリから使ってよいのは次の 4 つです。

- `Container.user_service`
- `Container.product_service`
- `Container.order_service`
- `Container.transaction`(後述)

`settings` は差し替えるときだけ触ります。
`engine`、`session_factory`、`uow` も見えますが、アプリからは触らないでください。
テストでの `uow` の差し替えは例外です。

### FastAPI での wiring

```python
from dependency_injector.wiring import Provide, inject
from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from shop_core import Container, DomainError, NotFoundError, OrderService

container = Container()

app = FastAPI()


class ItemIn(BaseModel):
    product_id: int
    quantity: int


class OrderIn(BaseModel):
    user_id: int
    items: list[ItemIn]


@app.post("/orders", status_code=201)
@inject
def place_order(body: OrderIn, svc: OrderService = Depends(Provide[Container.order_service])):
    return svc.place(body.user_id, [(i.product_id, i.quantity) for i in body.items])


@app.exception_handler(DomainError)
def domain_error(_, exc: DomainError):
    status = 404 if isinstance(exc, NotFoundError) else 409
    return JSONResponse({"detail": str(exc)}, status_code=status)


container.wire(modules=[__name__])   # ルートを定義した後、モジュールの末尾で呼ぶ
```

`@inject` は `@app.post` より内側に付けます。
`container.wire` はルートを全部定義した後に呼びます。ルーターを別モジュールに分けたら、そのモジュールも `modules=[...]` に並べます。

サービスの戻り値は `dataclass` なので、pydantic の `response_model` にそのまま渡せます。
`Order.total` のようなプロパティも、`response_model` に同名のフィールドがあれば拾われます。

### FastAPI 以外

DI を使わない場面では、コンテナから直接取り出せます。

```python
svc = container.order_service()
order = svc.place(user_id=1, items=[(1, 3)])
```

バッチや CLI はこの形で十分です。
環境変数を使わないときは、前述の `settings` の差し替えで接続先を渡します。

## テスト

DB なしでテストできます。
`shop_core.testing` にあるフェイクの UnitOfWork に、コンテナの `uow` だけ差し替えます。

```python
import pytest
from dependency_injector import providers
from fastapi.testclient import TestClient

from app1.main import app, container
from shop_core.testing import FakeUnitOfWork, InMemoryState


@pytest.fixture
def client():
    with container.uow.override(providers.Factory(FakeUnitOfWork, state=InMemoryState())):
        yield TestClient(app)
```

フェイクは本物と同じ 3 点を守ります。

- サービスが `commit()` するまで、他の呼び出しから変更が見えない
- 例外で抜けた変更は捨てられる
- `id` はフェイクが採番する

`InMemoryState` の属性は次のとおりです。

- `users`、`products`、`orders`: id をキーにした `dict`
- `next_id()`: 次の id を返します

id は、ユーザー、商品、注文を通した 1 本の連番です。
ユーザーと商品が同じ id になることはないので、「ユーザー 1、商品 1」を前提にしないでください。
id が必要なら、`next(iter(state.users))` のように state から取り出します。

他チームの持ち物(たとえば app2 のテストでのユーザー)は、`InMemoryState` に直接積めます。

```python
@pytest.fixture
def state():
    st = InMemoryState()
    uid = st.next_id()
    st.users[uid] = User(id=uid, email="a@example.com", name="A")
    return st
```

商品や注文は、`fake_backend` の中でサービスを呼んで積むのが簡単です(後述)。
`container.product_service().add(...)` が id を採番します。

本物の Postgres で確かめたいときは、`Container(settings=providers.Object(Settings(database_url=...)))` でテスト用 DB を渡します。
テーブルは、基盤チームの `alembic upgrade head` で先に作っておきます。

## 複数の操作を 1 トランザクションにまとめる

サービス呼び出しと直接 SQL を、1 つのトランザクションで続けて実行できます。
`container.transaction()` で囲みます。

```python
from sqlalchemy import text

with container.transaction() as tx:
    user = container.user_service().register("a@example.com", "A")
    n = tx.execute(text("select count(*) from products")).scalar_one()
    container.order_service().place(user.id, [(1, 1)])
```

直接 SQL で行うのは読み取りです。
`users`、`products`、`orders`、`order_lines` への書き込みは、サービスを通します。

スコープの中のサービスは commit しません。
commit は `with` を抜けるときに 1 回だけ行います。
途中で例外が出ると、サービス呼び出しも直接 SQL も、すべて rollback されます。

スコープの中で、サービスは互いの未 commit の変更を見られます。
登録したばかりのユーザーに、同じスコープで注文を作れます。

`tx.session` で `Session` を取り出せます。
`tx.execute(statement, params)` はその短縮形です。
読み取りのクエリに使います。shop_core のテーブルへの書き込みには使いません。

スコープは入れ子にできます。
内側の `transaction()` は外側に参加するだけで、独自には commit も rollback もしません。
内側で例外が出て外側まで伝われば、外側の rollback で全部戻ります。

`transaction()` を使うコードをテストするときは、`uow` だけでなく `transaction` も差し替えます。
`fake_backend` が両方をまとめて差し替えます。

```python
from shop_core.testing import InMemoryState, fake_backend

with fake_backend(container, InMemoryState()):
    ...
```

フェイクの `tx` が持つのは `tx.state` だけです。
`tx.execute`、`tx.session`、`tx.flush` を呼ぶと `AttributeError` になります。

直接 SQL の部分は小さな関数に切り出し、フェイクのテストではその関数を差し替えます。
関数そのものは、Postgres のテストで確かめてください。

```python
# アプリ側
def count_products(tx) -> int:
    return tx.execute(text("select count(*) from products")).scalar_one()

# フェイクのテスト側
monkeypatch.setattr(app_main, "count_products", lambda tx: 0)
```

### ルートでの transaction

サービスを `Depends` で受け取るルートでも、`container.transaction()` で囲めます。
受け取ったサービスは、スコープの中で呼べば同じトランザクションに参加します。

```python
@app.get("/report/{user_id}")
@inject
def report(
    user_id: int,
    users: UserService = Depends(Provide[Container.user_service]),
    orders: OrderService = Depends(Provide[Container.order_service]),
):
    with container.transaction() as tx:
        user = users.get(user_id)
        user_orders = orders.list_by_user(user_id)
        product_count = count_products(tx)
    return {"user": user.name, "orders": len(user_orders), "products": product_count}
```

## マイグレーション

テーブルは `shop_core` が所有します。アプリチームは alembic を実行しません。
デプロイでは `shop_core` のディレクトリで `alembic upgrade head` を、アプリの起動より先に 1 回走らせます。
`docker-compose.yml` の `migrate` サービスがその例です。

アプリ側で独自のテーブルを持ちたい場合は、別の DB か別のスキーマにしてください。
同じテーブルを 2 チームが触る構成にはしません。

## 機能の追加を依頼するとき

サービスにメソッドがない操作を見つけたら、`shop_core` に追加を依頼してください。
アプリ側で `Session` を取り出して SQL を書くのではなく、依頼する側に回ってください。
依頼には次の 3 点を書くと早く済みます。

- どの操作を、どの単位で不可分にしたいか(「在庫引き当てと注文作成を同時に」のように)
- 失敗したときに何を知りたいか(例外に欲しい属性)
- 既存のメソッドで足りない理由

ドメインのルールを変える依頼(たとえば「在庫が負になってよい」)は、モデルの変更になります。
モデルの変更はすべてのアプリに影響するので、先に相談してください。

## やらないこと

- `shop_core.infra` を import する
- `container.session_factory()` や `container.uow()` を呼ぶ
- サービスの戻り値の `dataclass` を書き換えて、それが保存されることを期待する(保存されません)
- `transaction()` の外で 2 つのサービス呼び出しが 1 トランザクションになることを期待する
- アプリ側で `users`、`products`、`orders`、`order_lines` に書き込む SQL を発行する(読み取りの `tx.execute` は構いません)
