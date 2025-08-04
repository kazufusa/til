import {
  HttpClientRequest,
  HttpClient,
  HttpClientResponse,
  HttpClientError,
  HttpMethod,
} from "@effect/platform";
import { Effect, Data, pipe, Option } from "effect";
import { endpoints } from "./openapi.yaml.client";
import { ZodError,  unknown,  z } from "zod";

// endpoints から型を抽出
type Path = Endpoint["path"];
type Method = Endpoint["method"];
type Endpoint = (typeof endpoints)[number];
type ZodResponse = (typeof endpoints)[number]["response"];
// 特定のパスとメソッドの組み合わせに対応するエンドポイントを取得
type ExtractEndpoint<P extends Path, M extends Method> = Extract<
  Endpoint,
  { path: P; method: M }
>;

type ExtractEndpointResponse<P extends Path, M extends Method> = ExtractEndpoint<P, M>["response"];


// パラメータが必須かどうかを判定する型
type HasRequiredBody<P extends Path, M extends Method> =
  ExtractEndpoint<P, M> extends {
    parameters: Array<{ type: "Body" }>;
  }
    ? true
    : false;

type HasRequiredPath<P extends Path, M extends Method> =
  ExtractEndpoint<P, M> extends {
    parameters: Array<{ type: "Path" }>;
  }
    ? true
    : false;

// Path パラメータの型を抽出
type ExtractPathParams<P extends Path, M extends Method> =
  Extract<
    ExtractEndpoint<P, M> extends { parameters: any[] }
      ? ExtractEndpoint<P, M>["parameters"][number]
      : never,
    { type: "Path" }
  > extends { schema: z.ZodType<infer T> }
    ? T
    : never;

// リクエストボディの型を抽出
type ExtractBodyParams<P extends Path, M extends Method> =
  Extract<
    ExtractEndpoint<P, M> extends { parameters: any[] }
      ? ExtractEndpoint<P, M>["parameters"][number]
      : never,
    { type: "Body" }
  > extends { schema: z.ZodType<infer T> }
    ? T
    : never;

// 特定のパスで利用可能なメソッドを取得
type AvailableMethods<P extends Path> = Extract<
  Endpoint,
  { path: P }
>["method"];

// レスポンスの型を抽出
type ExtractZodSchema<P extends Path, M extends AvailableMethods<P>> =
  ExtractEndpoint<P, M>["response"]

type ExtractResponse<P extends Path, M extends Method> = ExtractZodSchema<P, M> extends z.ZodType<infer R> ? R : never;

// 必須パラメータと任意パラメータの型を構築
type RequiredParams<P extends Path, M extends Method> = (HasRequiredPath<
  P,
  M
> extends true
  ? { path: ExtractPathParams<P, M> }
  : unknown) &
  (HasRequiredBody<P, M> extends true
    ? { body: ExtractBodyParams<P, M> }
    : unknown);

type OptionalParams<P extends Path, M extends Method> = (HasRequiredPath<
  P,
  M
> extends true
  ? unknown
  : { path?: ExtractPathParams<P, M> }) &
  (HasRequiredBody<P, M> extends true
    ? unknown
    : { body?: ExtractBodyParams<P, M> });

// Fetcher の型定義を修正
export type Fetcher<P extends Path, M extends AvailableMethods<P>> = (
  path: P,
  method: M,
  params: RequiredParams<P, M> & Partial<OptionalParams<P, M>>,
) => Effect.Effect<
  ExtractResponse<P, M>,
  HttpClientError.HttpClientError,
  HttpClient.HttpClient
>;

class InvalidVariableError extends Data.TaggedError("InvalidVariableError")<{
  message: string;
}> {}
class ValidationError extends Data.TaggedError("ValidationError")<{ message: string }> {}
class HttpError extends Data.TaggedError("HttpError")<{ message: string }> {}
class NetworkError extends Data.TaggedError("NetworkError")<{ message: string }> {}
class TimeoutError extends Data.TaggedError("TimeoutError")<{ message: string }> {}

type FetchError = InvalidVariableError | ValidationError | HttpError | NetworkError | TimeoutError;

function isEndpoint<P extends Path, M extends Method>(
  path: P,
  method: M,
): (e: Endpoint) => e is ExtractEndpoint<P, M> {
  return (e): e is ExtractEndpoint<P, M> => e.path === path && e.method === method;
}

function getEndpoint<P extends Path, M extends Method>(
  path: P,
  method: M,
): Effect.Effect< Option.Option<ExtractEndpoint<P, M>>, never, never> {
  const endpoint = endpoints.find(isEndpoint(path, method));
  return Effect.succeed<Option.Option<ExtractEndpoint<P, M>>>(
    Option.fromNullable(endpoint)
  );
}

// リクエストを作成する関数
function createRequest(endpoint: Endpoint, params: any): Effect.Effect<Option.Option<Request>, never, never> {
  // ここで実際のリクエストオブジェクトを作成するロジックを実装
  // この例では簡略化のため、仮のリクエストオブジェクトを返します
  const request = new Request("http://example.com" + endpoint.path, {
    method: endpoint.method,
    headers: {
      "Content-Type": "application/json",
    },
    body: params.body ? JSON.stringify(params.body) : null,
  });
  return Effect.succeed(Option.some(request));
}

// fetcher関数の実装
export function fetcher<P extends Path, M extends AvailableMethods<P>>(
  path: P,
  method: M,
  params: RequiredParams<P, M> & Partial<OptionalParams<P, M>>,
): Effect.Effect<
  ExtractResponse<P, M>,
  FetchError,
  never
> {
  return pipe(
    Effect.gen(function* ($) {
      // getEndpoint はOption.Option<typeof endpoints[number]>を返す
      const maybeEndpoint = yield* $(getEndpoint(path, method));
      const endpoint = yield* $(Option.match(maybeEndpoint, {
        onNone: () => Effect.fail(new InvalidVariableError({ message: `Invalid path or method: ${path} ${method}` })),
        onSome: (endpoint) => Effect.succeed(endpoint)
      }));

      const maybeRequest = yield* $(createRequest(endpoint, params));
      const request = yield* $(Option.match(maybeRequest, {
        onNone: () => Effect.fail(new InvalidVariableError({ message: `Invalid parameters for path: ${path}` })),
        onSome: (request) => Effect.succeed(request)
      }));

      const response = yield* $(Effect.tryPromise({
        try: () => fetch(request),
        catch: (error) => {
          if (error instanceof TypeError) {
            return new NetworkError({ message: "Network error occurred" });
          }
          return new HttpError({ message: "HTTP error occurred" });
        }
      }))

      const json = yield* $(Effect.tryPromise({
        try: () => response.json(),
        catch: () => new HttpError({ message: "Failed to parse JSON response" })
      }));

      // 型安全なパース処理
      const result: ExtractResponse<P, M> = yield* Effect.try({
        try: () => endpoint.response.parse(json) as ExtractResponse<P, M>,
        catch: (error) => new ValidationError({ message: `Validation error: ${error}`}),
      })
      return 0 as ExtractResponse<P, M>;
    }),
    Effect.tapError(Effect.logWarning)
  );
};

// 使用例:
// 型推論が効くので、無効な組み合わせはコンパイルエラーになる
fetcher("/users", "get", {}); // OK
fetcher("/users/:userId", "get", { path: 123 }); // OK
fetcher("/users", "post", { body: { id: 1, name: "test" } }); // OK
fetcher("/invalid", "get", {}); // Error: パスが不正
fetcher("/users", "put", {}); // Error: メソッドが不正
fetcher("/users", "post", {}); // Error: bodyパラメータが必要


// Path パラメータの型を抽出
type ExtractPathParams2<E extends Endpoint> =
  Extract<
    E extends { parameters: any[] }
      ? E["parameters"][number]
      : never,
    { type: "Path" }
  > extends { schema: z.ZodType<infer T> }
    ? T
    : never;

// リクエストボディの型を抽出
type ExtractBodyParams2<E extends Endpoint> =
  Extract<
    E extends { parameters: any[] }
      ? E["parameters"][number]
      : never,
    { type: "Body" }
  > extends { schema: z.ZodType<infer T> }
    ? T
    : never;


// パラメータが必須かどうかを判定する型
type HasRequiredBody2<E extends Endpoint> =
  E extends { parameters: Array<{ type: "Body" }>; } ? true : false;

type HasRequiredPath2<E extends Endpoint> =
  E extends { parameters: Array<{ type: "Path" }>; } ? true : false;

// 必須パラメータと任意パラメータの型を構築
type RequiredParams2<E extends Endpoint> = (HasRequiredPath2<
  E
> extends true
  ? { path: ExtractPathParams2<E> }
  : unknown) &
  (HasRequiredBody2<E> extends true
    ? { body: ExtractBodyParams2<E> }
    : unknown);

type OptionalParams2<E extends Endpoint> = (HasRequiredPath2<
  E
> extends true
  ? unknown
  : { path?: ExtractPathParams2<E> }) &
  (HasRequiredBody2<E> extends true
    ? unknown
    : { body?: ExtractBodyParams2<E> });



type EndpointDef = typeof endpoints[number];

// Path パラメータ
type PathParam<E extends EndpointDef> = E extends { parameters: readonly any[] }
  ? // parameters 配列の中に type:"Path" があれば、その schema:T を path:T とする
    Extract<E["parameters"][number], { type: "Path" }> extends { schema: z.ZodType<infer T> }
      ? { path: T }
      : {}
  : {}; // parameters 自体がなければ空


// Body パラメータ
type BodyParam<E extends EndpointDef> = E extends { parameters: readonly any[] }
  ? Extract<E["parameters"][number], { type: "Body" }> extends { schema: z.ZodType<infer T> }
      ? { body: T }
      : {}
  : {};

// 最終的な params 型
type Params<E extends EndpointDef> = PathParam<E> & BodyParam<E>;

function aaa<E extends Endpoint>(
  path: E['path'],
  method: E['method'],
  params: Params<E>
  // params: RequiredParams2<E> & Partial<OptionalParams2<E>>,
): z.infer<E["response"]> {
  const ep = endpoints.find(
    (e): e is E => e.path === path && e.method === method
  );
  if (!ep) {
    throw new Error(`Unknown endpoint ${method} ${path}`);
  }
  return ep.response.parse({});
}

aaa("/users", "get", {}); // OK
aaa("/users/:userId", "get", { path: 123 }); // OK
aaa("/users", "post", { body: { id: 1, name: "test" } }); // OK
aaa("/invalid", "get", {}); // Error: パスが不正
aaa("/users", "put", {}); // Error: メソッドが不正
aaa("/users", "post", {}); // Error: bodyパラメータが必要
const a: Params<typeof endpoints[1]>  = {path: unknown, body: { id: 1, name: "test" }}