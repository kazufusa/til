import { convert } from "pandoc-wasm";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { Lexer, type Token, type Tokens } from "marked";
import { XMLParser } from "fast-xml-parser";
import { MEDIA_PREFIX, mimeFromFilename } from "./common";
import type { Image, Source } from "./types";

// Pandoc emits self-closing `<img/>` tags inside `<figure>` blocks, so the
// block parses cleanly as XML. We reuse fast-xml-parser to dig out the
// figcaption text rather than scanning characters by hand.
const figureXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
});

// In-process pandoc via pandoc.wasm. Returns markdown (with every image
// reference rewritten to a unique sentinel marker) plus the Image entries
// describing what each marker should expand to in the output stage.
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
//
// Ad-hoc figure handling: docx images with captions come through as
// `<figure><img …><figcaption><p>図 N text</p></figcaption></figure>` since
// GFM has no native figure syntax. We pull the figcaption text out and
// emit it as a markdown heading one level deeper than the surrounding
// section, so the caption survives as structured content instead of as a
// raw HTML tag that gets dropped along with the rest of the figure block.
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
  let markdown = result.stdout ?? "";

  if (source.format === "xlsx") return { markdown, images: [] };

  // Step 1: resolve each media zip entry to the path pandoc emitted in the
  // output. Index by refPath so the token walk can look them up.
  type Resolved = {
    filename: string;
    refPath: string;
    buf: Uint8Array;
    marker: string;
  };
  const prefix = MEDIA_PREFIX[source.format];
  const mediaEntries = Object.entries(source.zip.files).filter(
    ([name, entry]) => name.startsWith(prefix) && !entry.dir,
  );
  const byRefPath = new Map<string, Resolved>();
  let counter = 0;
  for (const [name, entry] of mediaEntries) {
    const filename = name.slice(prefix.length);
    const r = await resolveMediaRef(source.format, filename, markdown, entry);
    if (!r) continue;
    byRefPath.set(r.refPath, {
      filename,
      refPath: r.refPath,
      buf: r.buf,
      marker: `<<IMG_PANDOC_${counter++}>>`,
    });
  }
  if (byRefPath.size === 0) return { markdown, images: [] };

  // Step 2: single document-order walk. For each token that references one
  // of our refPaths, queue a (raw → replacement) edit. Headings update the
  // current depth so figcaptions land at depth+1.
  type Edit = { raw: string; replacement: string };
  const edits: Edit[] = [];
  const used = new Set<string>();
  let curDepth = 1;
  visitTokens(new Lexer().lex(markdown), (tok) => {
    if (tok.type === "heading") {
      curDepth = (tok as Tokens.Heading).depth;
      return;
    }
    if (tok.type === "image") {
      const r = byRefPath.get((tok as Tokens.Image).href);
      if (!r) return;
      edits.push({ raw: (tok as Tokens.Image).raw, replacement: r.marker });
      used.add(r.refPath);
    } else if (tok.type === "html") {
      const r = findRefInHtmlRaw((tok as Tokens.HTML).raw, byRefPath);
      if (!r) return;
      const caption = extractFigcaptionText((tok as Tokens.HTML).raw);
      if (caption) {
        const hashes = "#".repeat(Math.min(curDepth + 1, 6));
        edits.push({
          raw: (tok as Tokens.HTML).raw,
          // Heading goes ABOVE the image — it labels the section, the same
          // way every other markdown heading does. (Docx put figcaption
          // below the image; we restore the heading-before-content order.)
          // The html token's raw ends with `\n`; keep that so spacing into
          // the next block stays the same.
          replacement: `${hashes} ${caption}\n\n${r.marker}\n`,
        });
      } else {
        edits.push({ raw: (tok as Tokens.HTML).raw, replacement: r.marker });
      }
      used.add(r.refPath);
    }
  });

  // Step 3: apply edits, longest raw first. Plain `<img>` raw can be a
  // substring of a `<figure>` block's raw — replacing the smaller one
  // first would leave the larger raw permanently un-replaceable.
  edits.sort((a, b) => b.raw.length - a.raw.length);
  for (const e of edits) markdown = markdown.replaceAll(e.raw, e.replacement);

  const images: Image[] = [];
  for (const refPath of used) {
    const r = byRefPath.get(refPath)!;
    images.push({
      id: r.filename,
      marker: r.marker,
      mimeType: mimeFromFilename(r.filename),
      base64: Buffer.from(r.buf).toString("base64"),
      filename: r.filename,
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

// Scan a raw HTML block for the first `src="<refPath>"` substring that
// matches one of the known media refPaths. Returns the matching record so
// the caller can map the html token to its Image.
function findRefInHtmlRaw<T extends { refPath: string }>(
  html: string,
  byRefPath: Map<string, T>,
): T | null {
  for (const [refPath, rec] of byRefPath) {
    if (html.includes(`src="${refPath}"`)) return rec;
  }
  return null;
}

// Pull the text out of the first `<figcaption>` element in `html`, with
// nested inline HTML (`<p>`, `<strong>`, …) flattened to plain text.
// Returns null when the html block doesn't parse as a `<figure>` or has no
// figcaption. Parse errors are treated the same as "no caption".
function extractFigcaptionText(html: string): string | null {
  let parsed: any;
  try {
    parsed = figureXmlParser.parse(html);
  } catch {
    return null;
  }
  const figcaption = parsed?.figure?.figcaption;
  if (figcaption == null) return null;
  const text = collectText(figcaption).trim();
  return text.length ? text : null;
}

// Recursively concatenate every leaf text value under `node`, skipping
// attribute pseudo-keys (`@…`). Handles fast-xml-parser's mixed output
// shape: a leaf is a string/number, an element is an object, repeated
// children become arrays.
function collectText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (typeof node === "object") {
    let out = "";
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("@")) continue;
      out += collectText(v);
    }
    return out;
  }
  return "";
}

// Depth-first walk over every token marked produced — block, inline,
// table cells, list items — invoking `fn` on each.
function visitTokens(tokens: Token[], fn: (tok: Token) => void): void {
  for (const tok of tokens) {
    fn(tok);
    const t = tok as any;
    if (Array.isArray(t.tokens)) visitTokens(t.tokens as Token[], fn);
    if (Array.isArray(t.header)) {
      for (const cell of t.header) {
        if (Array.isArray(cell?.tokens)) visitTokens(cell.tokens as Token[], fn);
      }
    }
    if (Array.isArray(t.rows)) {
      for (const row of t.rows) {
        for (const cell of row) {
          if (Array.isArray(cell?.tokens)) visitTokens(cell.tokens as Token[], fn);
        }
      }
    }
    if (Array.isArray(t.items)) {
      for (const item of t.items) {
        if (Array.isArray(item?.tokens)) visitTokens(item.tokens as Token[], fn);
      }
    }
  }
}
