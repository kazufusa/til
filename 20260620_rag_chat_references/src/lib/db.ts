import postgres from "postgres";
import { env } from "./env";

// Next dev のホットリロードで接続が増えないよう global に保持。
const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

export const sql =
  g.__sql ??
  (g.__sql = postgres(env.DATABASE_URL, {
    max: 10,
    // halfvec 等の独自型は text として受け取り、こちらで整形する
    types: {},
  }));

// number[] を pgvector / halfvec のリテラル文字列へ
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
