import { listSkills } from "@/lib/retrieval";

export const runtime = "nodejs";

// 投入済みスキル(skill.md)の一覧
export async function GET() {
  const skills = await listSkills();
  return Response.json({ skills });
}
