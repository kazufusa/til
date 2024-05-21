import { Client } from "postgres";

const DB_NAME = Deno.env.get("DB_NAME") ?? "";
const DB_USER = Deno.env.get("DB_USER") ?? "";
const DB_HOST = Deno.env.get("DB_HOST") ?? "";
const DB_PORT = Deno.env.get("DB_PORT") ?? "";
const DB_PASSWORD = Deno.env.get("DB_PASSWORD") ?? "";
const task = Deno.env.get("TASK") ?? "";

type TASK = "A" | "B";
function queryPath(task: Task): string {
  switch (task) {
    case "A":
      return "./queries/a.sql";
    case "B":
      return "./queries/b.sql";
    default:
      console.error(`Invalid task: ${task}`);
      Deno.exit(1);
  }
}

const client = new Client({
  user: DB_USER,
  database: DB_NAME,
  hostname: DB_HOST,
  port: DB_PORT,
  password: DB_PASSWORD,
});
await client.connect();
const array_result = await client.queryArray(
  await Deno.readTextFile(queryPath(task)),
);
console.info(array_result.rows);
await client.end();
