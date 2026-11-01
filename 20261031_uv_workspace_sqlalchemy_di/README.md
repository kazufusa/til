# uv workspace で共有ライブラリとアプリを分ける構成

基盤チームが `shop_core` を配り、アプリチームはサービスを DI で受け取って呼ぶだけ、という形の検証です。
アプリ開発者向けの使い方は [packages/shop_core/README.md](packages/shop_core/README.md) にあります。
設計の理由は [docs/adr/](docs/adr/) にあります。現行の決定は [ADR 0002](docs/adr/0002-shared-library-contract.md) です。

## 構成

```
pyproject.toml            # workspace ルート。exclude-newer は固定日付(2026-10-24)。手で更新する
docker-compose.yml        # db、s3(s3mock)、app1、app2。migrate は profile で、up では起動しない
docker/postgres-init/     # アプリ用ロール shop_app を作る初期化 SQL
docs/adr/                 # 設計判断の記録(ADR)
packages/shop_core/       # 基盤チームの持ち物
  README.md               # アプリ開発者向けの使い方
  Dockerfile              # migrate 用。shop_core だけ入れる
  migrations/             # alembic の 0001 から 0007。テーブルとビューと権限の所有者は基盤
  src/shop_core/
    bootstrap.py          # build_container と起動時の検査(コンポジションルート)
    container.py          # 手書きのコンテナ(singleton と factory)
    di.py                 # provider デコレータと ContainerBase(外部の DI ライブラリは使わない)
    fastapi.py            # Depends 用の関数(get_container、各サービス、transaction)
    settings.py           # 環境変数の解決
    ids.py                # UUIDv7 の採番 new_id
    views.py              # 公開ビューの読み取り専用 mapped class
    testing.py            # フェイクと fake_backend
    domain/               # dataclass のモデル、例外、制約の宣言、イベント、Protocol
    infra/                # engine、ORM、リポジトリ、制約の翻訳、ガード列、スキーマの版、S3、Database
    usecase/              # UnitOfWork、サービス、transaction()、async 対応
    tables/               # 全テーブルの書き込める mapped class
  tests/                  # フェイクのテストと Postgres、S3 のテスト
app1/                     # ユーザー、商品、注文、実行の HTTP API
app2/                     # Slack アプリ。イベントの受信とスラッシュコマンドでの注文
  src/app2/bootstrap.py   # shop_core の build_container で核を作り、AppContainer に差し込む
  src/app2/container.py   # shop_core の Container を入れ子にした AppContainer
  src/app2/settings.py    # SLACK_BOT_TOKEN と SLACK_SIGNING_SECRET の解決
  src/app2/slack.py       # 通知クラス、コマンド文字列の解釈、resolve_user_id
```

アプリはサービスを呼ぶだけで、`Session` の生成も `commit()` も書きません。
Container は、アプリの lifespan が `build_container()` で作り、`app.state.container` に置きます。
ルートでは `shop_core.fastapi` の `Depends` 用の関数でサービスを受け取ります。

アプリが import してよいのは、`shop_core`、`shop_core.tables`、`shop_core.testing`、`shop_core.fastapi` の 4 つです。
`tests/test_public_surface.py` が、app1 と app2 のソースを走査して、それ以外の import を検出します。

## ローカルでの起動

アプリは起動時に、DB のロールとスキーマの版を検査します。
テーブルがないか版が古いと落ちるので、migrate を先に流します。

```sh
docker compose up -d db s3                  # db(:5432)と s3mock(:9000)
docker compose --profile migrate build      # マイグレーションを足したら先にイメージを作り直す
docker compose run --rm migrate             # 0001 から 0007 を適用(パイプラインのローカル版)
docker compose up -d --build app1 app2      # app1(:8001)、app2(:8002)
```

動いていたアプリは、migrate の後で `docker compose restart app1 app2` します。
`check_database` は起動時に 1 度だけ版を確かめるので、再起動しないと新しい版を確認し直しません。

`docker compose build` は profile の migrate を作り直しません。
`--profile migrate build` を忘れると、古いイメージで `Can't locate revision` になります。

DB のロールは 2 つです。
migrate は持ち主の `shop` で、アプリは USAGE と DML だけの `shop_app` で接続します。
`shop_app` は `docker/postgres-init/01_app_role.sql` が初回起動で作り、権限は 0006 が付けます。

## テスト

アプリのテストは DB なしで動きます。
`fake_backend` が、コンテナの `uow`、`transaction`、`transaction_async`、`image_store`、`event_publisher` をフェイクに差し替えます。

```sh
uv sync --all-packages
uv run --all-packages pytest -q    # 181 passed, 139 skipped(Postgres と S3 向けが skip)
```

`--all-packages` は、ワークスペースの全メンバーを入れて実行するために付けます。

Postgres と S3 を使うテストは、DB と s3mock を起動し、マイグレーションを当ててから走らせます。

```sh
TEST_DATABASE_URL=postgresql+psycopg://shop:shop@localhost:5432/shop \
TEST_S3_ENDPOINT_URL=http://localhost:9000 TEST_S3_IMPL=s3mock \
AWS_ACCESS_KEY_ID=x AWS_SECRET_ACCESS_KEY=x \
  uv run --all-packages pytest -q    # 319 passed, 1 xfailed
```

xfail の 1 件は、s3mock が CopyObject で Content-Type を置き換えない制約です。
本物の S3 や MinIO では `TEST_S3_IMPL` を付けず、この確認も通ります。

Postgres のテストは `TEST_DATABASE_URL` の `shop` と `app_test` のスキーマを削除して終わります。
開発用 DB と同じなら、テスト後は DB が空になるので、`docker compose run --rm migrate` で当て直してください。
クラスタに `shop_app` が既にあると、ロールを作るテストの 1 件は skip されます。

## 確認した動作

- `docker compose run --rm migrate` で 0001 から 0007 が当たり、2 回目は何もしません
- `alembic upgrade head` の後に `alembic check` が通り、モデルとマイグレーションのずれはありません
- `shop_app` は `select` と `insert` ができ、`create table shop.x` は `permission denied for schema shop` になります
- 持ち主の `shop` で接続したアプリは、起動時の `check_database` が `SettingsError` で止めます
- スキーマの版が head と違う DB に対しても、`check_database` は `SettingsError` で止めます
- app1 でユーザー登録、商品登録、注文ができます。在庫超過は 409、未知のユーザーは 404、入力の誤りは 400 です
- 在庫超過で失敗した注文は、orders にも products にも痕跡が残りません
- 実行は start、画像の put、complete の順で進みます。注文ごとに実行中は 1 件で、重複は 409 です
- 古い版での保存は `execution_concurrent_update` になり、版は保存のたびに 1 上がります
- イベントは最も外側の commit の後に発行され、SAVEPOINT が戻った分は捨てられます
- ガード列(`products.stock`、`executions.status`)を `shop_core.tables` で変えると `GuardedColumnError` です
- 生 SQL と Core の `update` でガード列を変えても、DB のトリガーが止めて `GuardedColumnError` になります
- `shop_app` は、ビューへの `insert` と `update` で `permission denied` になります
- フェイクの commit は、自分が変えた分だけを共有の状態に書きます。同じメールの同時登録は、後の commit が `user_email_taken` で失敗します
- 発行先が例外を投げると、app1 は 500 で `event_publish_failed` を返し、書き込みは残ります
- app2 は署名のないリクエストを 401 で断り、スラッシュコマンドのドメインエラーを 200 の ephemeral で返します
- app2 は `DependencyError` を code 付きの ephemeral で、`EventPublishError` を注文確定の旨を添えた 200 で返します
- `shop_core.tables`、公開ビュー、`container.db()`(行ロック、LISTEN/NOTIFY、autocommit)が、Postgres のテストで動きます

## Slack アプリ

app2 は自前の `AppContainer` を持ち、shop_core の `Container` を `core` 属性として持ちます。
`app2/bootstrap.py` の `build_app_container` が核を `build_container` で作り、lifespan が検査して `app.state` に置きます。
app2 は S3 を使わないので、`check_image_store` は呼びません。
async のプロセスなので、`configure_thread_limit` でスレッドの上限をプールの接続数にそろえます。
テストでは `fake_backend(container.core, state)` で DB を差し替え、`container.override(slack_client=..., verifier=...)` で Slack の部品も差し替えます。

Slack ユーザーは、`slack_links` テーブルで基盤のユーザーに対応づけます。
初めてのユーザーは、仮のメールアドレス(`<slack_user_id>@slack.local`)で登録し、リンクを追加します。
この処理は `resolve_user_id` にまとめ、注文と同じ `transaction_async()` の中で `tx.run` から呼びます。
`tx.session` はフェイクにないので、DB なしのテストでは `resolve_user_id` を差し替えます。

Slack の設定(`SLACK_BOT_TOKEN`、`SLACK_SIGNING_SECRET`)はアプリの `SlackSettings` が読み、`DATABASE_URL` などはライブラリが読みます。
`SlackSettings` は、`provider(singleton=True)` のメソッドで最初の利用まで読みません。

Slack への投稿は取り消せないので、スコープを抜けて commit された後に行います。
投稿に失敗しても、注文は残ります。

```sh
SLACK_BOT_TOKEN=... SLACK_SIGNING_SECRET=... uv run uvicorn app2.main:app --port 8002
```

compose はダミーの値を渡すので、実際のワークスペースがなくても起動します。
ダミーの署名秘密では本物の Slack からのリクエストは通りません。

## Docker イメージ

Dockerfile は `app1/`、`app2/`、`packages/shop_core/`(migrate 用)の 3 つです。
ビルドコンテキストは、どれもワークスペースのルートです。
`shop_core` と `uv.lock` がルートにあり、アプリのディレクトリだけでは足りないためです。

```sh
docker build -f app1/Dockerfile .
```

アプリのイメージは `uv sync --frozen --no-dev --package <name>` で作ります。
`--package` は指定したメンバーとその依存だけを入れ、`--frozen` は `uv.lock` を更新しません。
app1 のイメージに app2 のコードや依存は入りません。

## ディレクトリ配置の注意

アプリをルート直下の `app1/` に置くと、`app1/src/app1` のパッケージ名と衝突します。
ルートから実行したとき、ルート直下の `app1/` が namespace package として先に拾われ、`import app1.main` が失敗します。
この構成を真似る場合は、2 つの対応が必要です。
pytest の import モードは既定の prepend のままにし、テストファイルの名前をアプリをまたいで一意にします。
もう 1 つは、各アプリの `pyproject.toml` に `dev-mode-dirs = ["src"]` を書くことです。
editable インストールが `.pth` で `src` を直接指すので、ルート直下の `app1/` に隠されません。
`apps/app1` のように 1 段下げれば、この問題は起きません。

## マイグレーションの追加と実行経路

```sh
cd packages/shop_core
DATABASE_URL=postgresql+psycopg://shop:shop@localhost:5432/shop uv run alembic revision --autogenerate -m "add column"
```

PR のレビューでは `alembic check` でモデルとのずれがないことを確かめます。
ビュー、GRANT、トリガーは metadata に載らないので、autogenerate の対象外です。手で書きます。
ビューを足すマイグレーションは、作った直後に `shop_app` から `INSERT, UPDATE, DELETE` を `REVOKE` します。
デプロイした後のマイグレーションは変更せず、新しい版を足します。
マイグレーションは後方互換(expand/contract)で書きます。

アプリは alembic を実行せず、マイグレーションの完了も待ちません。
適用するのは migrate イメージだけで、起動順はパイプラインが保証します。

- ローカル: 上の手順のとおり、アプリより先に `docker compose run --rm migrate` を実行します
- CI: 空の Postgres に migrate イメージで `upgrade head` を当て、`alembic check` と Postgres テストを走らせます
- CD: アプリをデプロイする前に、同じ migrate イメージを別の Docker コンテナとして 1 回走らせます

パイプラインの実装(GitHub Actions など)はこのリポジトリには置きません。
