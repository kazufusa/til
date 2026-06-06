// 実験5: デッドレターキュー (DLQ)
//
// createQueue(name, { deadLetter: "dlq" }) で、retryLimit を使い切って
// 最終的に失敗したジョブを別キュー "dlq" に移送できる。
// DLQ 自体も普通のキューなので work() で監視・調査できる。
import { PgBoss } from "pg-boss";
import { CONNECTION_STRING, log } from "./db.ts";

const QUEUE = "payment";
const DLQ = "payment-dead";

async function main() {
  const boss = new PgBoss(CONNECTION_STRING);
  boss.on("error", (e) => console.error("boss error:", e));
  await boss.start();

  // DLQ を先に作る → 本キューから deadLetter で参照
  await boss.createQueue(DLQ);
  await boss.createQueue(QUEUE, { deadLetter: DLQ });
  log("boss started (queue -> deadLetter)");

  // 本キューのワーカー: 必ず失敗する（retryLimit=2 なので計3回試行して力尽きる）
  let tries = 0;
  await boss.work(QUEUE, async ([job]) => {
    tries++;
    log(`[payment] try #${tries} job=${job.id} -> throwing`);
    throw new Error("payment gateway down");
  });

  // DLQ のワーカー: 死んだジョブを拾って中身を確認
  await boss.work(DLQ, async ([job]) => {
    log(`[DLQ] received dead job ${job.id}`, job.data);
  });

  await boss.send(QUEUE, { orderId: 42, amount: 1000 }, { retryLimit: 2, retryDelay: 1 });
  log("sent payment job (retryLimit=2)");

  // 3回試行 → DLQ 移送まで待つ
  await new Promise((r) => setTimeout(r, 10000));

  const main = await boss.getQueue(QUEUE);
  const dead = await boss.getQueue(DLQ);
  log(`payment queue total=${main?.totalCount}, dead queue total=${dead?.totalCount}`);

  await boss.stop({ graceful: true });
  log("boss stopped");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
