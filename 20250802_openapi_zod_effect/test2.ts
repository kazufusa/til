import {
  HttpClientRequest,
  HttpClient,
  HttpClientResponse,
  HttpClientError,
} from "@effect/platform";
import { Effect } from "effect";
import { endpoints } from "./openapi.yaml.client";
import type { z } from "zod";

// endpoints から型を抽出
type Endpoint = (typeof endpoints)[number];
type Path = Endpoint["path"];
type Method = Endpoint["method"];

// 特定のパスで利用可能なメソッドを取得
type AvailableMethods<P extends Path> = Extract<
  Endpoint,
  { path: P }
>["method"];

// 特定のパスとメソッドの組み合わせに対応するエンドポイントを取得
type ExtractEndpoint<P extends Path, M extends Method> = Extract<
  Endpoint,
  { path: P; method: M }
>;

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

// レスポンスの型を抽出
type ExtractResponse<P extends Path, M extends Method> =
  ExtractEndpoint<P, M>["response"] extends z.ZodType<infer R> ? R : never;

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

const b: Fetcher<"/users", "post"> = undefined as any;
// params.body は { id: number, name?: string } 型になる
// ...existing code...

// fetcher関数の実装
export function fetcher<P extends Path, M extends AvailableMethods<P>>(
  path: P,
  method: M,
  params: RequiredParams<P, M> & Partial<OptionalParams<P, M>>,
): Effect.Effect<
  ExtractResponse<P, M>,
  HttpClientError.HttpClientError,
  HttpClient.HttpClient
> {
  return Effect.gen(function* ($) {
    // Find matching endpoint
    const endpoint = endpoints.find(
      (e): e is ExtractEndpoint<P, M> => e.path === path && e.method === method,
    );

    if (!endpoint) {
      return yield* $(
        Effect.fail(
          new HttpClientError.RequestError({
            request: {} as any,
            error: new Error(`Endpoint not found: ${method} ${path}`),
          }),
        ),
      );
    }

    // TODO: 実際のHTTPリクエストの実装
    const response = yield* $(
      Effect.succeed({ id: 1, name: "test" }), // dummy response
    );

    // Validate response using endpoint's schema
    return yield* $(
      Effect.try({
        try: () => endpoint.response.parse(response),
        catch: (error) =>
          new HttpClientError.ResponseError({
            request: {} as any,
            response: {} as any,
            error: error as Error,
          }),
      }),
    );
  });
}

// 使用例:
// 型推論が効くので、無効な組み合わせはコンパイルエラーになる
fetcher("/users", "get", {}); // OK
fetcher("/users/:userId", "get", { path: 123 }); // OK
fetcher("/users", "post", { body: { id: 1, name: "test" } }); // OK
fetcher("/invalid", "get", {}); // Error: パスが不正
fetcher("/users", "put", {}); // Error: メソッドが不正
fetcher("/users", "post", {}); // Error: bodyパラメータが必要
