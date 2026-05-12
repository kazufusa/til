// ============================================================================
// db.ts — PostgreSQL クライアント (postgres.js).
//
// 設計選択:
// - Bun ネイティブの Bun.sql ではなく `postgres` パッケージを使う (postgres.js).
//   理由: Vercel AI SDK のサンプルや tools.ts でのテンプレートタグ展開
//   (sql`select ... where x = any(${arr})`) が postgres.js のほうがこなれている.
// - DATABASE_URL は **必須**. fallback (hardcoded credential) は意図的に持たない.
//   .env に明示的に設定させて、誤って本番 DSN を埋め込まないようにする方針.
// ============================================================================

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. .env を作成して DATABASE_URL を設定してください (.env.example 参照)。"
  );
}

/**
 * 共有 SQL クライアント. ingest / tools 全てがこれを使う.
 *
 * - `max: 10`           ... ThreadPoolExecutor 並列 (ingest) や Search Agent の
 *                          並列ツール呼び出しを想定して 10 本確保.
 * - `idle_timeout: 30`  ... 30 秒アイドルなら接続を畳む. CLI 用途で常時接続は不要.
 * - `prepare: false`    ... pg_trgm や regex を含む SQL でプリペアド化と相性が悪いケースを避ける.
 *                          パフォーマンス劣化はあるが MVP では問題にならないレベル.
 */
export const sql = postgres(url, {
  max: 10,
  idle_timeout: 30,
  prepare: false,
});

/** CLI 終了時のクリーンアップ用. タイムアウト 5 秒で接続を切る. */
export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
