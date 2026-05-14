import { GoogleGenAI } from "@google/genai";
import { officeToPdf } from "./libreoffice";
import type { Format, Image } from "./types";

// Single Gemini round-trip: render the office file to PDF via LibreOffice,
// hand the PDF straight to Gemini, and treat the LLM's response as the final
// markdown. Image content is described in-line by Gemini itself, so the
// returned `images` array is always empty (no separate image-description
// pass downstream).
//
// Pros: one tool sees the whole document at once — handles tables, headings,
//       embedded images, formulas, multi-column layout etc. without us having
//       to wire each up.
// Cons: depends on LibreOffice; non-deterministic (LLM re-writes the document
//       each call); cost scales with document length, not image count.
export async function runGeminiPdf(
  inputPath: string,
  _format: Format,
): Promise<{
  markdown: string;
  images: Image[];
  cleanup: () => Promise<void>;
}> {
  const project = process.env.GOOGLE_VERTEX_PROJECT;
  const location = process.env.GOOGLE_VERTEX_LOCATION;
  const model = process.env.GOOGLE_VERTEX_MODEL;
  if (!project || !location || !model) {
    throw new Error(
      "GOOGLE_VERTEX_PROJECT / GOOGLE_VERTEX_LOCATION / GOOGLE_VERTEX_MODEL must be set in .env",
    );
  }

  const { pdfBuffer, cleanup } = await officeToPdf(inputPath);
  const ai = new GoogleGenAI({ vertexai: true, project, location });

  // Minimal task-level prompt: no fixture-specific instructions, no failure-
  // mode patches. Matches the policy used by scripts/screenshot-to-md.ts.
  const prompt = `渡された PDF の内容を GitHub Flavored Markdown に変換してください。

- スクリーンショット/紙面上の空間的配置 (行・列の並び、上下左右の関係) を保つこと
- 表形式のデータは GFM テーブル (\`| ... |\`) で表現する
- 文書内に含まれる画像・グラフ・図は、それが置かれている位置に短い要約 (1〜2文) を本文中に挿入する
- 見て取れない情報は推測で書かない
- 出力は Markdown 本文のみ。コードフェンスや前置き/後置きの解説は付けない`;

  const res = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBuffer.toString("base64"),
            },
          },
        ],
      },
    ],
  });

  return {
    markdown: res.text?.trim() ?? "(Gemini returned no text)",
    images: [],
    cleanup,
  };
}
