// 実験7: pub/sub (1イベント → 複数キューへファンアウト)
//
//   - boss.subscribe(event, queue): イベント名にキューを紐付ける
//   - boss.publish(event, data):     購読している全キューへ同じデータを投入
// 1つの "user.signed_up" イベントを email/analytics/audit の3キューに配る、
// といったファンアウトに使える。
import { PgBoss } from "pg-boss";
import { CONNECTION_STRING, log } from "./db.ts";

const EVENT = "user.signed_up";
const SUBSCRIBERS = ["send-welcome-email", "track-analytics", "write-audit-log"];

async function main() {
  const boss = new PgBoss(CONNECTION_STRING);
  boss.on("error", (e) => console.error("boss error:", e));
  await boss.start();
  log("boss started");

  for (const q of SUBSCRIBERS) {
    await boss.createQueue(q);
    await boss.subscribe(EVENT, q);
    await boss.work(q, async ([job]) => {
      log(`[${q}] handled`, job.data);
    });
  }
  log(`subscribed ${SUBSCRIBERS.length} queues to '${EVENT}'`);

  // 1回 publish → 3キューすべてに届く
  await boss.publish(EVENT, { userId: 7, email: "new@example.com" });
  log(`published '${EVENT}' once`);

  await new Promise((r) => setTimeout(r, 3000));

  for (const q of SUBSCRIBERS) {
    const stat = await boss.getQueue(q);
    log(`${q}: total=${stat?.totalCount}`);
  }

  // 後片付け: 購読解除
  for (const q of SUBSCRIBERS) await boss.unsubscribe(EVENT, q);

  await boss.stop({ graceful: true });
  log("boss stopped");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
