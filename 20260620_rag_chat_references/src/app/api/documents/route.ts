import { assertEnv } from "@/lib/env";
import { saveAnswerDocument, type SaveBlock, type SaveRef } from "@/lib/documents";

export const runtime = "nodejs";
export const maxDuration = 120;

// チャット回答を出典つき markdown として保存(検索対象へ取込)
export async function POST(req: Request) {
  try {
    assertEnv();
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
  const body = await req.json().catch(() => ({}));
  const question: string = typeof body?.question === "string" ? body.question : "";
  const blocks: SaveBlock[] = Array.isArray(body?.blocks) ? body.blocks : [];
  const references: SaveRef[] = Array.isArray(body?.references)
    ? body.references
    : [];
  if (!blocks.length) {
    return Response.json({ error: "blocks is required" }, { status: 400 });
  }
  const saved = await saveAnswerDocument(
    question,
    blocks,
    references,
    new Date().toISOString(),
  );
  return Response.json(saved);
}
