// docs/*.pdf.md を読み込み、documents + blocks に取り込む.
// 1ファイル = 1 document、ファイルパスから id を作る.

import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { sql, closeDb } from "../knowledge/db";
import { parseMarkdown } from "../knowledge/parser";

const DOCS_DIR = process.env.DOCS_DIR ?? "docs";

function deriveDocId(path: string): string {
  // path 全体を id に
  return path;
}

function deriveTitle(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1]!.trim() : fallback;
}

function deriveSummary(blocks: ReturnType<typeof parseMarkdown>): string {
  // 先頭 5 ブロック (heading + paragraph) を連結して上限 800 文字
  const parts: string[] = [];
  for (const b of blocks) {
    if (parts.join(" ").length > 700) break;
    if (b.blockType === "heading" || b.blockType === "paragraph") {
      parts.push(b.text);
    }
  }
  return parts.join(" ").slice(0, 800);
}

async function main(): Promise<void> {
  const files = (await readdir(DOCS_DIR))
    .filter((f) => f.endsWith(".md"))
    .sort();
  console.log(`ingesting ${files.length} files from ${DOCS_DIR}/`);

  let totalBlocks = 0;
  for (const file of files) {
    const path = join(DOCS_DIR, file);
    const md = await readFile(path, "utf-8");
    const blocks = parseMarkdown(md);
    const id = deriveDocId(path);
    const title = deriveTitle(md, basename(file, ".md"));
    const summary = deriveSummary(blocks);

    await sql.begin(async (tx) => {
      await tx`delete from documents where id = ${id}`;
      await tx`
        insert into documents (id, path, title, doc_type, summary)
        values (${id}, ${path}, ${title}, ${"unknown"}, ${summary})
      `;
      if (blocks.length > 0) {
        const values = blocks.map((b) => ({
          document_id: id,
          block_index: b.blockIndex,
          heading_path: b.headingPath,
          block_type: b.blockType,
          text: b.text,
        }));
        await tx`
          insert into blocks ${tx(
            values,
            "document_id",
            "block_index",
            "heading_path",
            "block_type",
            "text"
          )}
        `;
      }
    });

    totalBlocks += blocks.length;
    console.log(`  ${file}: ${blocks.length} blocks`);
  }
  console.log(`done. ${files.length} docs, ${totalBlocks} blocks`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
