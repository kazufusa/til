// 実験2: リトライとバックオフ
//
// send() のオプションで
//   - retryLimit:   何回までリトライするか
//   - retryDelay:   リトライ間隔（秒）
//   - retryBackoff: true で指数バックオフ（retryDelay を基準に 2^n 倍）
// を指定できる。ハンドラが throw すると失敗としてカウントされ再投入される。
import { PgBoss } from "pg-boss";
import { CONNECTION_STRING, log } from "./db.ts";

const QUEUE = "flaky-task";

async function main() {
  const boss = new PgBoss(CONNECTION_STRING);
  boss.on("error", (e) => console.error("boss error:", e));
  await boss.start();
  await boss.createQueue(QUEUE);
  log("boss started");

  const attempts = new Map<string, number>();

  await boss.work(QUEUE, async ([job]) => {
    const n = (attempts.get(job.id) ?? 0) + 1;
    attempts.set(job.id, n);
    // 注: v12 の work ハンドラのジョブには retryCount は無い。
    // リトライ回数を見たいなら getJobById() で別途取得する。
    log(`attempt #${n} for job ${job.id}`);

    // 3回目で成功、それまでは失敗させる
    if (n < 3) {
      throw new Error(`simulated failure on attempt ${n}`);
    }
    log(`  -> SUCCESS on attempt ${n}`);
  });

  await boss.send(
    QUEUE,
    { payload: "important" },
    { retryLimit: 5, retryDelay: 1, retryBackoff: true },
  );
  log("sent flaky job (retryLimit=5, retryDelay=1s, backoff=on)");

  // バックオフを見たいので長めに待つ (1s, 2s, 4s ... と伸びる)
  await new Promise((r) => setTimeout(r, 12000));

  await boss.stop({ graceful: true });
  log("boss stopped");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
