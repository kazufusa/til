// 実験3: cron スケジュールと遅延実行
//
//   - boss.schedule(queue, cron, data): cron 式で定期投入
//   - boss.send(queue, data, { startAfter }): 遅延実行（秒/日時/ISO文字列）
// スケジューラは pg-boss 内部のタイマーが回す。複数プロセスでも
// SKIP LOCKED で重複実行しないようになっている。
import { PgBoss } from "pg-boss";
import { CONNECTION_STRING, log } from "./db.ts";

const CRON_QUEUE = "heartbeat";
const DELAY_QUEUE = "delayed-task";

async function main() {
  const boss = new PgBoss(CONNECTION_STRING);
  boss.on("error", (e) => console.error("boss error:", e));
  await boss.start();
  await boss.createQueue(CRON_QUEUE);
  await boss.createQueue(DELAY_QUEUE);
  log("boss started");

  // 既存スケジュールを掃除してから登録（再実行しても重複しないように）
  await boss.unschedule(CRON_QUEUE).catch(() => {});

  await boss.work(CRON_QUEUE, async ([job]) => {
    log(`[cron] tick ${job.id}`, job.data);
  });
  await boss.work(DELAY_QUEUE, async ([job]) => {
    log(`[delay] fired ${job.id}`, job.data);
  });

  // 毎分0秒に実行する cron（最小粒度は1分）
  await boss.schedule(CRON_QUEUE, "* * * * *", { source: "cron" });
  log("scheduled heartbeat: '* * * * *'");

  // 5秒後に実行する遅延ジョブ
  await boss.send(DELAY_QUEUE, { source: "startAfter" }, { startAfter: 5 });
  log("sent delayed job: startAfter=5s");

  // cron が1回は発火するよう 70 秒回す
  log("running for 70s to observe at least one cron tick...");
  await new Promise((r) => setTimeout(r, 70000));

  await boss.unschedule(CRON_QUEUE).catch(() => {});
  await boss.stop({ graceful: true });
  log("boss stopped");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
