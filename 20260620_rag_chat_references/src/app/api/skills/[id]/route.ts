import { getSkillContent } from "@/lib/retrieval";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const sk = await getSkillContent(Number(id));
  if (!sk) return Response.json({ error: "not found" }, { status: 404 });

  if (new URL(req.url).searchParams.get("download") === "1") {
    const name = sk.rel_path.split("/").pop() ?? `${sk.name}.md`;
    return new Response(sk.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
      },
    });
  }
  return Response.json(sk);
}
