// 実験6: 複数ワーカーの競合 (exactly-once 取得)
//
// 同じキューに複数のワーカーを登録すると、FOR UPDATE SKIP LOCKED により
// 1つのジョブは必ず1ワーカーにしか渡らない（二重処理されない）。
// ここでは 4 ワーカー × 40 ジョブで、各ジョブがちょうど1回だけ処理され、
// 負荷がワーカー間に分散することを確認する。
import { PgBoss } from "pg-boss";
import { CONNECTION_STRING, log } from "./db.ts";

const QUEUE = "work-stealing";
const WORKERS = 4;
const JOBS = 40;

async function main() {
  const boss = new PgBoss(CONNECTION_STRING);
  boss.on("error", (e) => console.error("boss error:", e));
  await boss.start();
  await boss.createQueue(QUEUE);
  // 前回ランの未処理ジョブが残っていると n が衝突して duplicate に見えるので、
  // 毎回キューを空にしてから始める（exactly-once を正しく観測するため）。
  await boss.deleteQueuedJobs(QUEUE).catch(() => {});
  log(`boss started: ${WORKERS} workers, ${JOBS} jobs`);

  const seen = new Map<number, number>(); // jobNum -> 処理回数
  const perWorker = new Array(WORKERS).fill(0);

  for (let w = 0; w < WORKERS; w++) {
    await boss.work(QUEUE, { batchSize: 3 }, async (jobs) => {
      for (const job of jobs) {
        const n = (job.data as { n: number }).n;
        seen.set(n, (seen.get(n) ?? 0) + 1);
        perWorker[w]++;
      }
      await new Promise((r) => setTimeout(r, 100)); // 処理時間を模擬
    });
  }

  for (let i = 0; i < JOBS; i++) {
    await boss.send(QUEUE, { n: i });
  }
  log("all jobs sent");

  await new Promise((r) => setTimeout(r, 10000));

  const processed = seen.size;
  const duplicates = [...seen.entries()].filter(([, c]) => c > 1);
  log(`distinct jobs processed: ${processed}/${JOBS}`);
  log(`duplicates (二重処理): ${duplicates.length}`);
  log(`per-worker counts: [${perWorker.join(", ")}]`);

  await boss.stop({ graceful: true });
  log("boss stopped");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
