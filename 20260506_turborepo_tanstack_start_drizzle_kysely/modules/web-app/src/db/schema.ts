import { boolean, pgSchema, serial, text, timestamp } from "drizzle-orm/pg-core";

export const webApp = pgSchema("web_app");

export const todos = webApp.table("todos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
