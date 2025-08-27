import { Effect, Schedule } from "effect";

// 疑似API (常に失敗)
const fetch: Effect.Effect<string, Error, never> = Effect.fail(
  new Error("error occured"),
);

const schedule = Schedule.intersect(
  Schedule.exponential("10 millis"),
  Schedule.recurs(5),
);

const program = Effect.gen(function* () {
  const response = yield* fetch.pipe(
    Effect.tapError((err) => Effect.logError(`fetch failed: ${String(err)}`)),
    Effect.retry(schedule),
  );
  yield* Effect.logInfo(response);
});

Effect.runPromise(program);
