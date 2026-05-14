import { $ } from "bun";
import type { Format, Image } from "./types";

// Microsoft MarkItDown (https://github.com/microsoft/markitdown) is a Python
// CLI that converts a range of office formats (docx / xlsx / pptx / pdf /
// images / html / …) to Markdown in one shot. We just shell out to it.
//
// MarkItDown doesn't extract images to disk — it describes/embeds them in
// the markdown text, so the returned `images` array is empty (no separate
// image-description pass).
export async function runMarkitdown(
  inputPath: string,
  _format: Format,
): Promise<{ markdown: string; images: Image[] }> {
  await ensureMarkitdownAvailable();
  try {
    const out = await $`markitdown ${inputPath}`.text();
    return { markdown: out, images: [] };
  } catch (err: any) {
    throw new Error(
      `markitdown failed on ${inputPath}: ${err?.stderr ?? err?.message ?? err}`,
    );
  }
}

let mdCheck: Promise<void> | null = null;
function ensureMarkitdownAvailable(): Promise<void> {
  if (mdCheck) return mdCheck;
  mdCheck = (async () => {
    try {
      await $`markitdown --help`.quiet();
    } catch {
      throw new Error(
        "markitdown CLI not found on PATH. The markitdown backend needs " +
          "Microsoft's MarkItDown Python package. In Docker: " +
          "`pip install markitdown[all]`. Locally: `pipx install markitdown[all]`.",
      );
    }
  })();
  return mdCheck;
}
