import { getSourceContent } from "@/lib/retrieval";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const src = await getSourceContent(Number(id));
  if (!src) return Response.json({ error: "not found" }, { status: 404 });

  // ?download=1 で markdown ファイルとしてダウンロード
  if (new URL(req.url).searchParams.get("download") === "1") {
    return new Response(src.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          src.filename,
        )}"`,
      },
    });
  }
  return Response.json(src);
}
