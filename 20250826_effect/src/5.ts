import { Effect, Schedule, Data } from "effect";

type Response = {
  code: number;
  data: Record<string, string>[];
};

class AcceptedButNotFinishedError extends Data.TaggedError(
  "AcceptedButNotFinishedError",
)<{}> {}
class FetchError extends Data.TaggedError("FetchError")<{}> {}

// 処理中しか返さない疑似API
const fetch: Effect.Effect<Response, FetchError, never> = Effect.logInfo(
  "try fetch",
).pipe(
  Effect.as({
    code: 202,
    data: [],
  }),
);
// ポーリングなしで即エラーとなる疑似API
// const fetch: Effect.Effect<Response, FetchError, never> = Effect.fail(new FetchError())

// AcceptedButNotFinishedErrorの場合だけリトライするScheduler
const schedule = Schedule.spaced("2 seconds").pipe(
  Schedule.intersect(Schedule.recurUpTo("10 seconds")),
  Schedule.intersect(
    Schedule.recurWhile((err) => err instanceof AcceptedButNotFinishedError),
  ),
);

const program = Effect.gen(function* () {
  // ポーリング実施
  const response = yield* fetch.pipe(
    Effect.flatMap((res) =>
      res.code === 202
        ? Effect.fail(new AcceptedButNotFinishedError())
        : Effect.succeed(res),
    ),
    Effect.retry(schedule),
  );
  yield* Effect.logInfo(response);
});

Effect.runPromise(program);

// timestamp=2025-08-27T00:41:54.325Z level=INFO fiber=#0 message="try fetch"\
// timestamp=2025-08-27T00:41:56.338Z level=INFO fiber=#0 message="try fetch"\
// timestamp=2025-08-27T00:41:58.348Z level=INFO fiber=#0 message="try fetch"\
// timestamp=2025-08-27T00:42:00.358Z level=INFO fiber=#0 message="try fetch"\
// timestamp=2025-08-27T00:42:02.374Z level=INFO fiber=#0 message="try fetch"\
// timestamp=2025-08-27T00:42:04.382Z level=INFO fiber=#0 message="try fetch"\
// (FiberFailure) AcceptedButNotFinishedError: An error has occurred\
//     at new AcceptedButNotFinishedError (以下略
