import { Effect } from "effect";

const job = (id: number, ms: number) =>
  Effect.sleep(ms).pipe(Effect.tap(Effect.logInfo), Effect.as(`done ${id}`));

const program = Effect.all([job(1, 300), job(2, 200), job(3, 100)], {
  concurrency: 2, // 完全並列にしたいときは"unbounded"
}).pipe(Effect.logInfo);

Effect.runPromise(program);

// timestamp=2025-08-26T15:13:59.984Z level=INFO fiber=#4 message="done 3"\
// timestamp=2025-08-26T15:14:00.083Z level=INFO fiber=#3 message="done 2"\
// timestamp=2025-08-26T15:14:00.182Z level=INFO fiber=#2 message="done 1"\
// timestamp=2025-08-26T15:14:00.185Z level=INFO fiber=#0 message="[\
//   \"done 1\",\
//   \"done 2\",\
//   \"done 3\"\
// ]"
