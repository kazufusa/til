# shop_core

アプリチーム向けの共有ライブラリです。
ユーザー、商品、注文、実行(Execution)のドメインモデルと、それを操作するユースケースサービスを配ります。
DB の接続、トランザクション、オブジェクトストレージ、イベントの発行、マイグレーションもこのライブラリが持ちます。

アプリチームがやることは 4 つです。

- プロセスの入口で `build_container()` を 1 回呼び、検査して wire します
- サービスを DI で受け取って呼びます
- `DomainError` を分類ごとに HTTP ステータスなどへ変換します
- 新しい機能は `shop_core` への PR か依頼で足します

アプリは `Session` の生成も `commit()` も書きません。
設計の理由は [ADR 0002](../../docs/adr/0002-shared-library-contract.md) にあります。

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

import できるのは、次の 3 つです。

- `shop_core` の直下は、`__all__` にある名前です
- `shop_core.tables` は、全テーブルの mapped class です
- `shop_core.testing` は、テスト用のフェイクです

`shop_core.infra` と `shop_core.usecase` の内部は、予告なく変えます。アプリから import しないでください。

組み立ては、プロセスの入口で 1 回だけ行います。
import 時には何も実行されず、`build_container()` の戻り値が唯一の持ち手です。

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from shop_core import build_container, check_database, check_image_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    container = build_container()     # 環境変数を読んで検証する。接続はしない
    check_database(container)         # DB を使うプロセスだけ
    check_image_store(container)      # ストアを使うプロセスだけ
    container.wire(modules=[__name__])
    app.state.container = container   # モジュール変数には置かない
    try:
        yield
    finally:
        container.unwire()
        container.engine().dispose()


app = FastAPI(lifespan=lifespan)
```

バッチや CLI では、`main()` の先頭で同じ順に呼びます。
`build_container()` は I/O なしで設定を検査し、不正なら `SettingsError` です。
`check_database()` は、接続できることと、アプリ用のロールであることを確かめます。
`check_image_store()` は、バケットに届くことを確かめ、失敗は `ArtifactStoreError` です。

## ドメインモデルと ID

SQLAlchemy に依存しない `dataclass` です。
サービスは ORM のオブジェクトを外に出さないので、lazy load や session の寿命を気にする必要はありません。
サービスの戻り値は DB から切り離した写しです。属性を書き換えても保存されません。

| 型 | 属性 |
|---|---|
| `User` | `id: int \| None`(永続化前は `None`)、`email: str`(一意)、`name: str` |
| `Product` | `id`、`name`、`price: int`(税込の円)、`stock: int`(負にならない) |
| `Order` | `id`、`user_id`、`lines: list[OrderLine]`、`created_at`(DB が付ける。タイムゾーン付き)、`total`(プロパティ) |
| `OrderLine` | `product_id`、`quantity`、`unit_price`(注文時点の単価)、`subtotal`(プロパティ) |
| `Execution` | `id: UUID`、`order_id`、`status`(`running`、`done`、`failed`)、`images: list[Image]`、`created_at`、`failure_reason`、`version` |
| `Image` | `id: UUID`。本体は ImageStore にあり、DB には ID だけを持ちます |

ユーザー、商品、注文の ID は DB が振る整数です。
新しく作る集約(Execution と Image)の ID は UUIDv7 で、`new_id()` で振ります。
採番の関数はこの 1 つだけです。他の UUID 生成を使わないでください。
文字列にするのは境界(JSON、ログ)だけで、`str(uuid)` の小文字ハイフン区切りに揃えます。
ドメインの型は `UUID` のままです。

## サービスと例外

サービスのメソッド 1 回が、トランザクション 1 回です。
成功すれば commit、例外なら rollback します。
そのため、2 つのメソッドを続けて呼んでも、そのままでは 1 つのトランザクションになりません。
まとめたいときは `transaction()` を使います(後述)。

| メソッド | 戻り値 | 説明 |
|---|---|---|
| `UserService.register(email, name)` | `User` | 同じ email があれば既存の `User` を返します。同時に呼んでも 1 行です |
| `UserService.get(user_id)` | `User` | なければ `UserNotFoundError` |
| `UserService.list()` | `list[User]` | id 順 |
| `ProductService.add(name, price, stock)` | `Product` | 価格か在庫が負なら `InvalidProductError` |
| `ProductService.list()` | `list[Product]` | id 順 |
| `OrderService.place(user_id, items)` | `Order` | `items` は `(product_id, quantity)` の列 |
| `OrderService.list_by_user(user_id)` | `list[Order]` | id 順。ユーザーがなければ空 |
| `ExecutionService.start(order_id)` | `Execution` | 注文がなければ `OrderNotFoundError` |
| `ExecutionService.complete(execution_id, image_ids)` | `Execution` | 実行中でなければ `ExecutionNotRunningError` |
| `ExecutionService.fail(execution_id, reason)` | `Execution` | 同上 |
| `ExecutionService.get(execution_id)` | `Execution` | なければ `ExecutionNotFoundError` |

`place` は、ユーザー、空の注文、商品の順に検査します。
数量が 1 未満なら `InvalidQuantityError`、在庫が足りなければ `InsufficientStockError` です。
商品ごとに product_id の順で行ロックを取るので、同時の注文どうしがデッドロックしません。
`order.lines` は渡した順のままです。
途中の商品で在庫が足りなければ、それ以前の引き当ても戻ります。

`ExecutionService` の冪等の規則は、次のとおりです。

| 呼び出し | 結果 |
|---|---|
| `start` | 注文に実行中の Execution があれば `execution_already_running`。終わったものは数えません |
| `complete`(同じ `image_ids` で再実行) | 何も変えずに現在の状態を返します。イベントは出ません |
| `complete`(`running` 以外で別の `image_ids`) | `execution_not_running` |
| `fail`(同じ `reason` で再実行) | 何も変えずに返します。イベントは出ません |
| `fail`(`done` の実行、または別の `reason` の `failed`) | `execution_not_running` |

### 例外の分類とコード

すべての例外は `DomainError(code, message)` の子です。
`code` は機械が読む小文字の識別子で、`message` は人が読む英語の説明です。
境界(HTTP、キュー、ジョブ)は、分類だけを見て変換します。

| 分類 | 意味 | 目安の HTTP |
|---|---|---|
| `NotFoundError`(`InputError` の子) | 指した対象がない | 404 |
| `InputError` | 呼び出し側が直さない限り、何度やっても失敗する | 400 |
| `BusinessRuleError` | 入力は正しいが、そのときの状態では実行できない | 409 |
| `DependencyError` | 外部依存の一時的な失敗。時間を置いてやり直せる | 503 |

| 例外 | code | 分類 |
|---|---|---|
| `UserNotFoundError` | `user_not_found` | NotFound |
| `ProductNotFoundError` | `product_not_found` | NotFound |
| `OrderNotFoundError` | `order_not_found` | NotFound |
| `ExecutionNotFoundError` | `execution_not_found` | NotFound |
| `ArtifactNotFoundError` | `artifact_not_found` | NotFound |
| `InvalidQuantityError` | `order_line_quantity_invalid` | Input |
| `EmptyOrderError` | `order_lines_empty` | Input |
| `InvalidProductError` | `product_invalid` | Input |
| `InsufficientStockError` | `product_stock_insufficient` | BusinessRule |
| `ExecutionNotRunningError` | `execution_not_running` | BusinessRule |
| `ConcurrentUpdateError` | `execution_concurrent_update` | BusinessRule |
| 制約違反(後述) | `user_email_taken` など | Input か BusinessRule |
| `ArtifactStoreError` | `artifact_store_unavailable` | Dependency |
| DB の接続切れ、起動中、接続数超過 | `db_unavailable` | Dependency |
| 直列化の失敗 | `db_serialization_failure` | Dependency |
| デッドロック | `db_deadlock` | Dependency |

`InsufficientStockError` は `product_id`、`requested`、`available` を持ちます。
`DependencyError` は再試行できる前提で、`ArtifactStoreError.retryable` が `False` なら直りません。

DB の制約違反は、宣言のあるものだけがドメインの例外になります(次節の制約の表)。
宣言にない制約の違反は、想定外として `IntegrityError` のまま届きます。
SQLAlchemy と botocore の例外は、DB の接続障害と S3 の障害に限って `DependencyError` に包まれて届きます。
`DomainError` を継承しない例外は、想定外の失敗です。握りつぶさず、境界で 500 にしてください。

冪等に挿入したいときは、例外に頼らず `INSERT ... ON CONFLICT DO NOTHING` で書きます。
`UserService.register` が内部で使う `store_if_absent` が実例です。

app1 は、`@app.exception_handler(DomainError)` で上の表の目安どおりに変換します。
`NotFoundError` を `InputError` より先に見て、どれにも当たらなければ 500 です。
本文は `{"code": exc.code, "detail": str(exc)}` に揃えます。

## Container と配線

`build_container()` が返す `Container` を使います。
アプリ側で `DATABASE_URL` を渡すコードは書きません。

アプリが使う属性は、`user_service`、`product_service`、`order_service`、`execution_service`、`image_store`、`transaction`、`transaction_async`、`db` です。
`settings` と `event_publisher` は、差し替えるときだけ触ります。
`engine`、`session_factory`、`uow` は触らないでください。
ただし終了時の `container.engine().dispose()` は呼びます。

Engine は `container.engine()` を最初に呼んだときに作られます。
`build_container` 自体は接続しません。

| 引数 | 使いどころ |
|---|---|
| `build_container(settings)` | `Settings` を明示します。環境変数の `DATABASE_URL` などは読まれません |
| `build_container(credentials=fn)` | 接続のたびに `(user, password)` を返す関数です。Secrets Manager のローテーション向けです |
| `Container(engine_factory=providers.Object(fn))` | Engine の作り方を丸ごと差し込みます。`fn()` は `Engine` を返します |

`credentials` の関数は、新しい接続を張るたびに呼ばれ、URL のユーザー名とパスワードは捨てられます。
認証失敗(SQLSTATE 28P01)のときだけ、関数をもう 1 度呼んで 1 回やり直します。
Secrets Manager の応答は、関数の側で短くキャッシュしてください。
Engine を作る `make_engine` は `shop_core.infra.db` にあり、`engine_factory` に自前の Engine を渡すときだけ使います。

ルートは、`Container` のクラスの属性を `Provide` に渡します。
インスタンスは lifespan が wire するので、モジュール変数は要りません。

```python
@app.post("/orders", status_code=201)
@inject
def place_order(body: OrderIn, svc: OrderService = Depends(Provide[Container.order_service])):
    return svc.place(body.user_id, [(i.product_id, i.quantity) for i in body.items])
```

`@inject` は `@app.post` より内側に付けます。
ルーターを別モジュールに分けたら、そのモジュールも `wire(modules=[...])` に並べます。
サービスの戻り値は `dataclass` なので、pydantic の `response_model` にそのまま渡せます。
`Order.total` のようなプロパティも、同名のフィールドがあれば拾われます。

独自の依存を足すときは、自前のコンテナで `providers.Container` を使い、`Container` を入れ子にします。
app2 が実例です。`app2/bootstrap.py` の `build_app_container` が、`build_container` の戻り値を `core` に差し込みます。
サービスは `Provide[AppContainer.core.user_service]` のように受け取ります。

## transaction() と transaction_async()

サービス呼び出しと直接の SQL や ORM は、`transaction()` で囲むと 1 トランザクションになります。
ルートでは `Provide[Container.transaction]` で受け取り、バッチでは `container.transaction()` を呼びます。

```python
with container.transaction() as tx:
    user = container.user_service().register("a@example.com", "A")
    n = tx.execute(text("select count(*) from v_product_stock")).scalar_one()
    container.order_service().place(user.id, [(1, 1)])
```

スコープの中のサービスは commit せず、`with` を抜けるときに 1 回だけ commit します。
サービスは互いの未 commit の変更を見られます。

例外が `with` の外まで出ると、サービス呼び出しも直接の書き込みも、すべて rollback されます。
スコープの中のサービス呼び出しと入れ子のスコープは、それぞれ SAVEPOINT を張ります。
例外を捕まえると、その呼び出しの分だけが戻り、残りは続きます。

```python
with container.transaction():
    try:
        container.order_service().place(user.id, [(1, 999)])
    except InsufficientStockError:
        pass    # この注文だけが戻る
    container.order_service().place(user.id, [(2, 1)])
```

直接の SQL や ORM の書き込みは、自動では SAVEPOINT を張りません。
`tx.session` が `Session` で、`tx.execute(statement, params)` と `tx.flush()` はその短縮形です。
`tx.flush()` で出た制約違反は、宣言のあるものがドメインの例外になります。

長い処理(生成、外部 API、オブジェクトの転送)は、トランザクションの外で行ってください。

### async からの利用

async のコードは `transaction_async()` を使います。
Session とサービスは同期のままで、スレッドで呼びます。`AsyncSession` はありません。
app2 のスラッシュコマンドが実例です。

```python
async with scope as tx:     # scope は Provide[AppContainer.core.transaction_async]
    uid = await tx.run(resolve_user_id, tx, users, slack_user_id, user_name)
    order = await tx.run(orders.place, uid, [(product_id, quantity)])
await run_sync(notifier.post, channel_id, text)   # スコープの外の同期処理
```

`tx.run(fn, ...)` は同期の関数をスレッドで呼びます。
`await tx.execute(statement)` と `await tx.flush()` も使えます。
`with` を抜けるときの commit と rollback もスレッドで走るので、イベントループは止まりません。
入れ子のスコープと例外の扱いは、同期のスコープと同じです。

守ってほしい規則は 3 つです。

- 1 つのスコープを複数のタスクから同時に使わないでください。`asyncio.gather` で同じ `tx` を使うのは禁止です
- `tx.run` に渡すのは同期のサービスと関数です。`async def` の関数は渡せません
- `AsyncSession` や `create_async_engine` は使いません。プールの大きさが同時実行の上限になります

スレッドを自分で起こす処理は、ContextVar をコピーして渡さない限りスコープに参加しません。
`tx.run` と `run_sync` は、コピーを渡します。

## 同時更新

同時更新の守り方は、集約ごとに違います。

| 集約 | 方式 | 理由 |
|---|---|---|
| `Product` | 行ロック | 読んで直後に書くので、ロックで足ります。順序は id の昇順です |
| `Execution` | 版の楽観ロック | 読んで、考えて、後から書くので、衝突を後で検出します |

`Execution.version` は、保存のたびに必ず 1 上がります。変更が無くても上がります。
古い版で保存すると `ConcurrentUpdateError`(`execution_concurrent_update`)になります。app1 の変換では 409 です。
冪等な `complete` の再呼び出しでも版は上がります。
衝突したら、読み直してやり直すのが基本です。

`shop_core.tables` で `executions` を直接更新しても、版は上がりません。
上げたいときは、サービスを通してください。

行ロックを自分で取るときは、`select(...).with_for_update()` を使います(後述)。
在庫の行ロックは `OrderService.place` が取るので、自分で書かないでください。

## DB への直接アクセス

不変条件が絡む操作(在庫の引き当て、注文の作成、実行の状態)は、サービスを使います。
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
`connect()` の Core 接続を通る書き込みは、ガード列とビューの検査を通りません。

### 全テーブルの mapped class

`shop_core.tables` の `User`、`Product`、`Order`、`OrderLine`、`SlackLink`、`Execution`、`ExecutionImage` は、全テーブルを覆い、書き込めます。
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
    tx.session.add(tables.SlackLink(slack_user_id="U1", user_id=user.id))
```

`shop_core.User`(ドメインモデル)と `shop_core.tables.User`(ORM の行)は別物なので、混ぜないでください。
テーブルの列は全アプリから見える契約です。

### 守られる列

`products.stock` と `executions.status` は、サービスだけが変える列です。
`shop_core.tables` で変更を flush すると、`GuardedColumnError`(`RuntimeError` の子)になり、書き込まれません。
insert の初期値は許されます。他の列(`failure_reason` など)は直接変えられます。

これは ORM の検査で、止められる経路には限りがあります。

- 生 SQL と Core の `update` 文は、検査を通りません
- サービスの実行中に、同じ Session に溜まっていた直接の変更が一緒に書かれると、通ってしまいます
- 新しいスレッドは、ContextVar をコピーして渡さない限り、スコープにも検査にも参加しません

確実に止めるのは、DB のトリガと GRANT です。ORM の検査は、プログラムの誤りを早く見つけるための網です。
フェイクには ORM がないので、この検査は働きません。Postgres のテストで確かめてください。

CHECK 制約(`stock >= 0`、`quantity > 0`)を破る書き込みは、宣言のあるものがドメインの例外になります。
制約で表せない条件は、サービスを通したときにしか守られません。

### ビュー

ORM で書くと長くなる集計のために、基盤が SQL ビューを公開しています。使うかどうかは任意です。

| ビュー | 内容 | 列 |
|---|---|---|
| `v_order_summary` | ユーザーごとの注文の集計。注文のないユーザーも 1 行出ます | `user_id`、`user_name`、`email`、`order_count`、`total_spent`(円) |
| `v_product_stock` | 商品の現在の在庫 | `product_id`、`name`、`price`、`stock` |

読み取り専用の mapped class `OrderSummary` と `ProductStock` があります。
単純なビューは Postgres が書き込みを通し、元のテーブルを書き換えてしまいます。
そのため、これらの `add`、属性の変更、`delete` は flush で、`session.execute(update(ProductStock)...)` のような一括文は実行時に、`RuntimeError` になります。
Core 接続からの書き込みは止まりません。確実に防ぐのは、DB ロールの GRANT です。

`tx.session.get(OrderSummary, user.id)` のように読みます。
生 SQL で読むなら、結果はアプリ側の frozen dataclass に詰めます。
新しい集計は、基盤にビューの追加を依頼してください。

### 行ロック

`tx.session.scalars(select(...).with_for_update())` は、どのテーブルにも使えます。
ロックは `with` を抜けるまで続きます。複数の行は、id の昇順で取ってください。

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

## オブジェクトストレージ

Execution の画像の本体は、オブジェクトストレージに置きます。
DB が持つのは画像の ID だけです。形式やサイズは、オブジェクトのメタデータに置きます。
アプリは `container.image_store()` の `ImageStore` を使い、S3 のキーは組み立てません。
キーの規則はアダプタの内部にあり、変わることがあります。

エージェントの流れは、置いてから完了を伝える順です。

```python
execution = container.execution_service().start(order_id)
image_id = new_id()
container.image_store().put(execution, image_id, png_bytes, content_type="image/png")
container.execution_service().complete(execution.id, [image_id])    # 失敗なら fail(execution.id, "理由")
```

置いてから commit する順なので、`complete` が失敗すると、置いたオブジェクトが孤児として残ります。
孤児は許容します。やり直しは、新しい `start` で別の実行として行うのが基本です。
`put` は DB トランザクションの外で行ってください。

| メソッド | 説明 |
|---|---|
| `put(execution, image_id, data, *, content_type, metadata=None)` | `content_type` は必須です。空と `binary/octet-stream` は `ValueError` |
| `get(execution, image_id)` | 本体の `bytes` |
| `head(execution, image_id)` | `ArtifactInfo`(`content_type`、`size`、`metadata`、`etag`) |
| `exists(execution, image_id)` | `bool` |
| `delete(execution, image_id)` | なくても成功します |
| `replace_metadata(execution, image_id, *, content_type, metadata)` | S3 にメタデータだけの更新はなく、自分自身へのコピーで置き換えます |
| `presigned_get_url(execution, image_id, *, expires_in=900, response_content_type=None, filename=None)` | 署名付き GET の URL。署名はローカル計算で、S3 には接続しません |
| `ping()` | 起動時の到達確認。`check_image_store` が呼びます |

オブジェクトがなければ `ArtifactNotFoundError`、通信や S3 の障害は `ArtifactStoreError` です。
`S3ImageStore` が本物、`InMemoryImageStore` がフェイクで、`fake_backend` が差し替えます。

バケット名は、設定が `ENV` から決めます。
`ENV` が `stg` なら `shop-stg-artifacts` で、`ARTIFACT_BUCKET` を設定すると上書きします。
`ENV` は `local`、`stg`、`prd` のいずれかです。
AWS の認証情報は、boto3 が既定の経路(環境変数、ロール)で読みます。
ローカルでは compose の `s3` サービス(s3mock)が `S3_ENDPOINT_URL` の先になります。

署名付き URL にはホスト名も署名されます。
コンテナ内から見える名前と、ブラウザから見える名前が違うときは、`S3_PUBLIC_ENDPOINT_URL` に後者を入れます。
s3mock は、CopyObject で Content-Type を置き換えられません。
`replace_metadata` で Content-Type を変える確認は、本物の S3 か MinIO で行ってください。

## イベント

サービスは、状態を変えたときにドメインイベントを積みます。
すべてのイベントが `event_id`(UUIDv7、送り手が振る)と `occurred_at`(UTC)を持ちます。
受け手は、同じ `event_id` を 2 度受け取ったら捨ててください。

| イベント | 出すサービス | 追加のフィールド |
|---|---|---|
| `UserRegistered` | `UserService.register`(新規のときだけ) | `user_id`、`email` |
| `OrderPlaced` | `OrderService.place` | `order_id`、`user_id`、`total` |
| `ExecutionStarted` | `ExecutionService.start` | `execution_id`、`order_id` |
| `ExecutionCompleted` | `ExecutionService.complete`(状態が変わったときだけ) | `execution_id`、`order_id`、`image_ids` |
| `ExecutionFailed` | `ExecutionService.fail`(状態が変わったときだけ) | `execution_id`、`order_id`、`reason` |

発行は、一番外側の commit が成功した後に、積んだ順にまとめて行います。
失敗した呼び出しと、SAVEPOINT が戻った分のイベントは捨てます。
`transaction()` の中のサービスのイベントは、スコープを抜けて commit された後に出ます。

送り先は `EventPublisher` ポートの `publish(events)` です。既定の `LoggingEventPublisher` はログに出すだけです。
別の送り先は、`container.event_publisher.override(providers.Object(publisher))` で差し込みます。本番の送り先は基盤に相談してください。

Outbox はありません。commit の後、発行の前にプロセスが落ちると、そのイベントは失われます。
送り側は 1 回以下で、受け側はブローカーが受け取った後に 1 回以上です。
発行先が例外を投げると、commit 済みのまま、その例外が呼び出し元に伝わります。書き込みは戻りません。
この例外を、書き込みの失敗と取り違えないでください。

## テスト

### フェイクによる DB なしのテスト

`fake_backend` が、`uow`、`transaction`、`transaction_async`、`image_store`、`event_publisher` を同じ state のフェイクに差し替えます。
`Container()` を作るだけでは環境変数を読まないので、`DATABASE_URL` は要りません。
lifespan は走らせず、テストが `Container()` を作って wire します。

```python
@pytest.fixture
def container():
    c = Container()
    c.wire(modules=[main])
    yield c
    c.unwire()


@pytest.fixture
def client(container):
    with fake_backend(container, InMemoryState()):
        yield TestClient(app)
```

フェイクは本物と同じ契約を守ります。

- サービスが `commit()` するまで変更は見えず、例外で抜けた変更は捨てられます
- `transaction()` の中では、捕まえた例外のサービス呼び出しだけが戻り、入れ子も SAVEPOINT になります
- 一意制約と CHECK 制約は、次節の宣言から同じ検査をします
- `Execution` の版の衝突は、`ConcurrentUpdateError` になります
- イベントは `state.events.published` に溜まり、最も外側の commit の後にだけ入ります

`providers.Container` で入れ子にしたコンテナでは、`fake_backend(container.core, state)` のように内側を渡します。
`db` は差し替わりません。

フェイクで確かめられないものは、行ロック、生 SQL、ガード列の検査、Core 接続です。
フェイクの一意検査は、同時に commit した別の UoW の行を見ません。

`InMemoryState` は `users`、`products`、`orders`(整数 id のキー)、`executions`(UUID のキー)、`image_store`、`events` を持ちます。
整数 id はユーザー、商品、注文を通した 1 本の連番です。
「ユーザー 1、商品 1」を前提にせず、`next(iter(state.users))` のように state から取り出してください。
事前のデータは、`fake_backend` の中でサービスを呼んで積むのが簡単です。

### tx.session を使う処理の差し替え

フェイクの `tx` は `tx.state` だけを持ち、`tx.session` などを呼ぶと `AttributeError` になります。
フェイクの非同期の `tx` は、`tx.run` も使えます。
テーブルや SQL に触る部分は小さな関数に切り出し、フェイクのテストでは monkeypatch で差し替えます。
関数そのものは、Postgres のテストで確かめてください。

app2 は `monkeypatch.setattr("app2.main.resolve_user_id", fake)` の形です。
差し替える名前は、呼び出し側のモジュール(`app2.main`)のものです。
定義元(`app2.slack`)を差し替えても効きません。

### 制約の宣言

DB が守る不変条件は、`domain/constraints.py` に 1 件ずつ宣言されています。
本物の翻訳表とフェイクの検査は、この同じ宣言から作られます。

| 制約名 | 種類 | 対象 | 違反時の code(分類) |
|---|---|---|---|
| `users_email_key` | 一意 | `users.email` | `user_email_taken`(BusinessRule) |
| `ck_products_stock_nonnegative` | 検査 | `stock >= 0` | `product_stock_negative`(BusinessRule) |
| `ck_order_lines_quantity_positive` | 検査 | `quantity > 0` | `order_line_quantity_invalid`(Input) |
| `uq_executions_one_running_per_order` | 条件付き一意 | 実行中の Execution は注文ごとに 1 件 | `execution_already_running`(BusinessRule) |
| `uq_execution_images_ordinal` | 一意 | `(execution_id, ordinal)` | `execution_image_ordinal_taken`(BusinessRule) |

宣言とマイグレーションの制約名が食い違うと、Postgres のカタログと突き合わせるテストが落ちます。
制約を足すときは、マイグレーションと宣言の両方を基盤への PR に含めます。
宣言にない制約の違反は、翻訳されません。

Postgres のテストは `TEST_DATABASE_URL`、S3 のテストは `TEST_S3_ENDPOINT_URL` がなければ skip されます。
手順とコマンドは、リポジトリのルートの README にあります。

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | はい | `postgresql+psycopg://user:pass@host:5432/db` の形式。アプリ用のロールで接続します |
| `SQL_ECHO` | いいえ | `1`、`true`、`yes`(大文字小文字は問わない)で SQL をログに出します。既定では出しません |
| `DB_POOL_SIZE` | いいえ | プールに常に置く接続の数です。既定は 5 |
| `DB_MAX_OVERFLOW` | いいえ | `DB_POOL_SIZE` を超えて一時的に開ける接続の数です。既定は 10 |
| `DB_POOL_TIMEOUT` | いいえ | 接続が空くのを待つ秒数です。超えると `TimeoutError` になります。既定は 30 |
| `DB_POOL_RECYCLE` | いいえ | 接続を作り直すまでの秒数です。既定は -1(作り直さない) |
| `DB_POOL_PRE_PING` | いいえ | 接続を渡す前に生きているか確かめます。未設定なら有効。`1`、`true`、`yes` で有効、それ以外の値は無効です |
| `ENV` | いいえ | `local`、`stg`、`prd` のいずれか。既定は `local` |
| `ARTIFACT_BUCKET` | いいえ | 画像のバケット名。既定は `shop-{ENV}-artifacts` |
| `S3_ENDPOINT_URL` | いいえ | S3 互換サーバを指すときの URL。未設定なら本物の S3 です |
| `S3_PUBLIC_ENDPOINT_URL` | いいえ | 署名付き URL に使う、利用者から見える側の URL。未設定なら `S3_ENDPOINT_URL` と同じです |
| `AWS_REGION` | いいえ | S3 のリージョン。既定は `ap-northeast-1` |

AWS の認証情報(`AWS_ACCESS_KEY_ID` など)は、boto3 が自分で読みます。`Settings` には入りません。
数値でない値を入れると、変数名を含む `SettingsError` になります。
`build_container()` は、`ENV` の値、`DB_POOL_SIZE` が 1 以上、`DB_MAX_OVERFLOW` が 0 以上、バケット名が空でないこと、URL に DB 名があることも検査します。

アプリが決めるのは `DB_POOL_SIZE` と `DB_MAX_OVERFLOW` だけです。
Web は既定のまま、バッチやワーカーは小さく(例: 2 と 0)、`listen()` を使うプロセスは 1 本足します。
ほかは基盤の既定のままにし、変えたいときは基盤に相談してください。

テストや CLI で明示的に渡すときは、`Settings(database_url=..., pool_size=2)` を `build_container(settings)` に渡します。

アプリ固有の設定(app2 の Slack のトークンなど)は、アプリが自分で読みます。

## マイグレーションとロール

テーブルとビューは `shop_core` が所有します。
アプリは alembic を実行せず、完了も待ちません。
マイグレーションは、アプリのデプロイより先に、CI/CD の migrate コンテナが適用します。
ローカルでの適用は、リポジトリのルートの README を見てください。
古いスキーマに対して起動すると、`check_database` かその後のクエリで失敗します。

DB のロールは 2 つです。

| ロール | 権限 | 使う側 |
|---|---|---|
| `shop` | スキーマの持ち主。DDL を実行できます | migrate だけ |
| `shop_app` | スキーマの USAGE と、テーブルの DML、シーケンスの USAGE と SELECT | アプリ |

ロールは、DB の初期化スクリプト(`docker/postgres-init/01_app_role.sql`)が作ります。
権限は、マイグレーション 0006 が付けます。以降に足すテーブルにも、既定の権限で付きます。
`check_database` は、接続中のロールがスキーマに CREATE できると、`SettingsError` で落とします。
アプリに `shop` で接続させると、起動時に止まります。

`shop_app` で `create table shop.x (id int)` を実行すると、`permission denied for schema shop` になります。
`select` と `insert` は通ります。

## 機能の追加の依頼

サービスにメソッドがない操作は、`shop_core` に追加を依頼するか、PR を出してください。
サービスやテーブルを足す PR は、それを必要とするチームが書き、基盤チームがレビューして取り込みます。
依頼には次の 3 点を書くと早く済みます。

- どの操作を、どの単位で不可分にしたいかを書きます(「在庫引き当てと注文作成を同時に」のように)
- 失敗したときに何を知りたいかを書きます(例外に欲しい属性)
- 既存のメソッドで足りない理由を書きます

集計はビューの追加を、テーブルや列は用途を書いて依頼してください。
ドメインのルールを変える依頼(たとえば「在庫が負になってよい」)は、全アプリに影響するので先に相談してください。

## 守ってほしいこと

- サービスがある操作は、サービスを使い、ORM で再実装しないでください
- ガード列(`products.stock`、`executions.status`)を、`shop_core.tables` で直接書かないでください
- S3 のキーを自分で組み立てず、`ImageStore` にエンティティを渡してください
- `put` には必ず `content_type` を付けてください
- 1 つのトランザクションのスコープを、複数のタスクから同時に使わないでください
- `build_container()` は、プロセスの入口でだけ呼んでください。モジュールの直下では呼ばず、結果をグローバルに持たないでください
- `shop_core.infra` と `shop_core.usecase` を import しないでください。テーブルは `shop_core.tables` から使います
- `container.session_factory()` や `container.uow()` を呼ばないでください(生の接続は `container.db()` です)
- 自前の `DeclarativeBase` や mapped class を書かず、`create_all()` も呼ばないでください
- サービスの戻り値の `dataclass` を書き換えて、保存されることを期待しないでください
- `transaction()` の外で、2 つのサービス呼び出しが 1 トランザクションになることを期待しないでください
- `db` にフェイクはないので、使うコードは Postgres のテストで確かめてください
