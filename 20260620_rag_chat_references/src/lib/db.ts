import postgres from "postgres";
import { env } from "./env";

// Next dev のホットリロードで接続が増えないよう global に保持。
const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

export const sql =
  g.__sql ??
  (g.__sql = postgres(env.DATABASE_URL, {
    max: 10,
    // 暴走クエリ(ILIKE 先頭ワイルドカードの全スキャン等)を 5 秒で強制中断する保険。
    // LLM 駆動で任意語が検索に渡るため、1 本のクエリが DB を占有しないようにする。
    connection: { statement_timeout: 5000 },
    // halfvec 等の独自型は text として受け取り、こちらで整形する
    types: {},
  }));

// number[] を pgvector / halfvec のリテラル文字列へ
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
