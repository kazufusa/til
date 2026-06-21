import { assertEnv } from "@/lib/env";
import { runSearchAgent, streamAnswer } from "@/lib/agents";

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
        for await (const part of partialObjectStream) {
          send({ type: "answer", value: part });
        }
        send({ type: "done" });
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
