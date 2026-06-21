import { searchFiles } from "@/lib/retrieval";

export const runtime = "nodejs";

// 登録済みソース(markdown)の一覧
export async function GET() {
  const sources = await searchFiles();
  return Response.json({ sources });
}
