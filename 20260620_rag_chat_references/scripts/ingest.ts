// markdowns/ と skills/ を読み込み、チャンク化・埋め込み・DB投入する。
//   bun run scripts/ingest.ts
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, basename } from "node:path";
import { assertEnv } from "../src/lib/env";
import { sql, toVectorLiteral } from "../src/lib/db";
import { chunkMarkdown } from "../src/lib/chunk";
import { embedDocuments } from "../src/lib/embed";

const ROOT = join(import.meta.dirname, "..");
// 取込元ディレクトリ(ROOT 相対)。既定は markdowns/。例: MARKDOWN_DIR=docs
const MARKDOWN_REL = process.env.MARKDOWN_DIR ?? "markdowns";
const MARKDOWN_DIR = join(ROOT, MARKDOWN_REL);
const SKILLS_DIR = join(ROOT, "skills");
const EMBED_BATCH = 50;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// markdown の H1 か先頭見出しをタイトルに採用(なければファイル名)
function deriveTitle(raw: string, filename: string): string {
  const m = raw.match(/^#{1,6}\s+(.+)$/m);
  return m ? m[1].trim() : filename;
}

// skill.md の簡易フロントマター(name / description)を読む
function parseFrontmatter(raw: string): {
  name?: string;
  description?: string;
} {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) out[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { name: out.name, description: out.description };
}

// 1 ファイルを sources + chunks(チャンク化→埋め込み)へ取り込む。
// markdown ソースにもスキル(skill.md = ドキュメント)にも使う。
async function upsertSource(filename: string, raw: string, relPath: string) {
  const hash = sha256(raw);
  const existing = await sql<{ id: number; content_hash: string }[]>`
    SELECT id, content_hash FROM sources WHERE filename = ${filename}
  `;
  if (existing.length && existing[0].content_hash === hash) {
    console.log(`= ${filename} (unchanged, skip)`);
    return;
  }
  if (existing.length) {
    await sql`DELETE FROM sources WHERE id = ${existing[0].id}`; // cascade で chunks も削除
  }

  const title = deriveTitle(raw, filename);
  const [{ id: sourceId }] = await sql<{ id: number }[]>`
    INSERT INTO sources (filename, title, rel_path, byte_size, content, content_hash)
    VALUES (${filename}, ${title}, ${relPath},
            ${Buffer.byteLength(raw, "utf8")}, ${raw}, ${hash})
    RETURNING id
  `;

  const chunks = chunkMarkdown(raw);
  console.log(`+ ${filename}: ${chunks.length} chunks, embedding...`);

  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const embeddings = await embedDocuments(batch.map((c) => c.content));
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      await sql`
        INSERT INTO chunks (source_id, ordinal, block_type, heading_depth,
          heading_path, heading_text, char_start, char_end, content,
          token_estimate, embedding)
        VALUES (${sourceId}, ${c.ordinal}, ${c.blockType}, ${c.headingDepth},
          ${c.headingPath}, ${c.headingText}, ${c.charStart}, ${c.charEnd},
          ${c.content}, ${c.tokenEstimate}, ${toVectorLiteral(embeddings[j])}::halfvec)
      `;
    }
    process.stdout.write(
      `  ${Math.min(i + EMBED_BATCH, chunks.length)}/${chunks.length}\r`,
    );
  }
  console.log(`  done: ${filename}`);
}

async function ingestSources() {
  // 引数でファイル名を指定すると、その markdown だけ取り込む(検証用)
  const only = new Set(process.argv.slice(2));
  let files: string[] = [];
  try {
    files = (await readdir(MARKDOWN_DIR))
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .filter((f) => f.toUpperCase() !== "README.MD") // 出典一覧は対象外
      .filter((f) => only.size === 0 || only.has(f));
  } catch {
    console.warn(`markdowns/ が見つかりません: ${MARKDOWN_DIR}`);
    return;
  }

  for (const filename of files.sort()) {
    const raw = await readFile(join(MARKDOWN_DIR, filename), "utf8");
    await upsertSource(filename, raw, join(MARKDOWN_REL, filename));
  }
}

async function ingestSkills() {
  let files: string[] = [];
  try {
    files = (await readdir(SKILLS_DIR)).filter((f) =>
      f.toLowerCase().endsWith(".md"),
    );
  } catch {
    console.warn(`skills/ が見つかりません(スキルなしで続行)`);
    return;
  }

  for (const filename of files.sort()) {
    const path = join(SKILLS_DIR, filename);
    const raw = await readFile(path, "utf8");
    const fm = parseFrontmatter(raw);
    const name = fm.name ?? basename(filename, ".md");
    const description = fm.description ?? "";
    const hash = sha256(raw);

    await sql`
      INSERT INTO skills (name, description, rel_path, content, content_hash)
      VALUES (${name}, ${description}, ${join("skills", filename)}, ${raw}, ${hash})
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        rel_path = EXCLUDED.rel_path,
        content = EXCLUDED.content,
        content_hash = EXCLUDED.content_hash
    `;
    console.log(`* skill: ${name}`);
    // スキルは「ドキュメント」でもある → 検索・引用できるよう sources/chunks にも取り込む
    await upsertSource(filename, raw, join("skills", filename));
  }
}

async function main() {
  assertEnv();
  console.log("=== ingest start ===");
  await ingestSkills();
  await ingestSources();

  const [{ s }] = await sql<{ s: number }[]>`SELECT count(*)::int s FROM sources`;
  const [{ c }] = await sql<{ c: number }[]>`SELECT count(*)::int c FROM chunks`;
  const [{ k }] = await sql<{ k: number }[]>`SELECT count(*)::int k FROM skills`;
  console.log(`=== done: ${s} sources, ${c} chunks, ${k} skills ===`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
