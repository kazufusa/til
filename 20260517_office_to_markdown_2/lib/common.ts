import { mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import JSZip from "jszip";
import type { Format, Image } from "./types";

export const FORMAT_MAIN_PART: Record<Format, string> = {
  docx: "word/document.xml",
  xlsx: "xl/workbook.xml",
  pptx: "ppt/presentation.xml",
};

export function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "png") return "image/png";
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "gif") return "image/gif";
  if (e === "webp") return "image/webp";
  if (e === "bmp") return "image/bmp";
  if (e === "emf" || e === "wmf") return "image/x-emf";
  return "application/octet-stream";
}

export function formatFromExt(path: string): Format | null {
  const ext = extname(path).toLowerCase();
  if (ext === ".docx") return "docx";
  if (ext === ".xlsx") return "xlsx";
  if (ext === ".pptx") return "pptx";
  return null;
}

export async function validateAndDetectFormat(path: string): Promise<Format> {
  const format = formatFromExt(path);
  if (!format) {
    throw new Error(
      `unsupported input extension for ${path} — expected .docx / .xlsx / .pptx`,
    );
  }
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`input file not found: ${path}`);

  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip =
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04;
  if (!isZip) throw new Error(`${path} doesn't look like an OOXML zip file`);

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const mainPart = FORMAT_MAIN_PART[format];
  if (!zip.file(mainPart)) {
    throw new Error(`${path} is missing ${mainPart} — extension/content mismatch`);
  }
  return format;
}

// Standard image placeholder used in expected.md. Block context = standalone
// blockquote; inline = bare span suitable for table cells.
export function imagePlaceholder(
  filename: string,
  context: "block" | "inline" = "block",
): string {
  const span = `**[画像]** (画像: ${filename})`;
  return context === "block" ? `> ${span}` : span;
}

// Replace `**[画像]** (画像: FILENAME)` markers with the LLM-formatted caption.
//
// Two cases distinguished by surrounding context:
//   - block:  `> **[画像]** (画像: NAME)` on its own line. If the caption
//             contains a newline (kind=='table' returns "summary\n\n<gfm>"),
//             the first line goes inside the blockquote and the rest is
//             emitted as a sibling block after a blank line.
//   - inline: `**[画像]** (画像: NAME)` inside a GFM cell. The caption is
//             flattened (newline-containing whitespace runs → single space)
//             so the table row stays on one logical line.
export function injectImageDescriptions(
  markdown: string,
  descriptions: Map<string, string>,
): string {
  // Block first — anchored to line start with the `> ` prefix.
  // [ \t]*$ NOT \s*$ because \s matches \n, which would eat the trailing
  // newline and collapse the blank line separating this block from the next.
  let out = markdown.replace(
    /^> \*\*\[画像\]\*\* \(画像: ([^)]+)\)[ \t]*$/gm,
    (_match, filename: string) => {
      const desc = descriptions.get(filename) ?? "(画像説明なし)";
      return blockReplacement(desc);
    },
  );
  // Inline — any remaining placeholder is inside a table cell or similar.
  out = out.replace(
    /\*\*\[画像\]\*\* \(画像: ([^)]+)\)/g,
    (_match, filename: string) => {
      const desc = descriptions.get(filename) ?? "(画像説明なし)";
      return `**[画像]** ${collapseWhitespaceWithNewlines(desc)}`;
    },
  );
  return collapseBlankRuns(out);
}

function blockReplacement(desc: string): string {
  const trimmed = desc.trim();
  const nl = trimmed.indexOf("\n");
  if (nl === -1) return `> **[画像]** ${trimmed}`;
  const first = trimmed.slice(0, nl);
  const rest = trimmed.slice(nl + 1).trim();
  return `> **[画像]** ${first}\n\n${rest}`;
}

function collapseWhitespaceWithNewlines(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (isWs(s.charCodeAt(i))) {
      let j = i;
      let sawNl = false;
      while (j < s.length && isWs(s.charCodeAt(j))) {
        if (s.charCodeAt(j) === 10) sawNl = true;
        j++;
      }
      out += sawNl ? " " : s.slice(i, j);
      i = j;
    } else {
      out += s[i]!;
      i++;
    }
  }
  return out;
}

function collapseBlankRuns(s: string): string {
  while (s.includes("\n\n\n")) s = s.replaceAll("\n\n\n", "\n\n");
  return s;
}

function isWs(code: number): boolean {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d);
}

export async function writeImagesToDisk(
  images: Image[],
  outDir: string,
): Promise<void> {
  if (images.length === 0) return;
  await mkdir(outDir, { recursive: true });
  const seen = new Set<string>();
  for (const img of images) {
    if (seen.has(img.filename)) continue;
    seen.add(img.filename);
    await Bun.write(
      join(outDir, img.filename),
      Buffer.from(img.base64, "base64"),
    );
  }
}
