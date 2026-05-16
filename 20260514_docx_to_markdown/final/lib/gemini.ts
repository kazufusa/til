import { GoogleGenAI, Type } from "@google/genai";
import type { Schema } from "@google/genai";
import type { Image } from "./types";

const GEMINI_OK_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const PROMPT = "添付の画像を解析し、schema に従って結果を返してください。";

// Structured response. `kind === "table"` populates `table`; all other kinds
// rely on `summary` alone. The model is forced into this shape by
// `responseMimeType: "application/json"` + `responseSchema`, so the caller
// never has to strip fences or guess the layout.
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    kind: {
      type: Type.STRING,
      enum: ["table", "summary", "decorative"],
      description:
        "table=表の画像、summary=グラフ/図/写真/イラスト等の通常画像、decorative=装飾アイコン等",
    },
    summary: {
      type: Type.STRING,
      description: "画像の日本語要約。1〜3文。",
    },
    table: {
      type: Type.OBJECT,
      nullable: true,
      description: "kind=='table' のときだけ設定する。それ以外では null。",
      properties: {
        headers: { type: Type.ARRAY, items: { type: Type.STRING } },
        rows: {
          type: Type.ARRAY,
          items: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
  },
  required: ["kind", "summary"],
};

export type DescribeResult = {
  kind: "table" | "summary" | "decorative";
  summary: string;
  table?: { headers: string[]; rows: string[][] } | null;
};

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

  const skipped: Image[] = [];
  const callable: Image[] = [];
  for (const img of images) {
    (GEMINI_OK_MIME.has(img.mimeType) ? callable : skipped).push(img);
  }
  for (const img of skipped) {
    out.set(img.id, `(未対応の画像形式: ${img.mimeType})`);
  }

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
            config: {
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
            },
          })
          .then((res) => parseAndFormat(res.text)),
      ),
    );
    chunk.forEach((img, idx) => out.set(img.id, results[idx]!));
  }
  return out;
}

function parseAndFormat(text: string | undefined): string {
  if (!text) return "(画像説明を取得できませんでした)";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text.trim();
  }
  if (!isDescribeResult(parsed)) return text.trim();
  return formatDescription(parsed);
}

export function formatDescription(r: DescribeResult): string {
  const summary = (r.summary ?? "").trim();
  if (r.kind === "table" && r.table && r.table.headers.length > 0) {
    const table = renderGfmTable(r.table.headers, r.table.rows ?? []);
    return summary ? `${summary}\n\n${table}` : table;
  }
  return summary;
}

function renderGfmTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`);
  return [header, sep, ...body].join("\n");
}

function isDescribeResult(v: unknown): v is DescribeResult {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    (o.kind === "table" || o.kind === "summary" || o.kind === "decorative") &&
    typeof o.summary === "string"
  );
}

export const __testing = { parseAndFormat };
