# Effect-Tsいいよ みんなも使おう Effect Effect

TypeScript界のZIOことEffectの紹介です。Effectだとググラビリティが低いので検索したりAI Agentに投げるときは`Effect-Ts`としましょう。

## エラーハンドリングが強い

TypeScript(JavaScript)の鬼門ことエラーハンドリングですが、Effectは型パラメータでエラーが表現されるので安心安全です。

```
         ┌─── Represents the success type
         │        ┌─── Represents the error type
         │        │      ┌─── Represents required dependencies
         ▼        ▼      ▼
Effect<Success, Error, Requirements>

// https://effect.website/docs/getting-started/the-effect-type/
```

[playground](https://effect.website/play/#3aabb501e40f)

```typescript
import { Effect, Data } from "effect";

// Tag付きエラー型を定義
class KnownError extends Data.TaggedError("KnownError")<{ message: string }> {}
class UnknownError extends Data.TaggedError("UnknownError")<{
  message: string;
  cause: unknown;
}> {}

// task: Effect.Effect<number, KnownError | UnknownError, never> になる
// Effect.Effectの型パラメータは1. 戻り値, 2. エラー, 3. 依存
const task =
  Effect.try({
    try: () => {
      throw new Error("known error occured");
      return 1;
    },
    catch: (e) =>
      e instanceof Error
        ? new KnownError({ message: e.message })
        : new UnknownError({ message: String(e), cause: e }),
  });

// tap: 正常系副作用, tapError: 異常系副作用, catchTags: 特定エラーをcatch
const program = task.pipe(
  Effect.tap(Effect.logInfo),
  Effect.tapError((e) => Effect.logError(e)), // eは KnownError | UnknownErrorと解決される
  Effect.catchTags({ KnownError: () => Effect.succeed(0) }),
);

Effect.runSync(program);

// timestamp=2025-08-26T23:24:09.379Z level=ERROR fiber=#0 message="{
//   \"message\": \"known error occured\",
//   \"_tag\": \"KnownError\"
// }"
```

![1.png](./1.png)
![2.png](./2.png)

## 制御フロー

Effect.genで作成するGenerator内ではJavaScriptの制御構文がそのまま使えるので、取っつきやすいです。

[playground](https://effect.website/play/#ac36ea2a2ed8)

```typescript
// Admin専用処理を行う例
import { Effect } from "effect";

type Admin = {
  email: string;
  _tag: "admin";
};

type StandardUser = {
  email: string;
  _tag: "standardUser";
};

type User = Admin | StandardUser;

const resolveUser: Effect.Effect<User, never, never> = Effect.succeed({
  email: "hoge@invalid.com",
  _tag: "admin",
});

const adminTask = Effect.void;

const program = Effect.gen(function* () {
  const user: User = yield* resolveUser;
  switch (user._tag) {
    case "admin":
      yield* Effect.logInfo("start admin task");
      yield* adminTask;
      yield* Effect.logInfo("finish admin task");
      break;
    case "standardUser":
      break;
    default:
      const exhaustivenessCheck: never = user;
      break;
  }
});

Effect.runSync(program);

// timestamp=2025-08-26T23:26:53.284Z level=INFO fiber=#0 message="start admin task"
// timestamp=2025-08-26T23:26:53.287Z level=INFO fiber=#0 message="finish admin task"
```

複雑な制御をしたい時はEffect組み込みの制御関数を使いましょう。
とにかく種類が豊富なので大抵のユースケースは満たせます。
並列処理(上限付き)も簡単に書けます。

[playground](https://effect.website/play/#d3cde4a8f08a)

```typescript
import { Effect } from "effect";

const job = (id: number, delay: number) =>
  Effect.sleep(delay).pipe(Effect.tap(Effect.logInfo), Effect.as(`done ${id}`));

const program = Effect.all([job(1, 300), job(2, 200), job(3, 100)], {
  concurrency: 2,  // 完全並列にしたいときは"unbounded"
}).pipe(Effect.tap(Effect.logInfo));

Effect.runPromise(program);

// timestamp=2025-08-26T23:25:09.718Z level=INFO fiber=#3 message=undefined
// timestamp=2025-08-26T23:25:09.817Z level=INFO fiber=#2 message=undefined
// timestamp=2025-08-26T23:25:09.822Z level=INFO fiber=#3 message=undefined
// timestamp=2025-08-26T23:25:09.825Z level=INFO fiber=#0 message="[
//   \"done 1\",
//   \"done 2\",
//   \"done 3\"
// ]"
```


## リトライ処理も簡単

`Schedule`を使って宣言的に書けるのがいいですね。

[playground](https://effect.website/play/#793a8ea34718)

```
import { Effect, Schedule } from "effect";

// 常に失敗する疑似API
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
// timestamp=2025-08-27T00:09:41.566Z level=ERROR fiber=#0 message="fetch failed: Error: error occured"
// timestamp=2025-08-27T00:09:41.583Z level=ERROR fiber=#0 message="fetch failed: Error: error occured"
// timestamp=2025-08-27T00:09:41.606Z level=ERROR fiber=#0 message="fetch failed: Error: error occured"
// timestamp=2025-08-27T00:09:41.654Z level=ERROR fiber=#0 message="fetch failed: Error: error occured"
// timestamp=2025-08-27T00:09:41.749Z level=ERROR fiber=#0 message="fetch failed: Error: error occured"
// timestamp=2025-08-27T00:09:41.918Z level=ERROR fiber=#0 message="fetch failed: Error: error occured"
// (FiberFailure) Error: error occured
//     at Object.eval (/ho(略...
```

ScalaのZIOで見かけるポーリング処理を同じように実装できます。

[playground](https://effect.website/play/#2d45348fe40e)

```typescript
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
```


## Dependency Injection(DI)

もちろんDIもできます。`Effect.Effect`の3つ目の型パラメータは依存関係を表します。

```
         ┌─── Represents the success type
         │        ┌─── Represents the error type
         │        │      ┌─── Represents required dependencies
         ▼        ▼      ▼
Effect<Success, Error, Requirements>

// https://effect.website/docs/getting-started/the-effect-type/
// https://effect.website/docs/requirements-management/services/
```

下の例ではUserRepositoryをLayerとしてDIしています。Layerにすると複数の依存を一つのLayerにマージしてまとめてDIできるので実行側の実装が楽になります。
また、依存関係が満たされないEffectを実行しようとするとTypeScriptの型チェックでエラーが出ます。

[playground](https://effect.website/play/#5a7b4e848ecb)

```typesript
import { Effect, Context, Layer } from "effect";

type User = {
  id: string;
  email: string;
};

// UserRepositoryのinterface
class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    readonly resolveByEmail: (
      email: string,
    ) => Effect.Effect<User, unknown, never>;
    readonly store: (user: User) => Effect.Effect<void, unknown, never>;
  }
>() {}

// UserRepositoryを使うユースケース
const usecase: Effect.Effect<void, unknown, UserRepository> = Effect.gen(function* () {
  const repository = yield* UserRepository;
  const user = yield* repository.resolveByEmail("hoge@invalid.com");
  yield* Effect.logInfo(user);
});

// UserRepositoryの実装とLayer化
const repositoryLayer = Layer.succeed(UserRepository, {
  resolveByEmail: (email: string) => Effect.succeed({ id: "hogehoge", email }),
  store: (_: User) => Effect.void,
});

// DIしてユースケースを実行
Effect.runPromise(Effect.provide(usecase, repositoryLayer));
// Effect.runPromise(usecase)); UserRepositoryをDIせずに実行すると型エラー。

// timestamp=2025-08-27T01:02:18.652Z level=INFO fiber=#0 message="{
//   \"id\": \"hogehoge\",
//   \"email\": \"hoge@invalid.com\"
// }"
```

## llm.txtもあります

Effect機能多すぎて何をどう使ったらいいかわからない!
`pipe`で型エラー地獄に嵌ってしまった!
そんな時はAI AgentをEffectマスターに仕立て上げて助けてもらえます。

https://effect.website/docs/getting-started/introduction/#docs-for-llms
