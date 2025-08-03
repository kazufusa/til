import { FetchHttpClient, HttpClient } from "@effect/platform";
import { Effect, Layer, Console, Logger } from "effect";
import * as assert from "node:assert";

// Mock fetch implementation
const FetchTest = Layer.succeed(FetchHttpClient.Fetch, () =>
  Promise.resolve(new Response(`{"hello":"world"}`, { status: 404 })),
);

const TestLayer = FetchHttpClient.layer.pipe(Layer.provide(FetchTest));

const program = Effect.gen(function* () {
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.filterStatusOk,
    HttpClient.tapRequest((x) =>
      Effect.logInfo("", { url: x.url, body: JSON.stringify(x.body) }),
    ),
    HttpClient.tap(Effect.logInfo),
    HttpClient.tapError(Effect.logWarning),
    HttpClient.withTracerPropagation(true),
  );
  return yield* client
    .get("https://www.google.com/")
    .pipe(Effect.flatMap((res) => res.json))
    .pipe(Effect.annotateLogs("kind", "da_api"));
});

Effect.gen(function* () {
  const response = yield* program;
  assert.deepStrictEqual(response, { hello: "world" });
}).pipe(
  Effect.provide(TestLayer),
  Effect.provide(Logger.structured),
  Effect.runPromise,
);
