import { assertEnv } from "@/lib/env";
import { runSearchAgent, streamAnswer } from "@/lib/agents";
import { saveAnswerDocument, type SaveRef } from "@/lib/documents";

export const runtime = "nodejs";
export const maxDuration = 120;

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
  const question = body?.question;
  if (typeof question !== "string" || !question.trim()) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }
  // 深掘り用: 前回の検索セッションID(あれば復元して追加検索)
  const priorSessionId =
    typeof body?.sessionId === "string" ? body.sessionId : null;

  // エージェンティック検索(スキル自動実行 + セッション深掘り)
  const result = await runSearchAgent(question, priorSessionId);

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) =>
        controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));

      // lookup: 検索で拾った全チャンク + 実行スキル + 検索セッションID(深掘り継続用)
      send({
        type: "lookup",
        sessionId: result.sessionId,
        chunks: result.chunks.map((c) => ({
          id: c.id,
          source_id: c.source_id,
          filename: c.filename,
          title: c.title,
          heading_path: c.heading_path,
          heading_text: c.heading_text,
          block_type: c.block_type,
          char_start: c.char_start,
          char_end: c.char_end,
          snippet: c.content.slice(0, 200),
        })),
        skills: result.skills.map((s) => ({
          id: s.id,
          name: s.name,
          rel_path: s.rel_path,
        })),
      });

      try {
        const { partialObjectStream } = streamAnswer(question, result);
        let last: unknown = {};
        for await (const part of partialObjectStream) {
          last = part;
          send({ type: "answer", value: part });
        }
        send({ type: "done" });

        // チャットで「保存して」と頼まれたら、回答を出典つき markdown として保存
        if (/(保存|セーブ)して/.test(question)) {
          const rawBlocks =
            (last as { blocks?: unknown[] })?.blocks?.filter(Boolean) ?? [];
          const blocks = rawBlocks.map((b) => {
            const bb = b as { text?: string; citations?: number[] };
            return {
              text: typeof bb.text === "string" ? bb.text : "",
              citations: (bb.citations ?? []).filter(
                (c): c is number => typeof c === "number",
              ),
            };
          });
          const byId = new Map(result.chunks.map((c) => [c.id, c]));
          const cited = new Set<number>();
          for (const b of blocks)
            for (const c of b.citations) cited.add(c);
          const refs: SaveRef[] = [...cited]
            .map((id) => byId.get(id))
            .filter((c): c is NonNullable<typeof c> => !!c)
            .map((c) => ({
              id: c.id,
              source_id: c.source_id,
              filename: c.filename,
              heading_path: c.heading_path,
              block_type: c.block_type,
              char_start: c.char_start,
              char_end: c.char_end,
              snippet: c.content.slice(0, 200),
            }));
          const saved = await saveAnswerDocument(
            question,
            blocks,
            refs,
            new Date().toISOString(),
          );
          send({ type: "saved", ...saved });
        }
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
