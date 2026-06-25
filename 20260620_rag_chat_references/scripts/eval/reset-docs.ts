// docs/*.pdf.md のソース(+cascadeでchunks)を削除し、強制再 ingest できるようにする。
// #2(埋め込みテキスト変更)は保存 content を変えないため content_hash が同じ→通常 ingest はスキップする。
// A/B のため埋め込みを作り直したいので、いったん削除してから `MARKDOWN_DIR=docs bun run ingest`。
//   bun run scripts/eval/reset-docs.ts
import { sql } from "../../src/lib/db";

const before = await sql<{ c: string }[]>`SELECT count(*)::text c FROM sources WHERE filename LIKE '%.pdf.md'`;
console.log(`docs sources (削除前): ${before[0].c}`);
const r = await sql`DELETE FROM sources WHERE filename LIKE '%.pdf.md'`;
console.log(`削除した docs sources: ${r.count} 件 (chunks は cascade 削除)`);
console.log(`次: MARKDOWN_DIR=docs bun run ingest`);
await sql.end();
