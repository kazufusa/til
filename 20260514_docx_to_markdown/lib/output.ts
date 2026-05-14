import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Image } from "./types";

// Render each placeholder as standard markdown image syntax `![alt](src)`
// where `src` points at the extracted image on disk (so the .md actually
// renders with the picture) and `alt` carries the Gemini caption (so the
// description is preserved when the image fails / for screen readers / in
// the raw source).
export function injectImageDescriptions(
  markdown: string,
  images: Image[],
  descriptions: Map<string, string>,
  mediaRelativeDir: string,
): string {
  let out = markdown;
  for (const img of images) {
    const desc = descriptions.get(img.id) ?? "(画像説明なし)";
    const oneLineDesc = desc.replace(/\s*\n+\s*/g, " ");
    const altText = escapeAlt(oneLineDesc);
    const src = `${mediaRelativeDir}/${img.filename}`;
    const md = `![${altText}](${src})`;
    const replacement = img.context === "inline" ? md : `\n\n${md}\n\n`;
    out = out.replace(img.pattern, replacement);
  }
  return out.replace(/\n{3,}/g, "\n\n");
}

function escapeAlt(s: string): string {
  // alt text in `![alt](src)` can't contain `]` raw.
  return s.replace(/]/g, "\\]");
}

export async function writeImagesToDisk(
  images: Image[],
  outDir: string,
): Promise<void> {
  if (images.length === 0) return;
  await mkdir(outDir, { recursive: true });
  // Dedupe by filename — the same image can be referenced through multiple
  // anchor paths (e.g. xlsx rich-data + drawing both pointing at image1.jpeg).
  const seen = new Set<string>();
  for (const img of images) {
    if (seen.has(img.filename)) continue;
    seen.add(img.filename);
    await Bun.write(join(outDir, img.filename), Buffer.from(img.base64, "base64"));
  }
}
