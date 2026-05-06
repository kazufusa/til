import type { ColumnType, Generated } from "kysely";

export type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface TodosTable {
  id: Generated<number>;
  title: string;
  done: Generated<boolean>;
  created_at: Generated<Timestamp>;
}

// テーブルキーは常に `<schema>.<table>` で持つ。
// Kysely 側で `selectFrom("web_app.todos as todos")` のように schema を
// 必ず明示する運用にする。
export interface DB {
  "web_app.todos": TodosTable;
}
