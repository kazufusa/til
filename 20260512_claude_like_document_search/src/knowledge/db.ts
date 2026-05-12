import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. .env を作成して DATABASE_URL を設定してください (.env.example 参照)。"
  );
}

export const sql = postgres(url, {
  max: 10,
  idle_timeout: 30,
  prepare: false,
});

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
