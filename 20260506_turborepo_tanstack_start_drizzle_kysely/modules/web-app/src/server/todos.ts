import { createServerFn } from "@tanstack/react-start";
import { db } from "~/db/kysely";
import * as queries from "~/db/queries/todos";

export const listTodos = createServerFn({ method: "GET" }).handler(async () => {
  const todos = await queries.listTodos(db);
  return todos.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }));
});

export const addTodo = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("title" in data)) {
      throw new Error("title is required");
    }
    const title = (data as { title: unknown }).title;
    if (typeof title !== "string" || title.trim().length === 0) {
      throw new Error("title must be a non-empty string");
    }
    return { title: title.trim() };
  })
  .handler(async ({ data }) => {
    await queries.addTodo(db, data.title);
  });

export const toggleTodo = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("id" in data)) {
      throw new Error("id is required");
    }
    const id = (data as { id: unknown }).id;
    if (typeof id !== "number") throw new Error("id must be a number");
    return { id };
  })
  .handler(async ({ data }) => {
    await queries.toggleTodo(db, data.id);
  });

export const deleteTodo = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("id" in data)) {
      throw new Error("id is required");
    }
    const id = (data as { id: unknown }).id;
    if (typeof id !== "number") throw new Error("id must be a number");
    return { id };
  })
  .handler(async ({ data }) => {
    await queries.deleteTodo(db, data.id);
  });
