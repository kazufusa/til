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

  if (source.format === "xlsx") return { markdown, images: [] };

  // For docx/pptx, walk word/media/* or ppt/media/* and match each entry to
  // the in-output `<img src="…">` / `![](…)` reference pandoc-wasm emitted.
  const prefix = MEDIA_PREFIX[source.format];
  const mediaEntries = Object.entries(source.zip.files).filter(
    ([name, entry]) => name.startsWith(prefix) && !entry.dir,
  );
  const images: Image[] = [];
  for (const [name, entry] of mediaEntries) {
    const filename = name.slice(prefix.length);
    const resolved = await resolveMediaRef(source.format, filename, markdown, entry);
    if (!resolved) continue;
    const escaped = escapeRegex(resolved.refPath);
    // Alt text may legitimately contain `\[` or `\]` (pandoc escapes literal
    // brackets when the alt comes from a Word path like `…\\[1\\].png`). So
    // the inner-alt class must skip backslash-escaped chars: `(?:\\.|[^\]])*`.
    images.push({
      id: filename,
      pattern: new RegExp(
        `!\\[(?:\\\\.|[^\\]])*\\]\\(${escaped}[^)]*\\)|<img\\b[^>]*\\bsrc="${escaped}"[^>]*/?>`,
        "g",
      ),
      mimeType: mimeFromFilename(filename),
      base64: Buffer.from(resolved.buf).toString("base64"),
      filename,
    });
  }
  return { markdown, images };
}

// Resolve one media zip entry to the path pandoc-wasm actually emitted in
// the markdown:
//   pptx → always `ppt/media/<filename>` (verbatim entry name).
//   docx → pandoc-wasm preserves the entry filename when it's a normal name
//          (`image1.png`) and substitutes a content sha1 when the filename
//          already looks hash-like, so we try the literal first then sha1.
// Returns null when neither candidate appears in the markdown.
async function resolveMediaRef(
  format: "docx" | "pptx",
  filename: string,
  markdown: string,
  entry: { async: (kind: "uint8array") => Promise<Uint8Array> },
): Promise<{ refPath: string; buf: Uint8Array } | null> {
  if (format === "pptx") {
    const refPath = `ppt/media/${filename}`;
    return markdown.includes(refPath)
      ? { refPath, buf: await entry.async("uint8array") }
      : null;
  }
  const literal = `media/${filename}`;
  if (markdown.includes(literal)) {
    return { refPath: literal, buf: await entry.async("uint8array") };
  }
  const buf = await entry.async("uint8array");
  const sha = `media/${createHash("sha1").update(buf).digest("hex")}${extname(filename)}`;
  return markdown.includes(sha) ? { refPath: sha, buf } : null;
}
