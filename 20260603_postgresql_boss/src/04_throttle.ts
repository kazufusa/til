// 実験4: スループット制御（同時実行数とポーリング間隔）
//
// work() のオプション:
//   - batchSize:        1回の取得でまとめて受け取る件数
//   - pollingIntervalSeconds: 空のときに次に覗きに行く間隔
// send() のオプション:
//   - singletonKey:     同じキーのジョブは同時に1つしかactiveにしない（重複排除）
import { PgBoss } from "pg-boss";
import { CONNECTION_STRING, log } from "./db.ts";

const QUEUE = "rate-limited";

async function main() {
  const boss = new PgBoss(CONNECTION_STRING);
  boss.on("error", (e) => console.error("boss error:", e));
  await boss.start();
  await boss.createQueue(QUEUE);
  log("boss started");

  let inFlight = 0;
  let maxInFlight = 0;

  // batchSize:2 → 同時に最大2件まで掴む
  await boss.work(
    QUEUE,
    { batchSize: 2, pollingIntervalSeconds: 0.5 },
    async (jobs) => {
      inFlight += jobs.length;
      maxInFlight = Math.max(maxInFlight, inFlight);
      log(`processing ${jobs.length} (inFlight=${inFlight})`);
      await new Promise((r) => setTimeout(r, 800)); // 重い処理を模擬
      inFlight -= jobs.length;
    },
  );

  // 通常ジョブを20件
  for (let i = 0; i < 20; i++) {
    await boss.send(QUEUE, { i });
  }
  log("sent 20 jobs");

  // singletonKey で重複排除のデモ: 同じキーで3件送っても1件しか残らない。
  // 重要: デフォルトの policy='standard' では singleton 制約が無いので
  // 効かない。queued 状態で1件のみ許す policy='short' を指定する。
  //   short    : created(queued) 状態が key ごとに1件
  //   singleton: active 状態が key ごとに1件
  //   stately  : created/active/retry を通して key ごとに1件
  // policy は作成後に変更できない (updateQueue は policy 変更を弾く)。
  // 再実行でも確実に short にするため、一度消してから作り直す。
  const dedupQueue = "dedup";
  await boss.deleteQueue(dedupQueue).catch(() => {});
  await boss.createQueue(dedupQueue, { policy: "short" });
  let dedupRan = 0;
  await boss.work(dedupQueue, async () => {
    dedupRan++;
  });
  const r1 = await boss.send(dedupQueue, { v: 1 }, { singletonKey: "same" });
  const r2 = await boss.send(dedupQueue, { v: 2 }, { singletonKey: "same" });
  const r3 = await boss.send(dedupQueue, { v: 3 }, { singletonKey: "same" });
  log(`singletonKey sends -> ids: ${[r1, r2, r3].map((x) => (x ? "ok" : "dropped")).join(", ")}`);

  await new Promise((r) => setTimeout(r, 12000));

  log(`max concurrent batch in flight: ${maxInFlight}`);
  log(`dedup queue ran: ${dedupRan} time(s) (singletonKey で抑制)`);

  await boss.stop({ graceful: true });
  log("boss stopped");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
