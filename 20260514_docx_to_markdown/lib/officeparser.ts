import { parseOffice } from "officeparser";
import JSZip from "jszip";
import { escapeRegex, mimeFromExt, MEDIA_PREFIX } from "./common";
import type { Format, Image } from "./types";

// officeparser extracts text only and discards images. We supplement that by
// reading the zip's media folder directly and appending each image as a
// placeholder under a "## 画像一覧" appendix (positions are lost — that's
// the inherent limitation of officeparser).
export async function runOfficeparser(
  inputPath: string,
  format: Format,
): Promise<{ markdown: string; images: Image[]; notes: string[] }> {
  const parsed: any = await parseOffice(inputPath);
  const text: string =
    typeof parsed?.toText === "function" ? parsed.toText() : String(parsed);

  const { tail, images, count } = await liftMediaFromZip(
    inputPath,
    MEDIA_PREFIX[format],
    "officeparser はテキスト抽出のみで位置情報を持たないため末尾に集約",
  );

  return {
    markdown: text + tail,
    images,
    notes: [
      `officeparser is text-only; ${count} image(s) lifted from ${MEDIA_PREFIX[format]} and appended at the bottom`,
    ],
  };
}

// Open an OOXML zip, lift every entry under `prefix` into Image[] + a markdown
// appendix that drops a placeholder per image.
async function liftMediaFromZip(
  inputPath: string,
  prefix: string,
  reason: string,
): Promise<{ tail: string; images: Image[]; count: number }> {
  const bytes = await Bun.file(inputPath).arrayBuffer();
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.entries(zip.files).filter(
    ([name, entry]) => name.startsWith(prefix) && !entry.dir,
  );

  const lines: string[] = [];
  const images: Image[] = [];
  if (entries.length > 0) {
    lines.push("", "---", "", `## 画像一覧 (${reason})`, "");
  }
  for (const [name, entry] of entries) {
    const id = name.slice(prefix.length);
    const buf = await entry.async("uint8array");
    const placeholder = `<<IMG_${id}>>`;
    images.push({
      id,
      pattern: new RegExp(escapeRegex(placeholder), "g"),
      mimeType: mimeFromExt("." + (id.split(".").pop() ?? "")),
      base64: Buffer.from(buf).toString("base64"),
      filename: id,
    });
    lines.push(placeholder, "");
  }
  return { tail: lines.join("\n"), images, count: entries.length };
}
