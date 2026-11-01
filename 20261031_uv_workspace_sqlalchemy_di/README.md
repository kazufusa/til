# uv workspace で共有ライブラリとアプリを分ける構成

基盤チームが `shop_core` を配り、アプリチームはサービスを DI で受け取って呼ぶだけ、という形の検証です。
アプリ開発者向けの使い方は [packages/shop_core/README.md](packages/shop_core/README.md) にあります。
設計の理由は [docs/adr/](docs/adr/) にあります。

## 構成

```
pyproject.toml            # workspace ルート。exclude-newer は固定日付(2026-10-24)。手で更新する
docker-compose.yml        # db → app1, app2。migrate は profile で、up では起動しない
docs/adr/                 # 設計判断の記録(ADR)
packages/shop_core/       # 基盤チームの持ち物
  README.md               # アプリ開発者向けの使い方
  Dockerfile              # migrate 用。shop_core だけ入れる
  migrations/             # alembic。テーブルとビューの所有者は基盤
  src/shop_core/
    container.py          # dependency-injector のコンテナ
    settings.py           # DATABASE_URL、SQL_ECHO、DB_POOL_* の解決
    views.py              # 公開ビューの読み取り専用 mapped class
    testing.py            # フェイク UoW と fake_backend
    domain/               # dataclass のモデル、例外、Protocol
    infra/                # engine、ORM マッピング、リポジトリ、Database
    usecase/              # UnitOfWork、サービス、transaction()
    tables/               # 全テーブルの書き込める mapped class
  tests/                  # フェイクのテストと Postgres のテスト
app1/                     # ユーザー、商品、注文の HTTP API
app2/                     # Slack アプリ。イベントの受信とスラッシュコマンドでの注文
  src/app2/container.py   # shop_core の Container を入れ子にした AppContainer
  src/app2/settings.py    # SLACK_BOT_TOKEN と SLACK_SIGNING_SECRET の解決
  src/app2/slack.py       # 通知クラス、コマンド文字列の解釈、resolve_user_id
```

アプリはサービスを呼ぶだけで、`Session` の生成も `commit()` も接続設定も書きません。

## テスト

アプリのテストは DB なしで動きます。
`fake_backend` が、コンテナの `uow` と `transaction` をフェイクに差し替えます。

```sh
uv sync --all-packages
uv run pytest -q    # 38 passed, 27 skipped(Postgres 向けの 27 件が skip)
```

Postgres 向けのテストは、DB を起動してマイグレーションを当ててから走らせます。

```sh
docker compose up -d --build                # db, app1(:8001), app2(:8002)。migrate は起動しない
docker compose --profile migrate build      # マイグレーションを足したら先にイメージを作り直す
docker compose run --rm migrate             # マイグレーションを適用(パイプラインのローカル版)
TEST_DATABASE_URL=postgresql+psycopg://shop:shop@localhost:5432/shop uv run pytest -q    # 65 passed
```

`docker compose build` は profile の migrate を作り直しません。
`--profile migrate build` を忘れると、古いイメージで `Can't locate revision` になります。

Postgres テストは `TEST_DATABASE_URL` の `shop` と `app_test` のスキーマを削除して終わります。
開発用 DB と同じなら、テスト後は DB が空になるので、`docker compose run --rm migrate` で当て直してください。

## 確認した動作

- `docker compose up` は db の healthcheck だけを待って app1 と app2 を起動し、alembic は走りません
- `docker compose run --rm migrate` で `0001_initial`、`0002_read_views`、`0003_slack_links_and_constraints` が当たる。2 回目は何もしません
- `alembic upgrade head` の後に `alembic check` が通り、モデルとマイグレーションのずれはありません
- app1 でユーザー登録、商品登録、注文ができる。在庫超過は 409、未知のユーザーは 404 になります
- 在庫超過で失敗した注文は、orders にも products にも痕跡が残りません
- app2 は署名のないリクエストを 401 で断り、スラッシュコマンドのドメインエラーを 200 の ephemeral で返します
- `shop_core.tables`、公開ビュー、`container.db()`(行ロック、LISTEN/NOTIFY、autocommit)が、Postgres のテストで動きます
- `DB_POOL_*` が `Settings` に入り、数値でない値は変数名つきの `SettingsError` になります

## Slack アプリ

app2 は自前の `AppContainer` を持ち、`providers.Container` で shop_core の `Container` を入れ子にします。
テストでは `fake_backend(container.core, state)` で DB を差し替え、`slack_client` と `verifier` も差し替えます。

Slack ユーザーは、`slack_links` テーブルで基盤のユーザーに対応づけます。
初めてのユーザーは、仮のメールアドレス(`<slack_user_id>@slack.local`)で登録し、リンクを追加します。
この処理は `resolve_user_id` にまとめ、注文と同じ `container.core.transaction()` の中で呼びます。
`tx.session` はフェイクにないので、DB なしのテストでは `resolve_user_id` を差し替えます。

Slack の設定(`SLACK_BOT_TOKEN`、`SLACK_SIGNING_SECRET`)はアプリが読み、`DATABASE_URL` はライブラリが読みます。
`Configuration.from_env(required=True)` は import 時に読んで落ちるので、最初の利用まで読まない `Singleton` にしています。

Slack への投稿は取り消せないので、サービスの呼び出しが commit された後に行います。
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
importlib モードにすると、ルート直下の `app1/` がパッケージ名として使われます。
もう 1 つは、各アプリの `pyproject.toml` に `dev-mode-dirs = ["src"]` を書くことです。
editable インストールが `.pth` で `src` を直接指すので、ルート直下の `app1/` に隠されません。

`apps/app1` のように 1 段下げれば、この問題は起きません。

## マイグレーションの追加と実行経路

```sh
cd packages/shop_core
DATABASE_URL=postgresql+psycopg://shop:shop@localhost:5432/shop uv run alembic revision --autogenerate -m "add column"
```

PR のレビューでは `alembic check` でモデルとのずれがないことを確かめます。
ビューは metadata に載らないので、autogenerate の対象外です。ビューの追加は手で書きます。
0001 から 0003 は、どこにもデプロイする前に書き直したものです。デプロイ後は変更せず、新しい版を足します。

アプリは alembic を実行せず、マイグレーションの完了も待ちません。
適用するのは migrate イメージだけで、起動順はパイプラインが保証します。

- ローカル: `docker compose --profile migrate build` の後に `docker compose run --rm migrate` を実行します
- CI: 空の Postgres に migrate イメージで `upgrade head` を当て、`alembic check` と Postgres テストを走らせます
- CD: アプリをデプロイする前に、同じ migrate イメージを別の Docker コンテナとして 1 回走らせます

パイプラインの実装(GitHub Actions など)はこのリポジトリには置きません。
