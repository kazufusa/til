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
const usecase = Effect.gen(function* () {
  const repository = yield* UserRepository;
  const user = yield* repository.resolveByEmail("hoge@invalid.com");
  yield* Effect.logInfo(user);
});

// UserRepositoryの実装
const repositoryLayer = Layer.succeed(UserRepository, {
  resolveByEmail: (email: string) => Effect.succeed({ id: "hogehoge", email }),
  store: (_: User) => Effect.void,
});

// DIしてユースケースを実行
Effect.runPromise(Effect.provide(usecase, repositoryLayer));
