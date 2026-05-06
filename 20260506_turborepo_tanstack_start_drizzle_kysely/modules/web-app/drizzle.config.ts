import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://app:app@localhost:5433/app";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  schemaFilter: ["web_app"],
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
