# shop_core

アプリチーム向けの共有ライブラリです。
ユーザー、商品、注文のドメインモデルと、それを操作するユースケースサービスを配ります。
DB の接続、トランザクション、全テーブルの mapped class、マイグレーションもこのライブラリが持ちます。

アプリチームがやることは 3 つです。

- `Container` を 1 つ作って wire します(接続は環境変数 `DATABASE_URL` から読まれます)
- サービスを DI で受け取って呼びます
- `DomainError` を HTTP ステータスに変換します

アプリは `Session` の生成も `commit()` も書きません。
設計の理由は [ADR 0001](../../docs/adr/0001-shop-core-owned-shared-library.md) にあります。

## 導入

ワークスペース内のアプリは `pyproject.toml` に次を書きます。
`requires-python` と `[build-system]` は省略しています。
`<app>` はアプリのディレクトリ名に置き換えてください。

```toml
[project]
name = "<app>"
dependencies = ["shop-core", "fastapi", "uvicorn"]

[tool.uv.sources]
shop-core = { workspace = true }

[tool.hatch.build.targets.wheel]
packages = ["src/<app>"]
dev-mode-dirs = ["src"]
```

`dev-mode-dirs` は、アプリがワークスペースの直下にあるときに必要です。
直下のディレクトリ名が `src/<app>` を隠すのを防ぎます。

`dependency_injector.wiring` や `sqlalchemy.text` は、アプリから import して構いません。
`pyproject.toml` に書かなくても、shop_core がバージョンを保証します。

import できるのは、次の 3 つです。

- `shop_core` の直下は、`__all__` にある名前です
- `shop_core.tables` は、全テーブルの mapped class です
- `shop_core.testing` は、テスト用のフェイクです

`__all__` の一覧は `src/shop_core/__init__.py` にあります。
`shop_core.infra` と `shop_core.usecase.uow` は内部構造なので、アプリから import しないでください。
予告なく変えます。

## ドメインモデル

SQLAlchemy に依存しない `dataclass` です。
サービスは ORM のオブジェクトを外に出さないので、lazy load や session の寿命を気にする必要はありません。

| 型 | 属性 |
|---|---|
| `User` | `id: int \| None`(永続化前は `None`)、`email: str`(一意)、`name: str` |
| `Product` | `id`、`name`、`price: int`(税込の円)、`stock: int`(負にならない) |
| `Order` | `id`、`user_id`、`lines: list[OrderLine]`、`created_at`(DB が付ける。タイムゾーン付き)、`total`(プロパティ) |
| `OrderLine` | `product_id`、`quantity`、`unit_price`(注文時点の単価)、`subtotal`(プロパティ) |

`Product.reserve(quantity)` は在庫を引き当てます。
アプリから直接呼ぶものではなく、`OrderService.place` の中で使われます。

email の一意と、在庫が負にならないことは、モデルとサービスが守ります。
注文の作成と在庫の引き当ては、同時に成功するか同時に失敗します。
サービスは入力も検査します。
`place` は数量が 1 未満なら `InvalidQuantityError`、`items` が空なら `EmptyOrderError` を投げます。
`ProductService.add` は価格か在庫が負なら `InvalidProductError` を投げます。
アプリ側で二重に検査する必要はありません。
在庫が負にならないことと、明細の数量が正であることは、DB の CHECK 制約も最後の砦として守ります。

## ユースケースサービス

サービスのメソッド 1 回が、トランザクション 1 回です。
成功すれば commit、例外なら rollback します。
そのため、2 つのメソッドを続けて呼んでも、そのままでは 1 つのトランザクションになりません。
まとめたいときは `container.transaction()` を使います(後述)。

| メソッド | 戻り値 | 例外 | 説明 |
|---|---|---|---|
| `UserService.register(email, name)` | `User` | | 同じ email があれば既存の `User` を返します(冪等) |
| `UserService.get(user_id)` | `User` | `UserNotFoundError` | |
| `UserService.list()` | `list[User]` | | id 順 |
| `ProductService.add(name, price, stock)` | `Product` | `InvalidProductError` | 価格か在庫が負のとき |
| `ProductService.list()` | `list[Product]` | | id 順 |
| `OrderService.place(user_id, items)` | `Order` | `UserNotFoundError`, `ProductNotFoundError`, `InsufficientStockError`, `InvalidQuantityError`, `EmptyOrderError` | `items` は `(product_id, quantity)` の列 |
| `OrderService.list_by_user(user_id)` | `list[Order]` | | id 順。ユーザーがなければ空 |

`place` は商品ごとに、product_id の順で行ロックを取ります。
同時の注文どうしのデッドロックを避けるためで、`order.lines` は渡した順のままです。
同じ商品に同時に注文が来ても、在庫が負になることはありません。
`items` の途中で在庫が足りなければ、それ以前の商品の引き当ても戻ります。

### 例外

```
DomainError
├── NotFoundError
│   ├── UserNotFoundError      .user_id
│   └── ProductNotFoundError   .product_id
├── InsufficientStockError     .product_id .requested .available
├── InvalidQuantityError
├── EmptyOrderError
└── InvalidProductError
```

HTTP に変換するなら、`NotFoundError` を 404、それ以外の `DomainError` を 409 にするのが目安です。
入力の誤り(`InvalidQuantityError`、`EmptyOrderError`、`InvalidProductError`)は 400 が自然です。
`str(exc)` は人が読める英語のメッセージなので、そのまま `detail` に入れて構いません。
`Product.id` が `None` の商品で `InsufficientStockError` が出たときは、`product_id` が 0 になります。

## Container

アプリのモジュールで 1 つだけ作ります。
アプリ側で `DATABASE_URL` を渡すコードは書きません。

アプリが使う属性は、`user_service`、`product_service`、`order_service`、`transaction`、`db` です。
`settings` は差し替えるときだけ触ります。
`engine`、`session_factory`、`uow` は触らないでください。テストでの `uow` の差し替えは `fake_backend` が行います。

独自の依存を足すときは、自前のコンテナで `providers.Container` を使い、`Container` を入れ子にします。
app2 の `AppContainer` が実例で、サービスは `Provide[AppContainer.core.user_service]` のように受け取ります。

### FastAPI での wiring

```python
from dependency_injector.wiring import Provide, inject
from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from shop_core import Container, DomainError, NotFoundError, OrderService

container = Container()

app = FastAPI()


class OrderIn(BaseModel):
    user_id: int
    items: list[tuple[int, int]]  # (product_id, quantity)


@app.post("/orders", status_code=201)
@inject
def place_order(body: OrderIn, svc: OrderService = Depends(Provide[Container.order_service])):
    return svc.place(body.user_id, body.items)


@app.exception_handler(DomainError)
def domain_error(_, exc: DomainError):
    status = 404 if isinstance(exc, NotFoundError) else 409
    return JSONResponse({"detail": str(exc)}, status_code=status)


container.wire(modules=[__name__])   # ルートを定義した後、モジュールの末尾で呼ぶ
```

`@inject` は `@app.post` より内側に付けます。
ルーターを別モジュールに分けたら、そのモジュールも `modules=[...]` に並べます。

サービスの戻り値は `dataclass` なので、pydantic の `response_model` にそのまま渡せます。
`Order.total` のようなプロパティも、`response_model` に同名のフィールドがあれば拾われます。

バッチや CLI は DI を使わず、`container.order_service()` のように直接取り出せます。

## transaction() による複数操作の結合

サービス呼び出しと直接の SQL や ORM は、`container.transaction()` で囲むと 1 トランザクションになります。
`Depends` で受け取ったサービスを使うルートでも、同じです。

```python
from sqlalchemy import text

with container.transaction() as tx:
    user = container.user_service().register("a@example.com", "A")
    n = tx.execute(text("select count(*) from v_product_stock")).scalar_one()
    container.order_service().place(user.id, [(1, 1)])
```

スコープの中のサービスは commit せず、`with` を抜けるときに 1 回だけ commit します。
サービスは互いの未 commit の変更を見られます。

例外が `with` の外まで出ると、サービス呼び出しも直接の書き込みも、すべて rollback されます。
スコープの中で例外を捕まえたときは、例外を出したサービス呼び出しの書き込みだけが戻ります。
スコープの中のサービス呼び出しは、それぞれセーブポイントを張るためです。
残りの処理は続き、`with` を抜けるときに commit されます。

```python
with container.transaction():
    try:
        container.order_service().place(user.id, [(1, 999)])
    except InsufficientStockError:
        pass    # この注文だけが戻る
    container.order_service().place(user.id, [(2, 1)])
```

直接の SQL や ORM の書き込みは、自動ではセーブポイントを張りません。

`tx.session` が `Session` で、`tx.execute(statement, params)` と `tx.flush()` はその短縮形です。
スコープは入れ子にでき、内側のスコープもセーブポイントを張ります。
内側のスコープから出た例外を外側で捕まえると、内側の書き込みだけが戻ります。

スコープは ContextVar で引き継ぎます。
新しいスレッドで動くコードには ContextVar が引き継がれないので、呼び出し元の `transaction()` に参加しません。
asyncio のタスクはコンテキストを引き継ぐので、同じ Session を共有します。
そのため、スコープの中で複数のタスクを同時に動かさないでください。
`with` を抜けると Session は閉じるので、そのあとに別のタスクからオブジェクトを使わないでください。

## DB への直接アクセス

不変条件が絡む操作(在庫の引き当て、注文の作成)は、サービスを使います。
ORM で `Product.stock` を書き換えると、サービスが守る検査と行ロックを通りません。
サービスが無い単純な insert や update は、ORM で直接書いて構いません。

テーブルとビューは `shop` スキーマにあります。
接続の `search_path` も `shop` なので、生 SQL でスキーマ名は省けます。
`public` は使いません。

### 接続

`container.db()` が返す `Database` は、engine や sessionmaker を出さず、4 つのメソッドだけを持ちます。

- `connect()` は、1 トランザクションの接続を返します。抜けるとき commit し、例外なら rollback します
- `autocommit()` は、トランザクションを張らない接続を返します
- `notify(channel, payload)` は、通知を送ります
- `listen(channel, *, timeout=None)` は、通知を待ちます

生 SQL や、サービスを使わない書き込みには `connect()` を使います。
サービス呼び出しとトランザクションを共有するときは、`tx.session` を使います。

```python
with container.db().connect() as conn:
    conn.execute(text("update users set name = :n where id = :i"), {"n": "新しい名前", "i": user.id})
```

### 全テーブルの mapped class

`shop_core.tables` の `User`、`Product`、`Order`、`OrderLine`、`SlackLink` は、全テーブルを覆い、書き込めます。
`Order.lines` で注文の明細を読め、結合や集計も SQLAlchemy の文でそのまま書けます。

```python
from sqlalchemy import func, select

from shop_core import tables

with container.transaction() as tx:
    rows = tx.session.execute(
        select(tables.User.name, func.count(tables.Order.id))
        .join(tables.Order, tables.Order.user_id == tables.User.id)
        .group_by(tables.User.name)
    ).all()
    tx.session.get(tables.User, user.id).name = "新しい名前"
    tx.session.add(tables.SlackLink(slack_user_id="U1", user_id=user.id))
```

CHECK 制約(`stock >= 0`、`quantity > 0`)を破る書き込みは `IntegrityError` になります。
制約で表せない条件は、サービスを通したときにしか守られません。

`shop_core.User`(ドメインモデル)と `shop_core.tables.User`(ORM の行)は別物なので、混ぜないでください。
テーブルの列は全アプリから見える契約で、変えるときは基盤が先にアプリへ知らせます。

### ビュー

ORM で書くと長くなる集計のために、基盤が SQL ビューを公開しています。使うかどうかは任意です。

| ビュー | 内容 | 列 |
|---|---|---|
| `v_order_summary` | ユーザーごとの注文の集計。注文のないユーザーも 1 行出ます | `user_id`、`user_name`、`email`、`order_count`、`total_spent`(円) |
| `v_product_stock` | 商品の現在の在庫 | `product_id`、`name`、`price`、`stock` |

読み取り専用の mapped class `OrderSummary` と `ProductStock` があります。
単純なビューは Postgres が書き込みを通し、元のテーブルを書き換えてしまいます。
そのため、これらの `add`、属性の変更、`delete` は flush で、`session.execute(update(ProductStock)...)` のような一括文は実行時に、`RuntimeError` になります。
`container.db().connect()` の Core 接続からの書き込みは止まりません。
確実に防ぐには、DB ロールにビューへの SELECT だけを与えます。

```python
from shop_core import OrderSummary

with container.transaction() as tx:
    summary = tx.session.get(OrderSummary, user.id)
```

生 SQL で読むなら、結果はアプリ側の frozen dataclass に詰めます。
新しい集計は、基盤にビューの追加を依頼してください。

### 行ロック

`select(...).with_for_update()` は、どのテーブルにも使え、ロックは `with` を抜けるまで続きます。

```python
with container.transaction() as tx:
    tx.session.scalars(
        select(tables.SlackLink).where(tables.SlackLink.user_id == user.id).with_for_update()
    ).all()
    container.order_service().place(user.id, [(1, 1)])
```

在庫の行ロックは `OrderService.place` が取るので、自分で書かないでください。

### LISTEN と NOTIFY

LISTEN と NOTIFY は、トランザクションの外で動きます。

```python
db = container.db()
db.notify("shop_events", "order_placed")

for n in db.listen("shop_events"):  # n.channel、n.payload、n.pid
    handle(n.payload)
```

`listen(channel, *, timeout=秒)` は、開始からその秒数がたつと、通知の有無にかかわらず終わります。
`timeout=None` のあいだは、ジェネレータが生きている限り、プールの接続を 1 本占有します。
常駐のリスナーは、プールの大きさに数えるか、専用のプロセスに分けてください。
LISTEN 前に送られた通知は届きません。

## テスト

### フェイクによる DB なしのテスト

`fake_backend` が、コンテナの `uow` と `transaction` を同じ state のフェイクに差し替えます。
`Container()` を作るだけでは環境変数を読まないので、`DATABASE_URL` は要りません。

```python
import pytest
from fastapi.testclient import TestClient

from app1.main import app, container
from shop_core.testing import InMemoryState, fake_backend


@pytest.fixture
def client():
    with fake_backend(container, InMemoryState()):
        yield TestClient(app)
```

フェイクは本物と同じ契約を守ります。
サービスが `commit()` するまで変更は見えず、例外で抜けた変更は捨てられます。
`transaction()` の中では、捕まえた例外のサービス呼び出しだけが戻り、入れ子もセーブポイントになります。

`providers.Container` で入れ子にしたコンテナでは、`fake_backend(container.core, state)` のように内側を渡します。
`db` は差し替わりません。

`InMemoryState` の `users`、`products`、`orders` は、id をキーにした `dict` です。
`next_id()` は次の id を返します。
id はユーザー、商品、注文を通した 1 本の連番です。
「ユーザー 1、商品 1」を前提にせず、`next(iter(state.users))` のように state から取り出してください。
事前のデータは、`fake_backend` の中でサービスを呼んで積むのが簡単です。

### tx.session を使う処理の差し替え

フェイクの `tx` は `tx.state` だけを持ち、`tx.session` などを呼ぶと `AttributeError` になります。
テーブルや SQL に触る部分は小さな関数に切り出し、フェイクのテストでは monkeypatch で差し替えます。
関数そのものは、Postgres のテストで確かめてください。

```python
# アプリ側: テーブルに触る部分を関数にする
def resolve_user_id(tx, users, slack_user_id, user_name) -> int:
    link = tx.session.get(SlackLink, slack_user_id)
    ...

# DB なしのテスト側
monkeypatch.setattr(
    "app2.main.resolve_user_id",
    lambda tx, users, sid, name: users.register(f"{sid}@slack.local", name).id,
)
```

差し替える名前は、呼び出し側のモジュール(`app2.main`)のものです。
定義元のモジュール(`app2.slack`)を差し替えても効きません。

### Postgres を使うテスト

テーブルとビューは `alembic upgrade head` で先に作り、テスト用 DB は `Settings` で渡します(次節)。

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | はい | `postgresql+psycopg://user:pass@host:5432/db` の形式 |
| `SQL_ECHO` | いいえ | `1`、`true`、`yes`(大文字小文字は問わない)で SQL をログに出します。既定では出しません |
| `DB_POOL_SIZE` | いいえ | プールに常に置く接続の数です。既定は 5 |
| `DB_MAX_OVERFLOW` | いいえ | `DB_POOL_SIZE` を超えて一時的に開ける接続の数です。既定は 10 |
| `DB_POOL_TIMEOUT` | いいえ | 接続が空くのを待つ秒数です。超えると `TimeoutError` になります。既定は 30 |
| `DB_POOL_RECYCLE` | いいえ | 接続を作り直すまでの秒数です。既定は -1(作り直さない) |
| `DB_POOL_PRE_PING` | いいえ | 接続を渡す前に生きているか確かめます。未設定なら有効。`1`、`true`、`yes` で有効、それ以外の値は無効です |

数値でない値を入れると、変数名を含む `SettingsError` になります。
アプリが決めるのは `DB_POOL_SIZE` と `DB_MAX_OVERFLOW` だけです。
Web は既定のまま、バッチやワーカーは小さく(例: 2 と 0)、`listen()` を使うプロセスは 1 本足します。
ほかは基盤の既定のままにし、変えたいときは基盤に相談してください。

環境変数は、最初に DB へアクセスするときに読みます。
`DATABASE_URL` がなければ、そこで `SettingsError` を投げます。
起動時に失敗させたいなら、`Settings.from_env()` を先に呼んで確かめられます。

テストや CLI で明示的に渡すときは、`settings` を差し替えます。
プールの設定も、`pool_size` などの引数で渡せます。

```python
from dependency_injector import providers
from shop_core import Container, Settings

container = Container(
    settings=providers.Object(
        Settings(database_url="postgresql+psycopg://...", echo=True, pool_size=2, max_overflow=0)
    )
)
```

アプリ固有の設定(app2 の Slack のトークンなど)は、アプリが自分で読みます。

## マイグレーション

テーブルとビューは `shop_core` が所有します。
アプリは alembic を実行せず、完了も待ちません。
マイグレーションは、アプリのデプロイより先に、CI/CD の migrate コンテナが適用します。
ローカルでの適用は、リポジトリのルートの README を見てください。

アプリは、適用済みの DB に起動しても何もしなくてよい作りにしてください。
古いスキーマに対して起動すると、最初のクエリで失敗します。

## 機能の追加の依頼

サービスにメソッドがない操作は、`shop_core` に追加を依頼してください。
次の 3 点を書くと早く済みます。

- どの操作を、どの単位で不可分にしたいかを書きます(「在庫引き当てと注文作成を同時に」のように)
- 失敗したときに何を知りたいかを書きます(例外に欲しい属性)
- 既存のメソッドで足りない理由を書きます

集計のような新しい読み取りはビューの追加を、テーブルや列は用途を書いて依頼してください。
ドメインのルールを変える依頼(たとえば「在庫が負になってよい」)は、すべてのアプリに影響するので、先に相談してください。

## 守ってほしいこと

- サービスがある操作は、サービスを使い、ORM で再実装しないでください
- `shop_core.infra` を import しないでください。テーブルは `shop_core.tables` から使います
- `container.session_factory()` や `container.uow()` を呼ばないでください(生の接続は `container.db()` です)
- 自前の `DeclarativeBase` や mapped class を書かず、`create_all()` も呼ばないでください
- サービスの戻り値の `dataclass` を書き換えて、保存されることを期待しないでください
- `transaction()` の外で、2 つのサービス呼び出しが 1 トランザクションになることを期待しないでください
- `db` にフェイクはないので、使うコードは Postgres のテストで確かめてください
