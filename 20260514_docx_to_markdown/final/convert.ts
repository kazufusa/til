// office (.docx / .xlsx / .pptx) → markdown via pandoc-wasm + Gemini.
// CLI: bun run convert.ts [--no-llm] <input> [output.md]
//
// Image bytes are NOT written to disk. Each image is replaced with the
// Gemini-generated caption inline in the markdown, so the .md output is a
// single self-contained text file with no side-car directories.
//
// --no-llm: skip the Gemini call and substitute a fixed dummy caption.
//           Useful for debugging parser-side issues without burning API quota.

import { describeImages } from "./lib/gemini";
import { dummyDescribe, runPipeline } from "./lib/pipeline";

const USAGE = `Usage: bun run convert.ts [--no-llm] <input.{docx,xlsx,pptx}> [output.md]

Converts an Office Open XML file to GitHub-Flavored Markdown. Each embedded
image is replaced inline by a short Gemini-generated caption — the converter
writes no files other than the output markdown.

Options:
  --no-llm    Skip Gemini and use a dummy "(画像)" caption instead.
              Use this when iterating on parser/splice logic to avoid
              burning API quota.

Requires the following env vars (unless --no-llm is set; .env is auto-loaded):
  GOOGLE_VERTEX_PROJECT   GCP project id with Vertex AI enabled
  GOOGLE_VERTEX_LOCATION  e.g. "global"
  GOOGLE_VERTEX_MODEL     Gemini model id`;

type Args = { input: string; output: string; noLLM: boolean };
type ParseResult =
  | { kind: "help" }
  | { kind: "error"; message: string }
  | { kind: "ok"; args: Args };

function parseArgs(argv: string[]): ParseResult {
  let noLLM = false;
  const positional: string[] = [];
  for (const a of argv) {
    if (a === "-h" || a === "--help") return { kind: "help" };
    if (a === "--no-llm") noLLM = true;
    else if (a.startsWith("-"))
      return { kind: "error", message: `unknown option: ${a}` };
    else positional.push(a);
  }
  const [input, output] = positional;
  if (!input) return { kind: "error", message: "missing input file" };
  return {
    kind: "ok",
    args: { input, output: output ?? `${input}.md`, noLLM },
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.kind === "help") {
    console.log(USAGE);
    process.exit(0);
  }
  if (parsed.kind === "error") {
    console.error(`${parsed.message}\n\n${USAGE}`);
    process.exit(1);
  }
  const args = parsed.args;

  if (args.noLLM) {
    console.log(`converting ${args.input} → ${args.output} (--no-llm, dummy captions)`);
  } else {
    console.log(`converting ${args.input} → ${args.output} via Gemini (${process.env.GOOGLE_VERTEX_MODEL})`);
  }
  const finalMd = await runPipeline(
    args.input,
    args.noLLM ? dummyDescribe : describeImages,
  );
  await Bun.write(args.output, finalMd);
  console.log(`done. ${finalMd.length} chars written.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
