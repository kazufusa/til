import { GoogleGenAI } from "@google/genai";
import type { Image } from "./types";

const GEMINI_OK_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const PROMPT =
  "この画像の内容を日本語で簡潔に説明してください。グラフや図表であれば種別と読み取れる要素も含めてください。装飾的なアイコン等の場合はその旨を短く述べてください。1〜3文で。";

const CONCURRENCY = 8;

export async function describeImages(
  images: Image[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (images.length === 0) return out;

  const project = process.env.GOOGLE_VERTEX_PROJECT;
  const location = process.env.GOOGLE_VERTEX_LOCATION;
  const model = process.env.GOOGLE_VERTEX_MODEL;
  if (!project || !location || !model) {
    throw new Error(
      "GOOGLE_VERTEX_PROJECT / GOOGLE_VERTEX_LOCATION / GOOGLE_VERTEX_MODEL must be set in .env",
    );
  }
  const ai = new GoogleGenAI({ vertexai: true, project, location });

  // Partition first so unsupported MIMEs don't burn quota.
  const skipped: Image[] = [];
  const callable: Image[] = [];
  for (const img of images) {
    (GEMINI_OK_MIME.has(img.mimeType) ? callable : skipped).push(img);
  }
  for (const img of skipped) {
    out.set(img.id, `(未対応の画像形式: ${img.mimeType})`);
  }

  // Bounded parallelism: simple chunked Promise.all.
  for (let i = 0; i < callable.length; i += CONCURRENCY) {
    const chunk = callable.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((img) =>
        ai.models
          .generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  { text: PROMPT },
                  { inlineData: { mimeType: img.mimeType, data: img.base64 } },
                ],
              },
            ],
          })
          .then((res) => res.text?.trim() ?? "(画像説明を取得できませんでした)"),
      ),
    );
    chunk.forEach((img, idx) => out.set(img.id, results[idx]!));
  }
  return out;
}
