import { z } from "zod";
import { makeApi, Zodios } from "@zodios/core";

// --- 既存の endpoints 定義はそのまま ---
// makeApi は各エンドポイントの literal 型を保持してくれるはず
export const endpoints = makeApi([
  { method: "get",  path: "/users",          alias: "getUsers",     response: z.array(User) },
  { method: "post", path: "/users",          alias: "postUsers",    response: z.void()    },
  { method: "get",  path: "/users/:userId",  alias: "getUserById",  response: User         },
  // 他…
]);

// この１行で、endpoints[i] の union 型を取る
type EndpointDef = typeof endpoints[number];

// E を「path と method を持つ EndpointDef のいずれか１つ」に制約する
export function parseResponse<E extends EndpointDef>(
  path: E["path"],
  method: E["method"],
  raw: unknown
): z.infer<E["response"]> {
  // 型ガード付き Find で TS に「これは E です」と教えてあげる
  const ep = endpoints.find(
    (e): e is E => e.path === path && e.method === method
  );
  if (!ep) {
    throw new Error(`Unknown endpoint ${method} ${path}`);
  }
  // ep.response は ZodType<…>、parse の戻り値は自動で z.infer<E["response"]> になります
  return ep.response.parse(raw);
}