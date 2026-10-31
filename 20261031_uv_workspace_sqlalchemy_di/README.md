# uv workspace で共有ライブラリとアプリを分ける構成

基盤チームが `shop_core` を配り、アプリチームはサービスを DI で受け取って呼ぶだけ、という形の検証です。

## 構成

```
pyproject.toml            # workspace ルート。members は packages/*, app1, app2。exclude-newer で 7 日クールダウン
packages/shop_core/       # 基盤チームの持ち物
  src/shop_core/
    domain/               # dataclass のモデルと Protocol。SQLAlchemy に依存しない
    infra/                # engine、ORM マッピング、SQLAlchemy リポジトリ
    usecase/              # UnitOfWork、サービス、transaction()。1 メソッド = 1 トランザクション
    settings.py           # DATABASE_URL と SQL_ECHO の解決。未設定は SettingsError
    container.py          # dependency-injector のコンテナ
    testing.py            # アプリチーム向けのフェイク UoW と fake_backend
  migrations/             # alembic。テーブルの所有者は基盤
  Dockerfile              # migrate 用。shop_core だけ入れる
app1/                     # ユーザー API。UserService を呼ぶだけ
  Dockerfile              # app1 とその依存だけ入れる(uv sync --package app1)
app2/                     # 注文 API。ProductService と OrderService を呼ぶだけ
  Dockerfile              # 同上
docker-compose.yml        # db → migrate → app1, app2。build context は全部ルート
```

## アプリチームから見た使い方

import は `shop_core` の直下だけです。

```python
from shop_core import Container, OrderService, DomainError

container = Container()

@app.post("/orders")
@inject
def place_order(body: OrderIn, svc: OrderService = Depends(Provide[Container.order_service])):
    return svc.place(body.user_id, [(i.product_id, i.quantity) for i in body.items])

container.wire(modules=[__name__])
```

アプリ側は `Session` も `commit()` も、接続設定も書きません。
`DATABASE_URL` は環境変数から `shop_core` が読みます。
在庫引き当てと注文作成はサービスの中で 1 トランザクションに閉じ、途中で失敗すれば全部戻ります。
エラーは `DomainError` の階層で返るので、HTTP への変換は exception_handler 1 つで済みます。

## テスト

アプリのテストは DB なしで動きます。コンテナの `uow` と `transaction` をフェイクに差し替えます。

```python
with fake_backend(container, InMemoryState()):
    yield TestClient(app)
```

```sh
uv sync --all-packages
uv run pytest                      # 16 件が通り、Postgres 向けの 4 件は skip
docker compose up -d --build       # db, migrate, app1(:8001), app2(:8002)
TEST_DATABASE_URL=postgresql+psycopg://shop:shop@localhost:5432/shop uv run pytest packages
```

## 確認した動作

- `docker compose up` で alembic が `0001_initial` を当ててから app1 と app2 が起動する
- app1 でユーザー登録、app2 で商品登録と注文、在庫超過は 409、未知のユーザーは 404
- 在庫超過で失敗した注文は orders にも products にも痕跡が残らない(Postgres テスト)

## Docker イメージ

Dockerfile は 3 つあります。

- `app1/Dockerfile`: app1 とその依存だけを入れます
- `app2/Dockerfile`: app2 とその依存だけを入れます
- `packages/shop_core/Dockerfile`: `alembic upgrade head` を走らせる migrate 用です

ビルドコンテキストは、どれもワークスペースのルートです。
`shop_core` と `uv.lock` がルートにあり、アプリのディレクトリだけでは足りないためです。

```sh
docker build -f app1/Dockerfile .
```

中では `uv sync --frozen --no-dev --package <name>` を実行します。
`--package` は、指定したメンバーとその依存だけを環境に入れます。
app1 のイメージに app2 のコードや依存は入りません。
`--frozen` は `uv.lock` をそのまま使い、更新しません。

## ディレクトリ配置の注意

アプリをルート直下の `app1/` に置くと、`app1/src/app1` のパッケージ名と衝突します。
ルートから実行したとき、ルート直下の `app1/` が namespace package として先に拾われ、`import app1.main` が失敗します。
この構成を真似る場合は、次の 2 つが必要です。

- pytest の import モードは既定の prepend のままにし、テストファイルの名前をアプリをまたいで一意にします。importlib モードにすると、ルート直下の `app1/` がパッケージ名として使われます
- 各アプリの `pyproject.toml` に `dev-mode-dirs = ["src"]` を書きます。editable インストールが `.pth` で `src` を直接指すので、ルート直下の `app1/` に隠されません

`apps/app1` のように 1 段下げれば、この問題は起きません。

## マイグレーションの追加

```sh
cd packages/shop_core
DATABASE_URL=postgresql+psycopg://shop:shop@localhost:5432/shop uv run alembic revision --autogenerate -m "add column"
```

## 設計の判断

- ドメインモデルは ORM と別の dataclass にした。アプリチームが ORM の lazy load や session の寿命を意識しなくて済む
- UoW を `providers.Factory` にして、サービスには `uow.provider` を渡した。サービスは Singleton でも、呼ぶたびに新しい Session になる
- フェイク UoW は `commit()` しないと共有 state に反映しない。ロールバックの挙動を DB なしで検証できる
- 行ロックは `resolve_by_id_for_update` を Protocol に置いた。フェイクでは `resolve_by_id` と同じ
- リポジトリのメソッドは `store` と `resolve_by_*` で名付けた。エンティティを置いて取り出す集合だと、名前から読み取れる
- 複数の操作を 1 トランザクションにするため、`container.transaction()` が ContextVar に Session を置く。UoW はそれがあれば参加し、commit を flush に落とす。サービスのシグネチャは変えずに済む
- 接続設定(`DATABASE_URL`、`SQL_ECHO`)は `shop_core` の中で解決する。環境変数の名前と未設定時のエラーは基盤チームの規約で、各アプリのものではない
