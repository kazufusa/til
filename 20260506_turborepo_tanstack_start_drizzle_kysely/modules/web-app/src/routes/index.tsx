import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  addTodo,
  deleteTodo,
  listTodos,
  toggleTodo,
} from "~/server/todos";

export const Route = createFileRoute("/")({
  component: HomePage,
  loader: async () => ({ todos: await listTodos() }),
});

function HomePage() {
  const { todos } = Route.useLoaderData();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await addTodo({ data: { title } });
      setTitle("");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(id: number) {
    setBusy(true);
    try {
      await toggleTodo({ data: { id } });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    setBusy(true);
    try {
      await deleteTodo({ data: { id } });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>Todos</h1>
      <p className="subtitle">
        TanStack Start + Drizzle (migrations) + Kysely (queries)
      </p>

      <form onSubmit={handleAdd} className="add-form">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="やることを入力..."
          disabled={busy}
        />
        <button type="submit" disabled={busy || !title.trim()}>
          追加
        </button>
      </form>

      <ul className="todo-list">
        {todos.length === 0 && <li className="empty">まだTodoはありません</li>}
        {todos.map((t) => (
          <li key={t.id} className={t.done ? "done" : ""}>
            <label>
              <input
                type="checkbox"
                checked={t.done}
                disabled={busy}
                onChange={() => handleToggle(t.id)}
              />
              <span>{t.title}</span>
            </label>
            <button
              type="button"
              className="delete"
              disabled={busy}
              onClick={() => handleDelete(t.id)}
            >
              削除
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
