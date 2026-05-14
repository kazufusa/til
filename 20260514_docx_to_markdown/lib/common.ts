import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import JSZip from "jszip";
import type { Format } from "./types";

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escapeForToken(s: string): string {
  return s.replace(/[^A-Za-z0-9_.\-:]/g, "_");
}

export function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".gif") return "image/gif";
  if (e === ".webp") return "image/webp";
  if (e === ".bmp") return "image/bmp";
  if (e === ".emf" || e === ".wmf") return "image/x-emf"; // unsupported by Gemini
  return "application/octet-stream";
}

// Each office format stores embedded media under a different zip prefix.
export const MEDIA_PREFIX: Record<Format, string> = {
  docx: "word/media/",
  xlsx: "xl/media/",
  pptx: "ppt/media/",
};

// The canonical "main part" inside the OOXML zip. Used to validate the file
// matches its claimed format.
export const FORMAT_MAIN_PART: Record<Format, string> = {
  docx: "word/document.xml",
  xlsx: "xl/workbook.xml",
  pptx: "ppt/presentation.xml",
};

// Walk a directory recursively and return all file paths.
export async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function rec(dir: string) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e);
      const st = await stat(p);
      if (st.isDirectory()) await rec(p);
      else out.push(p);
    }
  }
  await rec(root);
  return out;
}

// Detect format from the file extension (no file IO).
export function formatFromExt(path: string): Format | null {
  const ext = extname(path).toLowerCase();
  if (ext === ".docx") return "docx";
  if (ext === ".xlsx") return "xlsx";
  if (ext === ".pptx") return "pptx";
  return null;
}

// Validate that `path` is a real OOXML file whose internal structure matches
// the format implied by its extension. Throws an explanatory Error otherwise.
// Returns the detected format.
//
// Checks performed:
//   1. extension is .docx / .xlsx / .pptx
//   2. file starts with the ZIP local-file-header magic ("PK\x03\x04")
//   3. the zip contains the canonical main part for that format
//      (word/document.xml for docx, etc.)
export async function validateAndDetectFormat(path: string): Promise<Format> {
  const format = formatFromExt(path);
  if (!format) {
    throw new Error(
      `unsupported input extension for ${path} — expected one of .docx / .xlsx / .pptx`,
    );
  }

  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`input file not found: ${path}`);
  }

  // Peek the first 4 bytes for the zip magic. ZIP files begin with the local
  // file header signature 0x504B0304 ("PK\x03\x04"). Empty zips can also be
  // 0x504B0506 ("PK\x05\x06") but Office files never look like that.
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip =
    head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (!isZip) {
    throw new Error(
      `${path} doesn't look like an OOXML (zip) file — first 4 bytes were ${[...head]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")}`,
    );
  }

  // Open the zip and verify the canonical main part exists. This catches
  // mismatches like "renamed .pptx as .docx".
  const bytes = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(bytes);
  const mainPart = FORMAT_MAIN_PART[format];
  if (!zip.file(mainPart)) {
    // Find what main part the zip actually has, so the error tells the user
    // what they probably meant.
    let actual: Format | null = null;
    for (const [fmt, part] of Object.entries(FORMAT_MAIN_PART)) {
      if (zip.file(part)) {
        actual = fmt as Format;
        break;
      }
    }
    throw new Error(
      `${path} has the ${format} extension but is missing ${mainPart}` +
        (actual ? ` — its content looks like ${actual} instead` : ""),
    );
  }

  return format;
}
