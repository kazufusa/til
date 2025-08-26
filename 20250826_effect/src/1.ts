import { Effect, Data } from "effect";

class KnownError extends Data.TaggedError("KnownError")<{ message: string }> {}
class UnknownError extends Data.TaggedError("UnknownError")<{
  message: string;
  cause: unknown;
}> {}

// Effect.Effectの型パラメータは1. 戻り値, 2. エラー, 3. 依存
const task: Effect.Effect<number, KnownError | UnknownError, never> =
  Effect.try({
    try: () => {
      throw new Error("something known went wrong");
    },
    catch: (e) =>
      e instanceof Error
        ? new KnownError({ message: e.message })
        : new UnknownError({ message: String(e), cause: e }),
  });

// tap: 正常系副作用, tapError: 異常系副作用, catchTags: 特定エラーを握りつぶす
const program = task.pipe(
  Effect.tap(Effect.logInfo),
  Effect.tapError((e) => Effect.logError(e)), // eは KnownError | UnknownErrorと解決される
  Effect.catchTags({ KnownError: () => Effect.succeed(0) }),
);

Effect.runSync(program);
