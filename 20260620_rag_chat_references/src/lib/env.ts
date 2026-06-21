import { z } from "zod";

// 環境変数の集約。bun も Next も .env を自動読込する。
// import 時はビルドを壊さないよう緩く読み、実行時に assertEnv() で厳格検証する。
export const env = {
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgres://rag:rag@localhost:5432/rag",
  GOOGLE_VERTEX_PROJECT: process.env.GOOGLE_VERTEX_PROJECT ?? "",
  GOOGLE_VERTEX_LOCATION: process.env.GOOGLE_VERTEX_LOCATION ?? "global",
  GOOGLE_APPLICATION_CREDENTIALS:
    process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "",
  GEMINI_CHAT_MODEL: process.env.GEMINI_CHAT_MODEL ?? "gemini-3.1-flash-lite",
  GEMINI_EMBEDDING_MODEL:
    process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  EMBEDDING_DIM: Number(process.env.EMBEDDING_DIM ?? "3072"),
};

// 必須環境変数の zod スキーマ(安全なデフォルトを置けないものは min(1) で必須)
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "必須"),
  GOOGLE_VERTEX_PROJECT: z.string().min(1, "必須"),
  GOOGLE_VERTEX_LOCATION: z.string().min(1).default("global"),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(""),
  GEMINI_CHAT_MODEL: z.string().min(1).default("gemini-3.1-flash-lite"),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default("gemini-embedding-001"),
  EMBEDDING_DIM: z.coerce.number().int().positive("正の整数であること"),
});

export type Env = z.infer<typeof envSchema>;

// 実行時のエントリポイント(取込スクリプト / API ルート)で呼ぶ。
// 不足・不正があれば即座に落とす。
export function assertEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `環境変数が不足/不正です:\n${detail}\n.env.example を参考に .env を設定してください。`,
    );
  }
  return parsed.data;
}
