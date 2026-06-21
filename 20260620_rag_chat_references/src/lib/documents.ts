import { createHash, randomUUID } from "node:crypto";
import { sql, toVectorLiteral } from "./db";
import { chunkMarkdown } from "./chunk";
import { embedDocuments } from "./embed";

// チャット回答を「出典が再現できる」markdown 構造で保存する。
//  - frontmatter + 本文(各ブロック末尾に脚注 [^cN])+ ## 出典(脚注定義)
//  - 出典定義に src:id / chars:cs-ce / 引用スニペットを埋め込み、表示しても読めて
//    アプリ再読込時に元ソースの該当箇所へ復元できる
//  - 保存後 sources+chunks へ取込み、他の markdown と同様に検索対象になる

export type SaveBlock = { text?: string; citations?: number[] };
export type SaveRef = {
  id: number;
  source_id: number;
  filename: string;
  heading_path: string[];
  block_type?: string;
  char_start: number;
  char_end: number;
  snippet?: string;
};

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function titleFromQuestion(q: string): string {
  const t = q.replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 60) + "…" : t || "保存された回答";
}

export function buildSavedMarkdown(
  question: string,
  blocks: SaveBlock[],
  refs: SaveRef[],
  createdISO: string,
): string {
  const byId = new Map(refs.map((r) => [r.id, r]));
  // 本文中に登場した順で出典番号を振る
  const order: number[] = [];
  for (const b of blocks)
    for (const c of b.citations ?? [])
      if (byId.has(c) && !order.includes(c)) order.push(c);

  const fm = [
    "---",
    "type: saved-answer",
    `question: ${JSON.stringify(question)}`,
    `created: ${createdISO}`,
    "---",
    "",
  ].join("\n");

  // 出典をクリック可能なリンクにする。href の #src-<id>-<cs>-<ce> を
  // アプリ側が解釈して元ソースの該当箇所へジャンプする(rendered 表示で飛べる)。
  const refLink = (r: SaveRef) => {
    const section = r.heading_path.join(" > ") || "(本文)";
    return `[${r.filename} › ${section}](#src-${r.source_id}-${r.char_start}-${r.char_end})`;
  };

  // 各ブロック直下に出典リンクを可視表示(ブロック→元データが見える・飛べる)
  const body = blocks
    .map((b) => {
      const cites = (b.citations ?? [])
        .filter((c) => byId.has(c))
        .map((c) => byId.get(c)!);
      const cap = cites.length
        ? `\n\n*↳ 出典: ${cites.map(refLink).join(" / ")}*`
        : "";
      return `${b.text ?? ""}${cap}`;
    })
    .join("\n\n");

  // 巻末に引用元と原文スニペット(ソースリファレンスを保持・再現)
  const sources =
    order.length === 0
      ? ""
      : "\n\n## 出典(引用元)\n\n" +
        order
          .map((c) => {
            const r = byId.get(c)!;
            const snip = (r.snippet ?? "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 160);
            return `- ${refLink(r)}${snip ? ` — 「${snip}」` : ""}`;
          })
          .join("\n");

  return `${fm}# ${titleFromQuestion(question)}\n\n${body}${sources}\n`;
}

// markdown を1ソースとして取込(チャンク化→埋め込み→DB)。検索対象になる。
// blockData(構造化データ)があれば併せて保存する(表示の正)。
async function ingestSourceContent(
  filename: string,
  title: string,
  relPath: string,
  content: string,
  blockData: unknown = null,
): Promise<number> {
  const hash = sha256(content);
  await sql`DELETE FROM sources WHERE filename = ${filename}`;
  const [{ id: sourceId }] = await sql<{ id: number }[]>`
    INSERT INTO sources (filename, title, rel_path, byte_size, content, content_hash, block_data)
    VALUES (${filename}, ${title}, ${relPath}, ${Buffer.byteLength(content, "utf8")}, ${content}, ${hash},
            ${blockData == null ? null : sql.json(blockData as never)})
    RETURNING id
  `;
  const chunks = chunkMarkdown(content);
  const B = 50;
  for (let i = 0; i < chunks.length; i += B) {
    const batch = chunks.slice(i, i + B);
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
  }
  return sourceId;
}

export async function saveAnswerDocument(
  question: string,
  blocks: SaveBlock[],
  refs: SaveRef[],
  createdISO: string,
): Promise<{ id: number; filename: string }> {
  const md = buildSavedMarkdown(question, blocks, refs, createdISO);
  const filename = `saved-${randomUUID().slice(0, 8)}.md`;
  // 表示の正となる構造化データ。markdown(content)は DL/検索用の派生物。
  const blockData = { question, created: createdISO, blocks, refs };
  const id = await ingestSourceContent(
    filename,
    titleFromQuestion(question),
    `saved/${filename}`,
    md,
    blockData,
  );
  return { id, filename };
}
