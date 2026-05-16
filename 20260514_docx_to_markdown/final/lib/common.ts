import { extname } from "node:path";
import JSZip from "jszip";
import type { Format, Source } from "./types";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".emf": "image/x-emf",
  ".wmf": "image/x-emf",
};

export function mimeFromFilename(filename: string): string {
  return MIME_BY_EXT[extname(filename).toLowerCase()] ?? "application/octet-stream";
}

export const MEDIA_PREFIX: Record<Format, string> = {
  docx: "word/media/",
  xlsx: "xl/media/",
  pptx: "ppt/media/",
};

const MAIN_PART: Record<Format, string> = {
  docx: "word/document.xml",
  xlsx: "xl/workbook.xml",
  pptx: "ppt/presentation.xml",
};

// Read the input file once and parse the OOXML zip. Validates that the file's
// content actually matches the format implied by its extension (catches e.g.
// a .pptx renamed to .docx). Errors thrown here are fatal.
export async function loadSource(path: string): Promise<Source> {
  const ext = extname(path).toLowerCase();
  const format: Format | null =
    ext === ".docx" ? "docx" : ext === ".xlsx" ? "xlsx" : ext === ".pptx" ? "pptx" : null;
  if (!format) {
    throw new Error(
      `unsupported extension for ${path} — expected .docx / .xlsx / .pptx`,
    );
  }
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`input file not found: ${path}`);
  const bytes = await file.arrayBuffer();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err: any) {
    throw new Error(`${path} is not a valid OOXML/zip file: ${err?.message ?? err}`);
  }
  if (!zip.file(MAIN_PART[format])) {
    let actual: Format | null = null;
    for (const [fmt, part] of Object.entries(MAIN_PART)) {
      if (zip.file(part)) {
        actual = fmt as Format;
        break;
      }
    }
    throw new Error(
      `${path} has .${format} extension but is missing ${MAIN_PART[format]}` +
        (actual ? ` — content looks like .${actual} instead` : ""),
    );
  }
  return { path, format, bytes, zip };
}
