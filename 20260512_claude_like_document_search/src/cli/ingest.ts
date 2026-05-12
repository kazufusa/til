// ============================================================================
// ingest.ts — docs/*.md を読み込んで documents / blocks テーブルに投入する.
//
// 設計思想 (plan.md):
// - **1 ファイル = 1 document**. ファイル分割はしない.
// - **本文は blocks にしか保存しない**. documents.content のような重複カラムは作らない.
//   理由: 単一の真実 (single source of truth) を blocks に持たせると、検索/読み出しが
//   常に同じテーブルから取れて、整合性管理が要らない.
// - documents には探索用メタだけ載せる (path, title, summary, doc_type).
// - 取り込みは「全消し → 全入れ」ではなく **ファイル単位の upsert**.
//   トランザクション内で delete → insert することで、再実行しても重複しない.
//   (blocks に on delete cascade を張っているので documents の delete だけで連鎖.)
//
// 実行:
//   bun run ingest
//   DOCS_DIR=other_docs bun run ingest    # ディレクトリを変えたい時
// ============================================================================

import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { sql, closeDb } from "../knowledge/db";
import { parseMarkdown } from "../knowledge/parser";

// 取り込み元ディレクトリ. 既定は `docs/`.
const DOCS_DIR = process.env.DOCS_DIR ?? "docs";

/**
 * 文書 ID は **ファイルパスそのもの**.
 * 理由:
 *   - 人間が読めて、`blocks.document_id` と path の対応が一目でわかる
 *   - 同じファイルを 2 度 ingest しても同じ ID にぶつかって upsert で済む
 *   - 将来 UUID 等に切り替えるならここを直すだけで済むよう関数化
 *
 * 注意: ファイルを rename/move したら ID も変わる。それは「別文書」として扱われる.
 */
function deriveDocId(path: string): string {
  return path;
}

/**
 * 文書タイトルを markdown 先頭の H1 (`# ...`) から推定.
 * H1 が無い場合は fallback (ファイル名から拡張子を取ったもの) を使う.
 *
 * 注意: 本プロジェクトの docs/*.pdf.md は Gemini で生成しているため
 * 大抵 1 行目に H1 が入っている前提.
 */
function deriveTitle(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1]!.trim() : fallback;
}

/**
 * `documents.summary` を作る.
 * - 先頭の heading + paragraph を順に連結して 800 文字に切る.
 * - **本来は LLM で要約したいが**、ingest 時に LLM を呼ぶとコスト/速度に影響する.
 *   MVP では「最初に出てくる地の文を summary とみなす」シンプル方針.
 * - searchDocuments で path/title/summary に対する trigram + ILIKE 検索の
 *   ヒット率を上げるための「だいたいのトピック」用途.
 * - **回答根拠に使ってはいけない** (Search Agent / Chat Agent の prompt に明記).
 */
function deriveSummary(blocks: ReturnType<typeof parseMarkdown>): string {
  const parts: string[] = [];
  for (const b of blocks) {
    // 累積 700 文字超えたらこのブロックを足さずに終了 (最後に 800 で切るので余裕を持って)
    if (parts.join(" ").length > 700) break;
    if (b.blockType === "heading" || b.blockType === "paragraph") {
      parts.push(b.text);
    }
  }
  return parts.join(" ").slice(0, 800);
}

async function main(): Promise<void> {
  // DOCS_DIR 直下の *.md のみ対象. 再帰しないのは現状フラットな構成だから.
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

    // ファイル毎にトランザクションを切る:
    // - 何ファイル目で落ちても、既に入った文書は無事
    // - 同じ文書を再 ingest する時は delete → insert で完全に置換される
    //   (FK on delete cascade で blocks も全消し → 一括 insert)
    await sql.begin(async (tx) => {
      // 既存文書を消す. cascade で blocks も消える.
      await tx`delete from documents where id = ${id}`;

      // documents に upsert 相当の insert.
      await tx`
        insert into documents (id, path, title, doc_type, summary)
        values (${id}, ${path}, ${title}, ${"unknown"}, ${summary})
      `;

      // blocks をまとめて bulk insert.
      // postgres.js は配列をテンプレートタグで渡すと VALUES 句を自動展開してくれる.
      // 数千ブロックでも 1 クエリで済むので、行毎 insert に比べて圧倒的に速い.
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

// エラー時も必ず DB 接続を閉じてから終了する.
// 接続が残ると postgres.js が Bun のイベントループを離さず、プロセスがハングする.
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
