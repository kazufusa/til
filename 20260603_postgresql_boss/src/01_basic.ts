// 実験1: 一番基本の send / work
//
// pg-boss v10+ では
//   - キューは createQueue() で事前に作る必要がある
//   - work() のハンドラはジョブ「配列」を受け取る（バッチ取得のため）
import { PgBoss } from "pg-boss";
import { CONNECTION_STRING, log } from "./db.ts";

const QUEUE = "basic-email";

async function main() {
  const boss = new PgBoss(CONNECTION_STRING);
  boss.on("error", (e) => console.error("boss error:", e));

  await boss.start();
  log("boss started");

  await boss.createQueue(QUEUE);

  // ワーカー登録: batchSize ぶんまとめて取得する
  await boss.work(QUEUE, { batchSize: 5 }, async (jobs) => {
    log(`worker got ${jobs.length} job(s)`);
    for (const job of jobs) {
      log(`  -> processing job ${job.id}`, job.data);
    }
    // 例外を投げなければ自動で completed になる
  });

  // プロデューサー: 10件投入
  for (let i = 1; i <= 10; i++) {
    const id = await boss.send(QUEUE, { to: `user${i}@example.com`, n: i });
    log(`sent job ${id}`);
  }

  // ワーカーが捌くのを待つ
  await new Promise((r) => setTimeout(r, 3000));

  // キューの統計を確認 (v12 は getQueue がカウントを含むオブジェクトを返す)
  const q = await boss.getQueue(QUEUE);
  log(
    `queue stats: queued=${q?.queuedCount} active=${q?.activeCount} total=${q?.totalCount}`,
  );

  await boss.stop({ graceful: true });
  log("boss stopped");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
