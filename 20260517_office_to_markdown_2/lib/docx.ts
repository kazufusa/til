import mammoth from "mammoth";
import TurndownService from "turndown";
// @ts-expect-error — no types for turndown-plugin-gfm
import { gfm } from "turndown-plugin-gfm";
import JSZip from "jszip";
import { imagePlaceholder, mimeFromExt } from "./common";
import type { Conversion, Image } from "./types";

// docx → markdown via mammoth(HTML) → turndown(GFM tables).
//
// Strategy: produce HTML that already has the structural cues we need
// (headings, lists, tables, image placeholders), then let turndown convert
// to markdown. Images are routed through a placeholder that survives the
// HTML→MD conversion intact and is replaced with the
// `> **[画像]** (画像: NAME.ext)` blockquote at the end.
export async function convertDocx(inputPath: string): Promise<Conversion> {
  const bytes = await Bun.file(inputPath).arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Pull original media filenames out of the zip so the markdown references
  // match what was actually inside the .docx (image1.png, image3.jpeg, ...).
  // mammoth doesn't expose the original path, so we match by content bytes.
  const zip = await JSZip.loadAsync(bytes);
  const mediaByHash = new Map<string, { filename: string; mimeType: string }>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!path.startsWith("word/media/") || entry.dir) continue;
    const filename = path.slice("word/media/".length);
    const buf = await entry.async("uint8array");
    const ext = "." + (filename.split(".").pop() ?? "");
    mediaByHash.set(hashBytes(buf), {
      filename,
      mimeType: mimeFromExt(ext),
    });
  }

  const images: Image[] = [];
  const seenFilenames = new Set<string>();

  // Tag caption-styled paragraphs with a marker class. Caption paragraphs that
  // FOLLOW an image are promoted to h3 (figcaption) in HTML post-processing;
  // captions that don't are left as plain body text. This avoids fabricating
  // structure where the source meant body text (e.g. table captions).
  const styleMap = [
    "p[style-name='caption'] => p.figcap:fresh",
    "p[style-name='Caption'] => p.figcap:fresh",
    "p[style-name='図表番号'] => p.figcap:fresh",
  ];

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap,
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read("base64");
        const bytes = Buffer.from(base64, "base64");
        const hash = hashBytes(new Uint8Array(bytes));
        const matched = mediaByHash.get(hash);
        const filename = matched?.filename ?? fallbackName(image.contentType, images.length);
        if (!seenFilenames.has(filename)) {
          seenFilenames.add(filename);
          images.push({
            filename,
            mimeType: matched?.mimeType ?? image.contentType,
            base64,
          });
        }
        // Emit a marker that turndown will leave alone (no img conversion).
        return { src: `imgph:${filename}`, alt: "" };
      }),
    },
  );

  const html = preprocessHtml(result.value);

  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });
  td.use(gfm);

  // 2-space indent for nested lists (turndown defaults to 4) — match expected.
  td.addRule("listItem2sp", {
    filter: "li",
    replacement: (content, node) => {
      content = content
        .replace(/^\n+/, "")
        .replace(/\n+$/, "\n")
        .replace(/\n/g, "\n  ");
      const parent = node.parentNode as Element | null;
      let prefix = "- ";
      if (parent && parent.nodeName === "OL") {
        const start = parent.getAttribute("start");
        const idx = Array.prototype.indexOf.call(parent.children, node);
        const n = (start ? Number(start) : 1) + idx;
        prefix = `${n}. `;
      }
      return (
        prefix +
        content +
        (node.nextSibling && !/\n$/.test(content) ? "\n" : "")
      );
    },
  });

  // Replace <img src="imgph:NAME"> with the placeholder blockquote.
  td.addRule("imagePlaceholder", {
    filter: (node) => {
      return (
        node.nodeName === "IMG" &&
        (node.getAttribute("src") ?? "").startsWith("imgph:")
      );
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const filename = (el.getAttribute("src") ?? "").slice("imgph:".length);
      return "\n\n" + imagePlaceholder(filename, "block") + "\n\n";
    },
  });

  const markdown = td.turndown(html);

  return {
    markdown: markdown.replace(/\n{3,}/g, "\n\n").trim() + "\n",
    images,
    notes: result.messages.map((m) => `[mammoth] ${m.type}: ${m.message}`),
  };
}

function hashBytes(b: Uint8Array): string {
  return String(Bun.hash(b));
}

function fallbackName(contentType: string, idx: number): string {
  const ext = (contentType.split("/")[1] ?? "bin").replace(/\+xml$/, "");
  return `image${idx + 1}.${ext}`;
}

// HTML adjustments needed before turndown:
//   (a) Tables: turndown-plugin-gfm only emits markdown tables when there's a
//       proper header row. mammoth emits <table><tr><td>...</tr> with no
//       <thead>. Inject an empty <thead> matching column count.
//   (b) <p> inside <td> breaks gfm cell rendering (double newlines collapse the
//       row). Unwrap them.
//   (c) Figure captions: in docx, the caption paragraph follows the drawing,
//       but the expected.md (pandoc-style) places caption BEFORE the image.
//       Swap a <p>...<img>...</p> followed by <hN> if the next sibling looks
//       like a caption heading.
function preprocessHtml(html: string): string {
  let out = html;

  // (b) <p> directly inside <td>/<th> — unwrap.
  out = out.replace(
    /<(t[dh])([^>]*)>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/\1>/g,
    "<$1$2>$3</$1>",
  );
  // multi-<p> cells: flatten with <br>
  out = out.replace(
    /<(t[dh])([^>]*)>([\s\S]*?)<\/\1>/g,
    (_m, tag: string, attrs: string, inner: string) => {
      const paras = inner.match(/<p[^>]*>([\s\S]*?)<\/p>/g);
      if (paras && paras.length > 0) {
        const cleaned = paras
          .map((p) => p.replace(/^<p[^>]*>/, "").replace(/<\/p>$/, ""))
          .join("<br>");
        return `<${tag}${attrs}>${cleaned}</${tag}>`;
      }
      return `<${tag}${attrs}>${inner}</${tag}>`;
    },
  );

  // (a) Add empty <thead> to tables that don't have one. The first <tr> stays
  //     as data; an empty row is prepended as the header so gfm renders it
  //     with the pandoc-style empty header bar.
  out = out.replace(/<table([^>]*)>([\s\S]*?)<\/table>/g, (m, attrs: string, body: string) => {
    if (/<thead\b/.test(body)) return m;
    // count cols from first <tr>
    const firstTr = body.match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
    if (!firstTr) return m;
    const cells = firstTr[1]!.match(/<t[dh]\b/g);
    const colCount = cells ? cells.length : 1;
    const emptyHead =
      "<thead><tr>" +
      "<th></th>".repeat(colCount) +
      "</tr></thead>";
    return `<table${attrs}>${emptyHead}<tbody>${body}</tbody></table>`;
  });

  // (c) Figure caption handling: `<p class="figcap">` paragraphs that come
  //     immediately AFTER an image-only paragraph are figure captions. Promote
  //     them to a heading and move them BEFORE the image. Caption level is
  //     `(last heading level seen) + 1` — pandoc-style nesting. Captions not
  //     following an image (e.g. table captions written before a table) keep
  //     their <p class="figcap"> form and become plain text below.
  out = stateRewrite(out);
  out = out.replace(/<p class="figcap"([^>]*)>/g, "<p$1>");

  return out;
}

function stateRewrite(html: string): string {
  let lastHL = 1;
  // Three alternatives, evaluated in order:
  //   1. plain <hN>...</hN>                       — track last heading level
  //   2. <p><img></p> immediately followed by figcap — image-then-caption
  //   3. figcap immediately followed by <p><img></p> — caption-then-image
  //
  // Either way, caption emits at (lastHL + 1) BEFORE the image.
  const imgPara = `<p[^>]*>\\s*<img\\b[^>]*\\bsrc="imgph:[^"]+"[^>]*\\/?>\\s*<\\/p>`;
  // tempered non-greedy: match any char *except* the start of </p>. Plain
  // `[\\s\\S]*?` backtracks past </p> when the outer alternative fails — a
  // figcap followed by a table would then absorb the entire table.
  const figcap = `<p class="figcap"[^>]*>((?:(?!<\\/p>)[\\s\\S])*)<\\/p>`;
  const re = new RegExp(
    `(<h([1-6])[^>]*>[\\s\\S]*?<\\/h\\2>)|` +
      `(${imgPara})\\s*${figcap}|` +
      `${figcap}\\s*(${imgPara})`,
    "g",
  );

  return html.replace(re, (
    _match,
    hMatch: string | undefined,
    hLvl: string | undefined,
    imgFirst: string | undefined,
    capAfterImg: string | undefined,
    capBeforeImg: string | undefined,
    imgAfterCap: string | undefined,
  ) => {
    if (hMatch) {
      lastHL = parseInt(hLvl!, 10);
      return hMatch;
    }
    const lvl = Math.min(6, lastHL + 1);
    if (imgFirst) {
      return `<h${lvl}>${capAfterImg}</h${lvl}>${imgFirst}`;
    }
    return `<h${lvl}>${capBeforeImg}</h${lvl}>${imgAfterCap}`;
  });
}
