// office (.docx / .xlsx / .pptx) → markdown via pandoc-wasm + Gemini.
// CLI: bun run convert.ts <input> [output.md]
//
// Image bytes are NOT written to disk. Each image is replaced with the
// Gemini-generated caption inline in the markdown, so the .md output is a
// single self-contained text file with no side-car directories.

import { loadSource } from "./lib/common";
import { runPandocWasm } from "./lib/pandoc";
import { spliceXlsxImages } from "./lib/xlsx";
import { describeImages } from "./lib/gemini";
import { injectImageDescriptions } from "./lib/output";

const USAGE = `Usage: bun run convert.ts <input.{docx,xlsx,pptx}> [output.md]

Converts an Office Open XML file to GitHub-Flavored Markdown. Each embedded
image is replaced inline by a short Gemini-generated caption — the converter
writes no files other than the output markdown.

Requires the following env vars (.env is auto-loaded by Bun):
  GOOGLE_VERTEX_PROJECT   GCP project id with Vertex AI enabled
  GOOGLE_VERTEX_LOCATION  e.g. "global"
  GOOGLE_VERTEX_MODEL     Gemini model id`;

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || input === "-h" || input === "--help") {
    console.log(USAGE);
    process.exit(input ? 0 : 1);
  }

  const source = await loadSource(input);
  const outPath = output ?? `${input}.md`;

  console.log(`[1/3] ${source.format} → markdown via pandoc-wasm: ${input}`);
  const pandoc = await runPandocWasm(source);
  const spliced =
    source.format === "xlsx" ? await spliceXlsxImages(pandoc.markdown, source) : null;
  const markdown = spliced?.markdown ?? pandoc.markdown;
  const images = spliced ? [...pandoc.images, ...spliced.images] : pandoc.images;
  console.log(`      ${markdown.length} chars, ${images.length} image(s)`);

  console.log(`[2/3] describe images via Gemini (${process.env.GOOGLE_VERTEX_MODEL})`);
  const descMap = await describeImages(images);

  console.log(`[3/3] inject captions, write ${outPath}`);
  const finalMd = injectImageDescriptions(markdown, images, descMap);
  await Bun.write(outPath, finalMd);

  console.log(`done. ${finalMd.length} chars written to ${outPath}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
