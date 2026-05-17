import {
  injectImageDescriptions,
  validateAndDetectFormat,
  writeImagesToDisk,
} from "./lib/common";
import { convertDocx } from "./lib/docx";
import { convertXlsx } from "./lib/xlsx";
import { convertPptx } from "./lib/pptx";
import { describeImages } from "./lib/gemini";
import type { Conversion, Format } from "./lib/types";

const USAGE = `Usage: bun run convert.ts [--llm] <input.{docx,xlsx,pptx}> [output.md]

Options:
  --llm   run Gemini on each image and embed the description into the markdown
          (replaces \`**[画像]** (画像: NAME)\` with \`**[画像]** <description>\`).
          Requires GOOGLE_VERTEX_PROJECT / LOCATION / MODEL in .env.
`;

function parseArgs(argv: string[]) {
  let llm = false;
  const positional: string[] = [];
  for (const a of argv) {
    if (a === "--llm") llm = true;
    else if (a === "-h" || a === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else positional.push(a);
  }
  return { llm, input: positional[0], output: positional[1] };
}

async function dispatch(input: string, format: Format): Promise<Conversion> {
  if (format === "docx") return convertDocx(input);
  if (format === "xlsx") return convertXlsx(input);
  if (format === "pptx") return convertPptx(input);
  throw new Error(`format ${format} not implemented yet`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error(USAGE);
    process.exit(1);
  }

  const format = await validateAndDetectFormat(args.input);
  const output = args.output ?? `${args.input}.md`;
  const steps = args.llm ? 3 : 2;

  console.log(`[1/${steps}] ${format} → markdown: ${args.input}`);
  const conv = await dispatch(args.input, format);
  for (const n of conv.notes ?? []) console.warn(`      ${n}`);
  console.log(
    `        ${conv.markdown.length} chars, ${conv.images.length} image(s)`,
  );

  let finalMd = conv.markdown;
  if (args.llm) {
    console.log(
      `[2/${steps}] describe images via Gemini (${process.env.GOOGLE_VERTEX_MODEL})`,
    );
    const descMap = await describeImages(conv.images);
    finalMd = injectImageDescriptions(finalMd, descMap);
  }

  console.log(`[${steps}/${steps}] write images + markdown to ${output}`);
  const mediaDirAbs = output + ".media";
  await writeImagesToDisk(conv.images, mediaDirAbs);
  await Bun.write(output, finalMd);

  console.log(
    `done. ${finalMd.length} chars, ${conv.images.length} image(s) → ${output}`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
