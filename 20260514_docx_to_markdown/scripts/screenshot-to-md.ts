// Ship a bunch of screenshot images to Gemini and ask it to produce a single
// markdown document for them — used as a "reference answer" (期待値/参考解答)
// to compare against our parser-based xlsx conversion.
//
// Usage:
//   bun run scripts/screenshot-to-md.ts <out.md> <img1> [img2] ...
//   bun run scripts/screenshot-to-md.ts fixtures/xlsx/sample.xlsx.expected.md \
//       fixtures/xlsx/sample.xlsx.1.png fixtures/xlsx/sample.xlsx.2.png

import { GoogleGenAI } from "@google/genai";
import { extname } from "node:path";

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  throw new Error(`unsupported image ext: ${ext}`);
}

const PROMPT = `渡されたスクリーンショットの内容を GitHub Flavored Markdown に変換してください。

- スクリーンショット上の空間的配置 (行・列の並び、上下左右の関係) を保つこと。スクリーンショット内で同じ行に並んでいるものは Markdown でも同じ行、同じ列にあるものは同じ列。
- 表形式のデータは GFM テーブル (\`| ... |\`) で表現する。
- 文書内に含まれる画像・グラフ・図は、それが置かれている位置に短い要約 (1〜2文) を本文中に挿入する。実在しない URL を作って placeholder にしない。
- 見て取れない情報 (画像から確実に読み取れないセル番地・行番号・色名など) は推測で書かない。
- 出力は Markdown 本文のみ。コードフェンスや前置き/後置きの解説は付けない。`;

async function main() {
  const [outPath, ...inputs] = process.argv.slice(2);
  if (!outPath || inputs.length === 0) {
    console.error(
      "usage: bun run scripts/screenshot-to-md.ts <out.md> <img1> [img2] ...",
    );
    process.exit(1);
  }

  const project = process.env.GOOGLE_VERTEX_PROJECT;
  const location = process.env.GOOGLE_VERTEX_LOCATION;
  const model = process.env.GOOGLE_VERTEX_MODEL;
  if (!project || !location || !model) {
    throw new Error("GOOGLE_VERTEX_* must be set in .env");
  }
  const ai = new GoogleGenAI({ vertexai: true, project, location });

  const parts: any[] = [{ text: PROMPT }];
  for (const path of inputs) {
    const data = Buffer.from(await Bun.file(path).arrayBuffer()).toString(
      "base64",
    );
    parts.push({
      inlineData: { mimeType: mimeFromExt(extname(path)), data },
    });
  }

  console.log(`asking ${model} with ${inputs.length} image(s)…`);
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
  });
  const md = res.text ?? "(no response)";
  await Bun.write(outPath, md);
  console.log(`wrote ${outPath} (${md.length} chars)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
