import type { Kysely } from "kysely";
import type { DB } from "../types";

export type Todo = {
  id: number;
  title: string;
  done: boolean;
  createdAt: Date;
};

export async function listTodos(db: Kysely<DB>): Promise<Todo[]> {
  const rows = await db
    .selectFrom("web_app.todos as todos")
    .select(["id", "title", "done", "created_at as createdAt"])
    .orderBy("created_at", "desc")
    .execute();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    done: r.done,
    createdAt: r.createdAt as unknown as Date,
  }));
}

export async function addTodo(db: Kysely<DB>, title: string): Promise<Todo> {
  const row = await db
    .insertInto("web_app.todos")
    .values({ title })
    .returning(["id", "title", "done", "created_at as createdAt"])
    .executeTakeFirstOrThrow();
  return {
    id: row.id,
    title: row.title,
    done: row.done,
    createdAt: row.createdAt as unknown as Date,
  };
}

// 戻り値: 新しい done の値。 該当 id が無ければ null。
export async function toggleTodo(
  db: Kysely<DB>,
  id: number,
): Promise<boolean | null> {
  const current = await db
    .selectFrom("web_app.todos as todos")
    .select("done")
    .where("id", "=", id)
    .executeTakeFirst();
  if (!current) return null;
  const next = !current.done;
  await db
    .updateTable("web_app.todos")
    .set({ done: next })
    .where("id", "=", id)
    .execute();
  return next;
}

// 戻り値: 削除した行数 (0 = 該当なし、 1 = 削除した)。
export async function deleteTodo(db: Kysely<DB>, id: number): Promise<number> {
  const result = await db
    .deleteFrom("web_app.todos")
    .where("id", "=", id)
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}
