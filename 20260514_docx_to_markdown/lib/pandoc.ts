import { $ } from "bun";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { escapeRegex, mimeFromExt, walkFiles } from "./common";
import type { Format, Image } from "./types";

// Shared pandoc runner: convert `inputPath` (a docx/xlsx/pptx) to GFM markdown
// and harvest images that pandoc extracted into a temp directory. xlsx-format
// anchor handling lives in lib/convert/xlsx.ts and runs on top of this.
//
// Returns markdown + the Image entries pandoc actually inlined (with regex
// patterns that match those inlined references) + a cleanup callback to remove
// the temp media directory.
export async function runPandoc(
  inputPath: string,
  format: Format,
): Promise<{
  markdown: string;
  images: Image[];
  mediaDir: string;
  cleanup: () => Promise<void>;
}> {
  const mediaDir = join(
    "fixtures",
    ".media",
    basename(inputPath, "." + format) + "-" + Date.now(),
  );
  await mkdir(mediaDir, { recursive: true });
  const markdown =
    await $`pandoc --to=gfm --wrap=none --extract-media=${mediaDir} ${inputPath}`.text();

  const images: Image[] = [];
  const inlined = await walkFiles(mediaDir);
  for (const absPath of inlined) {
    if (!markdown.includes(absPath)) continue;
    const buf = await readFile(absPath);
    const escaped = escapeRegex(absPath);
    const filename = basename(absPath);
    images.push({
      id: filename,
      pattern: new RegExp(
        `!\\[[^\\]]*\\]\\(${escaped}[^)]*\\)|<img\\b[^>]*\\bsrc="${escaped}"[^>]*/?>`,
        "g",
      ),
      mimeType: mimeFromExt(extname(absPath)),
      base64: buf.toString("base64"),
      filename,
    });
  }

  return {
    markdown,
    images,
    mediaDir,
    cleanup: () => rm(mediaDir, { recursive: true, force: true }),
  };
}
