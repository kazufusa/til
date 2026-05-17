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
