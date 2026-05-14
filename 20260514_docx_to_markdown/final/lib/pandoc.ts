import { convert } from "pandoc-wasm";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { MEDIA_PREFIX, escapeRegex, mimeFromFilename } from "./common";
import type { Image, Source } from "./types";

// In-process pandoc via pandoc.wasm. Returns markdown + the Image entries
// referenced by the markdown's <img>/![](…) references.
//
// pandoc-wasm v1.0.1 quirks worth knowing:
//   - `--extract-media` doesn't surface bytes through the JS API. We skip
//     that flag and reopen the OOXML zip ourselves, mapping in-output
//     image references back to original bytes:
//       * docx: pandoc emits `<img src="media/<sha1>.<ext>">` → sha1 every
//         word/media/* until something matches.
//       * pptx: pandoc emits `![](ppt/media/<original-name>)` → the path
//         is literally the zip entry name.
//       * xlsx: pandoc-wasm doesn't reference xlsx media at all; the
//         caller adds xlsx anchor handling separately (lib/xlsx.ts).
export async function runPandocWasm(
  source: Source,
): Promise<{ markdown: string; images: Image[] }> {
  const inputName = `input.${source.format}`;
  const result = await convert(
    { from: source.format, to: "gfm", wrap: "none", "input-files": [inputName] },
    null,
    { [inputName]: new Blob([source.bytes]) },
  );
  if (result.stderr) console.warn(`[pandoc-wasm] ${result.stderr.trim()}`);
  const markdown = result.stdout ?? "";

  const images: Image[] = [];
  if (source.format === "docx" || source.format === "pptx") {
    const prefix = MEDIA_PREFIX[source.format];
    const mediaEntries = Object.entries(source.zip.files).filter(
      ([name, entry]) => name.startsWith(prefix) && !entry.dir,
    );
    for (const [name, entry] of mediaEntries) {
      const filename = name.slice(prefix.length);
      const ext = extname(filename);
      // pptx refs match the zip entry name verbatim, so we can filter
      // cheaply before paying for entry.async/sha1. For docx the ref is
      // sha1(bytes) so we must decode first.
      let refPath: string;
      let buf: Uint8Array;
      if (source.format === "pptx") {
        refPath = `ppt/media/${filename}`;
        if (!markdown.includes(refPath)) continue;
        buf = await entry.async("uint8array");
      } else {
        buf = await entry.async("uint8array");
        refPath = `media/${createHash("sha1").update(buf).digest("hex")}${ext}`;
        if (!markdown.includes(refPath)) continue;
      }
      const escaped = escapeRegex(refPath);
      images.push({
        id: filename,
        pattern: new RegExp(
          `!\\[[^\\]]*\\]\\(${escaped}[^)]*\\)|<img\\b[^>]*\\bsrc="${escaped}"[^>]*/?>`,
          "g",
        ),
        mimeType: mimeFromFilename(filename),
        base64: Buffer.from(buf).toString("base64"),
        filename,
      });
    }
  }
  return { markdown, images };
}
