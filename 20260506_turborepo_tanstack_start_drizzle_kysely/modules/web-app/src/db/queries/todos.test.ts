// 実 postgres (localhost:5433) に当てる統合テスト。
// 前提: `docker compose up -d` 済み + `bun run db:migrate` 済み。
//
// 各テスト前に web_app.todos を TRUNCATE するので、
// 並列実行はしない (bun test --concurrency=1 が default)。

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "../types";
import { addTodo, deleteTodo, listTodos, toggleTodo } from "./todos";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL が未設定。 modules/web-app/.env.example を .env にコピーしてください。",
  );
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

beforeEach(async () => {
  await db
    .deleteFrom("web_app.todos")
    .execute()
    .catch(async () => {
      // テーブルが無い (= migrate 忘れ) 等の場合の早期失敗
      throw new Error(
        "web_app.todos が無い。 `bun run db:migrate` を先に実行してください。",
      );
    });
});

afterAll(async () => {
  await db.destroy();
});

describe("queries/todos", () => {
  test("listTodos: 空のときは [] を返す", async () => {
    expect(await listTodos(db)).toEqual([]);
  });

  test("addTodo: 追加した行が返る + listTodos に出る", async () => {
    const created = await addTodo(db, "牛乳を買う");
    expect(created.id).toBeGreaterThan(0);
    expect(created.title).toBe("牛乳を買う");
    expect(created.done).toBe(false);
    expect(created.createdAt).toBeInstanceOf(Date);

    const list = await listTodos(db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.id, title: "牛乳を買う", done: false });
  });

  test("listTodos: 新しい順で返る", async () => {
    const a = await addTodo(db, "A");
    // created_at の順序を担保するため微小な待ち
    await new Promise((r) => setTimeout(r, 5));
    const b = await addTodo(db, "B");

    const list = await listTodos(db);
    expect(list.map((t) => t.id)).toEqual([b.id, a.id]);
  });

  test("toggleTodo: false → true → false と反転する", async () => {
    const t = await addTodo(db, "切替");
    expect(await toggleTodo(db, t.id)).toBe(true);
    expect(await toggleTodo(db, t.id)).toBe(false);

    const list = await listTodos(db);
    expect(list[0].done).toBe(false);
  });

  test("toggleTodo: 存在しない id は null を返し、 例外にしない", async () => {
    expect(await toggleTodo(db, 999_999)).toBeNull();
  });

  test("deleteTodo: 削除すると listTodos から消える + 1 を返す", async () => {
    const a = await addTodo(db, "残す");
    const b = await addTodo(db, "消す");

    expect(await deleteTodo(db, b.id)).toBe(1);

    const list = await listTodos(db);
    expect(list.map((t) => t.id)).toEqual([a.id]);
  });

  test("deleteTodo: 存在しない id は 0 を返す", async () => {
    expect(await deleteTodo(db, 999_999)).toBe(0);
  });
});
