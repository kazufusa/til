import type { Image } from "./types";

// Images don't survive into the output — only their Gemini captions do.
// Block-context images become a standalone blockquote line; inline-context
// images (xlsx cells) become a flat label so the surrounding GFM table row
// stays intact.
//
// Each Image carries a unique `marker` sentinel that was placed in the
// markdown earlier (by lib/pandoc.ts for docx/pptx image refs, by
// lib/xlsx.ts for xlsx anchored images). We swap the sentinel for the
// caption via plain String.prototype.replaceAll — no regex needed since
// markers are chosen to be unique literal strings.
export function injectImageDescriptions(
  markdown: string,
  images: Image[],
  descriptions: Map<string, string>,
): string {
  let out = markdown;
  for (const img of images) {
    const desc = descriptions.get(img.id) ?? "(画像説明なし)";
    const oneLine = collapseWhitespaceWithNewlines(desc);
    const replacement =
      img.context === "inline"
        ? `**[画像]** ${oneLine}`
        : `\n\n> **[画像]** ${oneLine}\n\n`;
    out = out.replaceAll(img.marker, replacement);
  }
  return collapseBlankRuns(out);
}

// Collapse any run of whitespace that contains at least one newline into a
// single ASCII space. Plain whitespace runs (no newline) are left alone so
// captions like "foo  bar" don't lose intentional spacing.
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

// Collapse 3+ consecutive newlines into exactly two. Each pass strictly
// reduces the count of "\n\n\n" so the loop terminates.
function collapseBlankRuns(s: string): string {
  while (s.includes("\n\n\n")) s = s.replaceAll("\n\n\n", "\n\n");
  return s;
}

// space, tab, LF, VT, FF, CR.
function isWs(code: number): boolean {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d);
}
