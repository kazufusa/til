import { getSkillContent } from "@/lib/retrieval";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const sk = await getSkillContent(Number(id));
  if (!sk) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(sk);
}
