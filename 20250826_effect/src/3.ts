import { Effect, pipe } from "effect";

type Admin = {
  email: string;
  kind: "admin";
};

type StandardUser = {
  email: string;
  kind: "standardUser";
};

type User = Admin | StandardUser;

const resolveUser: Effect.Effect<User, never, never> = Effect.succeed({
  email: "hoge@invalid.com",
  kind: "admin",
});

const adminTask = Effect.void;

const program = Effect.gen(function* () {
  const user: User = yield* resolveUser;
  switch (user.kind) {
    case "admin":
      yield* Effect.logInfo("start admin task");
      yield* adminTask;
      yield* Effect.logInfo("finish admin task");
      return;
    case "standardUser":
      return yield* Effect.logInfo("not authorized");
    default:
      const exhaustivenessCheck: never = user;
      break;
  }
});

Effect.runSync(program);

// timestamp=2025-08-26T15:53:45.882Z level=INFO fiber=#0 message="start admin task"
// timestamp=2025-08-26T15:53:45.884Z level=INFO fiber=#0 message="finish admin task"
