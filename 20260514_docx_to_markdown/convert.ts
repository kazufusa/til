import { basename } from "node:path";
import { validateAndDetectFormat } from "./lib/common";
import { describeImages } from "./lib/gemini";
import { injectImageDescriptions, writeImagesToDisk } from "./lib/output";
import { DOCX_BACKENDS } from "./lib/convert/docx";
import { XLSX_BACKENDS } from "./lib/convert/xlsx";
import { PPTX_BACKENDS } from "./lib/convert/pptx";
import type { Backend, Format } from "./lib/types";

const BACKENDS_BY_FORMAT: Record<Format, readonly Backend[]> = {
  docx: DOCX_BACKENDS,
  xlsx: XLSX_BACKENDS,
  pptx: PPTX_BACKENDS,
};

const USAGE = `Usage: bun run convert.ts [options] <input.{docx,xlsx,pptx}> [output.md]

Options:
  --backend=<name>   backend to use (default: pandoc)
  --list-backends    list available backends per format
  -h, --help         show this help

Backends:
  pandoc         CLI binary. docx / xlsx / pptx. Best output quality.
  mammoth-md     npm. docx only. Pure markdown but tables flatten.
  mammoth-html   npm. docx only. Tables preserved as inline <table>.
  officeparser   npm. docx / xlsx / pptx. Text only; images appended at end.`;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let backend = "pandoc";
  let listBackends = false;
  for (const a of argv) {
    if (a === "--list-backends" || a === "--list") {
      listBackends = true;
    } else if (a.startsWith("--backend=")) {
      backend = a.slice("--backend=".length);
    } else if (a === "-h" || a === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else {
      positional.push(a);
    }
  }
  return { backend, listBackends, input: positional[0], output: positional[1] };
}

function findBackend(name: string, format: Format): Backend | null {
  return BACKENDS_BY_FORMAT[format].find((b) => b.name === name) ?? null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.listBackends) {
    for (const [format, backends] of Object.entries(BACKENDS_BY_FORMAT)) {
      console.log(`${format}: ${backends.map((b) => b.name).join(", ")}`);
    }
    return;
  }

  if (!args.input) {
    console.error(USAGE);
    process.exit(1);
  }

  // Format validation up-front: extension, zip magic, OOXML main part. Errors
  // here are fatal (the rest of the pipeline assumes a valid OOXML file).
  const format = await validateAndDetectFormat(args.input);

  const backend = findBackend(args.backend, format);
  if (!backend) {
    const available = BACKENDS_BY_FORMAT[format].map((b) => b.name).join(", ");
    console.error(
      `backend "${args.backend}" isn't available for .${format}. options: ${available}`,
    );
    process.exit(1);
  }

  // Default output embeds both the source extension AND the backend name so
  // running multiple backends side-by-side produces distinct files instead of
  // overwriting each other:
  //   foo.docx --backend=pandoc      → foo.docx.pandoc.md
  //   foo.docx --backend=markitdown  → foo.docx.markitdown.md
  //   foo.xlsx --backend=pandoc      → foo.xlsx.pandoc.md
  const output = args.output ?? `${args.input}.${backend.name}.md`;

  console.log(`[1/3] ${format} → markdown via ${backend.name}: ${args.input}`);
  const conv = await backend.convert(args.input, format);
  for (const n of conv.notes ?? []) console.warn(`      ${n}`);
  console.log(
    `      ${conv.markdown.length} chars, ${conv.images.length} image(s)`,
  );

  console.log(`[2/3] describe images via Gemini (${process.env.GOOGLE_VERTEX_MODEL})`);
  const descMap = await describeImages(conv.images);

  console.log(`[3/3] write images + markdown to ${output}`);
  const mediaDirAbs = output + ".media";
  const mediaDirRel = basename(output) + ".media";
  await writeImagesToDisk(conv.images, mediaDirAbs);
  const finalMd = injectImageDescriptions(
    conv.markdown,
    conv.images,
    descMap,
    mediaDirRel,
  );
  await Bun.write(output, finalMd);
  await conv.cleanup?.();

  console.log(`done. ${finalMd.length} chars written to ${output}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
