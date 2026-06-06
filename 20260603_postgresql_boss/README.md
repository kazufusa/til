# pg-boss 実験

PostgreSQL をジョブキューにする [pg-boss](https://github.com/timgit/pg-boss) (v12.18.2) を触る実験場。

## セットアップ

```sh
bun run db:up        # PostgreSQL を docker で起動 (localhost:55432)
```

> WSL2 では先に Docker Desktop を起動しておくこと。

## 実験

| script | 内容 |
| --- | --- |
| `bun run demo:basic`    | 基本の send / work、batchSize、キューサイズ確認 |
| `bun run demo:retry`    | リトライ回数・遅延・指数バックオフ |
| `bun run demo:schedule` | cron スケジュール (`* * * * *`) と `startAfter` 遅延実行 |
| `bun run demo:throttle` | batchSize による同時実行制御、singletonKey による重複排除 |
| `bun run demo:deadletter` | retryLimit 枯渇後にデッドレターキューへ移送 |
| `bun run demo:competing`  | 複数ワーカー競合、FOR UPDATE SKIP LOCKED で exactly-once 取得 |
| `bun run demo:pubsub`     | 1イベント → 複数キューへ publish/subscribe ファンアウト |
| `bun run demo:priority`   | priority 指定で投入順と無関係に降順処理 |

## メモ (v10+ の要点)

- キューは `createQueue()` で**事前作成が必須**。
- `work()` のハンドラは**ジョブ配列**を受け取る (`async ([job]) => {}` か `async (jobs) => {}`)。
- ハンドラが throw → 失敗。`retryLimit` まで再投入される。
- ジョブの取得は `FOR UPDATE SKIP LOCKED` ベースなので、複数ワーカーでも重複しない。

## ハマりどころ (v12.18.2 で実際に踏んだ)

- **default export が無い**。`import { PgBoss } from "pg-boss"` (named import)。
- `getQueueSize()` は廃止。`getQueue(name)` が `queuedCount` / `activeCount` /
  `totalCount` 等を含むオブジェクトを返す。
- work ハンドラのジョブには `retryCount` が**無い** (`id,name,data,expireInSeconds,
  heartbeatSeconds,groupId,groupTier,signal` のみ)。リトライ回数は `getJobById()` で取得。
- `singletonKey` だけでは重複排除されない。キューの **policy** に依存する:
  - `standard` (既定): singleton 制約なし → dedup されない
  - `short`   : `created`(queued) 状態が key ごとに1件
  - `singleton`: `active` 状態が key ごとに1件
  - `stately` : `created`/`active`/`retry` を通して key ごとに1件
- **policy は作成後に変更不可**。`updateQueue({policy})` はエラー。変えるなら
  `deleteQueue()` → `createQueue()`。
- `pollingIntervalSeconds` は**最低 0.5 秒** (500ms 未満は assert で落ちる)。
- デッドレター移送ではジョブが DLQ に**新しい id で再生成**される（元 id とは別物）。
- 繰り返し実行する実験では `deleteQueuedJobs(queue)` で前回の残りを掃除しないと、
  未処理ジョブが次ランに混ざってカウントが狂う。

## 後片付け

```sh
bun run db:down      # 停止
bun run db:reset     # ボリュームごと作り直し
```
