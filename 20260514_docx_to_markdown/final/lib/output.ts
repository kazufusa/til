import type { Image } from "./types";

// Images don't survive into the output — only their Gemini captions do.
// Block-context images become a standalone blockquote line; inline-context
// images (xlsx cells) become a flat label so the surrounding GFM table row
// stays intact.
export function injectImageDescriptions(
  markdown: string,
  images: Image[],
  descriptions: Map<string, string>,
): string {
  let out = markdown;
  for (const img of images) {
    const desc = descriptions.get(img.id) ?? "(画像説明なし)";
    const oneLine = desc.replace(/\s*\n+\s*/g, " ");
    const replacement =
      img.context === "inline"
        ? `**[画像]** ${oneLine}`
        : `\n\n> **[画像]** ${oneLine}\n\n`;
    out = out.replace(img.pattern, replacement);
  }
  return out.replace(/\n{3,}/g, "\n\n");
}
