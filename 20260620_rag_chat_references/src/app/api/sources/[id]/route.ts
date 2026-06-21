import { getSourceContent } from "@/lib/retrieval";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const src = await getSourceContent(Number(id));
  if (!src) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(src);
}
