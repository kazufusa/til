import { basename } from "node:path";
import { validateAndDetectFormat, writeImagesToDisk } from "./lib/common";
import { convertDocx } from "./lib/docx";
import { convertXlsx } from "./lib/xlsx";
import { convertPptx } from "./lib/pptx";
import type { Conversion, Format } from "./lib/types";

const USAGE = `Usage: bun run convert.ts <input.{docx,xlsx,pptx}> [output.md]`;

async function dispatch(input: string, format: Format): Promise<Conversion> {
  if (format === "docx") return convertDocx(input);
  if (format === "xlsx") return convertXlsx(input);
  if (format === "pptx") return convertPptx(input);
  throw new Error(`format ${format} not implemented yet`);
}

async function main() {
  const [input, outputArg] = process.argv.slice(2);
  if (!input) {
    console.error(USAGE);
    process.exit(1);
  }

  const format = await validateAndDetectFormat(input);
  const output = outputArg ?? `${input}.md`;

  console.log(`[1/2] ${format} → markdown: ${input}`);
  const conv = await dispatch(input, format);
  for (const n of conv.notes ?? []) console.warn(`      ${n}`);

  console.log(`[2/2] write images + markdown to ${output}`);
  const mediaDirAbs = output + ".media";
  await writeImagesToDisk(conv.images, mediaDirAbs);
  await Bun.write(output, conv.markdown);

  console.log(
    `done. ${conv.markdown.length} chars, ${conv.images.length} image(s) → ${output}`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
