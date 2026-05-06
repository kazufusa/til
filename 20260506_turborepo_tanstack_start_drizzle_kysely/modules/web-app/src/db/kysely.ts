import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./types";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL が未設定。 modules/web-app/.env.example を .env にコピーしてください。",
  );
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });

// schema は呼び出し側で常に明示する (例: selectFrom("web_app.todos"))。
// よって withSchema や search_path 改変は行わない。
export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
});
