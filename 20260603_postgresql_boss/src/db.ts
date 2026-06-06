// 共通の接続文字列。docker-compose.yml のポート/認証情報に合わせている。
export const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  "postgres://pgboss:pgboss@localhost:55432/pgboss";

export function log(...args: unknown[]) {
  const t = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  console.log(`[${t}]`, ...args);
}
