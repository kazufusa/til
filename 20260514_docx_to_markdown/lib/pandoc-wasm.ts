import { convert } from "pandoc-wasm";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { MEDIA_PREFIX, escapeRegex, mimeFromExt } from "./common";
import type { Format, Image } from "./types";

// In-process pandoc: uses the official pandoc.wasm build (bundled by the
// `pandoc-wasm` npm package, no external binary required, runs on Bun via
// its native WASM support).
//
// Quirks vs the CLI runner:
//   - `--extract-media` does NOT surface the extracted bytes through the JS
//     API in pandoc-wasm v1.0.1, and trying to use a nested path triggers a
//     virtual-FS error ("createDirectory: inappropriate type"). So we run
//     pandoc WITHOUT extract-media, then reopen the OOXML zip ourselves and
//     match the <img src> references back to the originals:
//       * docx: pandoc emits `./media/<sha1>.<ext>`; sha1 the bytes of each
//         word/media/* to find the match.
//       * pptx: pandoc emits `ppt/media/<original-name>`; the name in the zip
//         matches verbatim.
//       * xlsx: pandoc-wasm doesn't reference xlsx media at all (same as the
//         CLI). xlsx-specific anchor splice runs on top in lib/convert/xlsx.ts.
export async function runPandocWasm(
  inputPath: string,
  format: Format,
): Promise<{
  markdown: string;
  images: Image[];
  cleanup: () => Promise<void>;
}> {
  const bytes = await Bun.file(inputPath).arrayBuffer();
  const result = await convert(
    {
      from: format,
      to: "gfm",
      wrap: "none",
      "input-files": [`input.${format}`],
    },
    null,
    { [`input.${format}`]: new Blob([bytes]) },
  );
  let markdown = result.stdout ?? "";
  if (result.stderr) {
    console.warn(`[pandoc-wasm] ${result.stderr.trim()}`);
  }

  const images: Image[] = [];
  if (format === "docx" || format === "pptx") {
    const zip = await JSZip.loadAsync(bytes);
    const prefix = MEDIA_PREFIX[format];
    const mediaEntries = Object.entries(zip.files).filter(
      ([name, entry]) => name.startsWith(prefix) && !entry.dir,
    );
    for (const [name, entry] of mediaEntries) {
      const buf = await entry.async("uint8array");
      const ext = extname(name);
      const filename = name.slice(prefix.length);
      // pandoc-wasm emits `<img src="media/<sha1>.<ext>">` for docx (no ./
      // prefix) and `![](ppt/media/<original-name>)` for pptx.
      const refPath =
        format === "docx"
          ? `media/${createHash("sha1").update(buf).digest("hex")}${ext}`
          : `ppt/media/${filename}`;
      if (!markdown.includes(refPath)) continue;
      const escaped = escapeRegex(refPath);
      images.push({
        id: filename,
        pattern: new RegExp(
          `!\\[[^\\]]*\\]\\(${escaped}[^)]*\\)|<img\\b[^>]*\\bsrc="${escaped}"[^>]*/?>`,
          "g",
        ),
        mimeType: mimeFromExt(ext),
        base64: Buffer.from(buf).toString("base64"),
        filename,
      });
    }
  }

  return { markdown, images, cleanup: async () => {} };
}
