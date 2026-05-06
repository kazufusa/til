# Bun + Turborepo + TanStack Start + PostgreSQL + Drizzle + Kysely

Todo アプリで、上記スタックの繋ぎ方の最小例を示すリポジトリ。

| レイヤ                | 採用したもの                                |
| --------------------- | ------------------------------------------- |
| パッケージ管理 / モノレポ | Bun workspaces + Turborepo                  |
| Web アプリ            | TanStack Start (Vite + React 19)            |
| DB                    | PostgreSQL 16 (docker-compose)              |
| マイグレーション      | Drizzle (drizzle-kit)                       |
| クエリ実行            | Kysely (型は手書き、 ドライバは `pg`)       |
| テスト                | bun:test (実 DB に当てる統合テスト)         |

## 必要なもの

- Bun >= 1.3 (本リポジトリは 1.3.12 で確認)
- Docker + Docker Compose

## 起動手順

```bash
git clone ... && cd turborepo_tanstack_start_drizzle_kysely

bun install                                            # 依存インストール
docker compose up -d                                   # postgres 起動 (host port 5433)

cd modules/web-app
cp .env.example .env                                   # DATABASE_URL を用意 (gitignore 対象)
bun run db:migrate                                     # 既存 migration を適用
bun run dev                                            # http://localhost:3000 (取られていれば 3001)
```

`.env` は module ごとに置く方針 (`modules/web-app/.env`)。
Bun も Vite も実行時の CWD から `.env` を読むので、 module 直下に置くのが自然。
`.env.example` を commit、 実体の `.env` は gitignore (`.env` は `.gitignore` の
パターン上、 どの階層に置いても無視される)。

5433 が他で使われているなら `docker-compose.yml` のポートマッピングを変え、
`.env` の URL もそれに合わせる。 `bun run db:migrate` を忘れると、
dev server を開いた瞬間に 「テーブルが無い」 エラーが出るのが目印。

## ディレクトリ構成

```
.
├── docker-compose.yml             # postgres 16 (host port 5433)
├── docker/initdb/                 # 初回起動時に走る SQL (役割A 参照)
├── package.json                   # bun workspaces / turbo entry
├── turbo.json
└── modules/web-app/               # TanStack Start アプリ
    ├── drizzle.config.ts
    └── src/
        ├── db/
        │   ├── schema.ts          # drizzle schema (web_app.todos)
        │   ├── types.ts           # kysely 用 DB 型
        │   ├── kysely.ts          # kysely インスタンス
        │   ├── queries/           # 実 DB に当てる薄い関数 + .test.ts
        │   └── migrations/        # drizzle-kit の生成物 (*.sql + meta/)
        ├── server/todos.ts        # createServerFn (queries を呼ぶだけ)
        ├── routes/                # ファイルベースのルーティング
        ├── router.tsx             # getRouter() を export
        └── styles.css
```

## マイグレーションの追加手順

```text
schema.ts 編集 → bun run db:generate → 生成 SQL を編集 → bun run db:migrate
```

詳細:

1. `src/db/schema.ts` を編集 (Kysely 用 `src/db/types.ts` も合わせて)。
2. `bun run db:generate` —
   `src/db/migrations/NNNN_xxx.sql` と `meta/NNNN_snapshot.json` が生成される。
3. 生成 SQL を編集:
   - 必須: 先頭の `CREATE SCHEMA "web_app";` 行 + 続く `--> statement-breakpoint` を削除する
     (schema 作成は `docker/initdb/` の責務、 後述)。
   - 任意: バックフィル / 複雑な制約等、 drizzle-kit が出せないものを足す。
4. `bun run db:migrate` で適用。 1 マイグレーションは postgres のトランザクションで
   包まれるので、 失敗時はロールバックされ、 同じ SQL を直して再実行できる。

詰まったら DB ごと作り直す:
```bash
docker compose down -v && docker compose up -d && bun run db:migrate
```
volume を消すので開発中のデータも消える。 `docker/initdb/*.sql` を変えたときも
volume を作り直さないと反映されない (postgres 公式イメージは初回起動時にしか
initdb を実行しない)。

`meta/*.json` は手で触らない (drizzle-kit が次の差分元として使う)。
適用済みマイグレーションは編集しない (新しい migration を積み増す)。
`src/db/migrations/` は丸ごとリポジトリにコミットする — 「どこまで当てたか」 は
postgres 側の `drizzle.__drizzle_migrations` テーブルが持つので、
新しいマシンでは `bun run db:migrate` で未適用分だけが流れる。

### schema に出ない変更 (`CREATE EXTENSION` 等)

drizzle schema には書けない変更は、 空の migration を採番してから手書きする。

```bash
cd modules/web-app
bunx drizzle-kit generate --custom --name enable_pgcrypto
# → src/db/migrations/0001_enable_pgcrypto.sql (中身カラ) が生成される

# 中身を書く
echo "CREATE EXTENSION IF NOT EXISTS pgcrypto;" \
  > src/db/migrations/0001_enable_pgcrypto.sql

bun run db:migrate
```

拡張は、 それを使うテーブルより番号が小さい migration で入れる
(drizzle は `_journal.json` の順に流すので)。

## テスト

DB クエリは `src/db/queries/` 配下に純関数として置き、 同じディレクトリで
`*.test.ts` を書いている。 実 postgres (= compose で立てた DB) に当てる統合テスト。

```bash
docker compose up -d              # まだなら
cd modules/web-app
bun run db:migrate                # スキーマを最新に
bun run test
```

各テストは `beforeEach` で `web_app.todos` を TRUNCATE して動く。
新しいクエリを足すたびにテストを書く方針。

## 設計方針

### schema 境界 (3 つのレイヤを混ぜない)

| レイヤ          | 何を作る                                  | どこに書く                                  |
| --------------- | ----------------------------------------- | ------------------------------------------- |
| 初期化 SQL      | schema (= 名前空間) の宣言だけ            | `docker/initdb/*.sql`                       |
| Drizzle migration | schema 配下のテーブル / 制約 / インデックス | `src/db/schema.ts` から自動生成             |
| アプリのクエリ  | データの読み書き                          | `src/db/queries/*.ts` (Kysely)              |

ポイント:

- アプリ用テーブルは `web_app` schema に集める。 `public` には何も置かない。
- Kysely では `selectFrom("web_app.todos as todos")` のように schema を毎回明示。
  `withSchema` や `search_path` でデフォルト切り替えはしない。
- `CREATE SCHEMA` を migration に入れない。 役割が `initdb` と被るため、
  毎回 generate 後に削る (上のフロー③)。

### role / GRANT / search_path はローカルでは触らない

postgres 公式イメージは `POSTGRES_USER` (= `app`) を superuser で作る。
ローカルでは `app` 一人で migrate もアプリのクエリも回しているので、
GRANT も ALTER ROLE も書かない。 schema を分ける意味は
「どのモジュールが所有しているか」 を名前空間で見せることだけ。

実環境での「 migration 用ロール」 「 アプリ用ロール」 「 RO ロール」 の使い分けは
infra / IaC の責務で、 このリポジトリには持ち込まない (環境間でズレる原因になるため)。

新しいモジュールを追加するときも、 `docker/initdb/*.sql` に
`CREATE SCHEMA IF NOT EXISTS xxx;` を 1 行足すだけ。

### ハマりどころメモ (TanStack Start 1.16x)

- サーバー関数は `createServerFn(...).inputValidator(...).handler(...)`。
  以前の `validator` ではない。
- ルーター entry は `getRouter()` 関数を export する形。 default export ではない。

## モノレポコマンド (turbo 経由 / リポジトリ直下で実行)

```bash
bun run dev          # 全 module の dev を並列実行
bun run build        # 全 module の build
bun run test         # 全 module の test
bun run typecheck    # tsc --noEmit
bun run db:generate  # drizzle migration 生成 (web-app)
bun run db:migrate   # drizzle migration 適用 (web-app)
```

## 参考

- [TanStack Start](https://tanstack.com/start)
- [Drizzle ORM / drizzle-kit](https://orm.drizzle.team/)
- [Kysely](https://kysely.dev/)
- [Bun (test runner)](https://bun.sh/docs/cli/test)
- [Turborepo](https://turbo.build/repo)
