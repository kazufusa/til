// 実験8: 優先度 (priority)
//
// send(queue, data, { priority }) で優先度を指定。数値が大きいほど先に処理される。
// ワーカーを後から起動して、投入順がバラバラでも priority 降順で取り出される
// ことを確認する。
import { PgBoss } from "pg-boss";
import { CONNECTION_STRING, log } from "./db.ts";

const QUEUE = "priority-jobs";

async function main() {
  const boss = new PgBoss(CONNECTION_STRING);
  boss.on("error", (e) => console.error("boss error:", e));
  await boss.start();
  await boss.createQueue(QUEUE);
  await boss.deleteQueuedJobs(QUEUE).catch(() => {}); // 前回ランの残りを掃除
  log("boss started");

  // 先に投入（ワーカーはまだ無い）。投入順は priority と無関係にする。
  const inputs = [
    { label: "low-A", priority: 1 },
    { label: "high-A", priority: 10 },
    { label: "mid-A", priority: 5 },
    { label: "high-B", priority: 10 },
    { label: "low-B", priority: 1 },
    { label: "mid-B", priority: 5 },
  ];
  for (const job of inputs) {
    await boss.send(QUEUE, { label: job.label }, { priority: job.priority });
  }
  log(`enqueued ${inputs.length} jobs (priority bury order)`);

  // ここでワーカー起動。batchSize=1 で1件ずつ取り、取り出し順を観察する。
  const order: string[] = [];
  await boss.work(QUEUE, { batchSize: 1, pollingIntervalSeconds: 0.5 }, async ([job]) => {
    const label = (job.data as { label: string }).label;
    order.push(label);
    log(`processing: ${label}`);
  });

  await new Promise((r) => setTimeout(r, 5000));
  log(`processing order: ${order.join(" -> ")}`);
  log("期待: high(10) 群 -> mid(5) 群 -> low(1) 群");

  await boss.stop({ graceful: true });
  log("boss stopped");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
