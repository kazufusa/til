import JSZip from "jszip";
import ExcelJS from "exceljs";
import { runPandoc } from "../pandoc";
import { runOfficeparser } from "../officeparser";
import { runGeminiPdf } from "../gemini-pdf";
import { runMarkitdown } from "../markitdown";
import { runPandocWasm } from "../pandoc-wasm";
import { escapeForToken, escapeRegex, mimeFromExt } from "../common";
import type { Backend, Image } from "../types";

// xlsx-specific pandoc backend. pandoc itself doesn't extract xlsx images at
// all, so we recover them ourselves (drawing-anchor + rich-data "Image in
// cell"), then splice them into the pandoc output so each image lands near
// the cell it came from instead of in a tail appendix.
const pandocXlsx: Backend = {
  name: "pandoc",
  supports: ["xlsx"],
  async convert(inputPath, format) {
    const r = await runPandoc(inputPath, format);
    const anchored = await readXlsxAnchoredImages(inputPath);
    const spliced = spliceXlsxImagesIntoSheets(r.markdown, r.images, anchored);
    return {
      markdown: spliced.markdown,
      images: spliced.images,
      cleanup: r.cleanup,
    };
  },
};

const officeparserXlsx: Backend = {
  name: "officeparser",
  supports: ["xlsx"],
  async convert(inputPath, format) {
    return runOfficeparser(inputPath, format);
  },
};

const geminiPdfXlsx: Backend = {
  name: "gemini-pdf",
  supports: ["xlsx"],
  async convert(inputPath, format) {
    return runGeminiPdf(inputPath, format);
  },
};

const markitdownXlsx: Backend = {
  name: "markitdown",
  supports: ["xlsx"],
  async convert(inputPath, format) {
    return runMarkitdown(inputPath, format);
  },
};

// pandoc-wasm + the same xlsx anchor splice the CLI version uses, so behavior
// matches `pandoc` backend except no external pandoc binary is needed.
const pandocWasmXlsx: Backend = {
  name: "pandoc-wasm",
  supports: ["xlsx"],
  async convert(inputPath, format) {
    const r = await runPandocWasm(inputPath, format);
    const anchored = await readXlsxAnchoredImages(inputPath);
    const spliced = spliceXlsxImagesIntoSheets(r.markdown, r.images, anchored);
    return { markdown: spliced.markdown, images: spliced.images };
  },
};

export const XLSX_BACKENDS: readonly Backend[] = [
  pandocXlsx,
  pandocWasmXlsx,
  officeparserXlsx,
  geminiPdfXlsx,
  markitdownXlsx,
];

// ---------- Anchor extraction ----------

type XlsxAnchoredImage = {
  sheet: string;
  cell: string;           // A1-style anchor
  filename: string;       // e.g. "image1.png"
  mimeType: string;
  base64: string;
  // "drawing" = old-school anchor (chart/picture float). Its anchor cell is
  //   usually outside the data range; we place its description right after
  //   the sub-table that contains the anchor row, or at the section bottom
  //   if it sits past the data range entirely.
  // "cell"    = new Excel "Image in cell" / IMAGE() rich-data image. The
  //   anchor IS the cell — pandoc shows it as `#VALUE!`, which we replace
  //   in-place with the description.
  anchorKind: "drawing" | "cell";
};

function colLetter(col: number): string {
  let s = "";
  let c = col + 1;
  while (c > 0) {
    s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

function parseA1(addr: string): { col: number; row: number } {
  const m = addr.match(/^([A-Z]+)(\d+)$/);
  if (!m) return { col: 0, row: 0 };
  let col = 0;
  for (let i = 0; i < m[1]!.length; i++) col = col * 26 + (m[1]!.charCodeAt(i) - 64);
  return { col, row: parseInt(m[2]!, 10) };
}

async function readXlsxAnchoredImages(
  inputPath: string,
): Promise<XlsxAnchoredImage[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inputPath);
  const out: XlsxAnchoredImage[] = [];

  // (1) Drawing-anchored images (classic xl/drawings/*).
  let nameCounter = 0;
  for (const ws of wb.worksheets) {
    const anchored = ws.getImages?.() ?? [];
    for (const a of anchored) {
      const m: any = wb.model.media.find(
        (x: any) => String(x.index) === String(a.imageId),
      );
      if (!m) continue;
      const ext = (m.extension as string) || "png";
      const filename = `image${++nameCounter}.${ext}`;
      const col = a.range?.tl?.nativeCol ?? 0;
      const row = a.range?.tl?.nativeRow ?? 0;
      out.push({
        sheet: ws.name,
        cell: `${colLetter(col)}${row + 1}`,
        filename,
        mimeType: mimeFromExt("." + ext),
        base64: Buffer.from(m.buffer).toString("base64"),
        anchorKind: "drawing",
      });
    }
  }

  // (2) "Image in cell" / IMAGE() rich-data images. exceljs doesn't surface
  //     these (yet), so parse the OOXML rich-data layer directly.
  const bytes = await Bun.file(inputPath).arrayBuffer();
  const zip = await JSZip.loadAsync(bytes);
  const cellImages = await readXlsxRichDataImages(
    zip,
    (idx) => wb.worksheets[idx]?.name ?? `Sheet${idx + 1}`,
  );
  out.push(...cellImages);

  return out;
}

// "Image in cell" / IMAGE() embeds images via xl/richData/* + xl/metadata.xml.
// Chain: cell <c r="A2" … vm="N"> → metadata.valueMetadata[N-1].rc.v=X
//        → rdrichvalue.rv[X].v=Y → richValueRel.rel[Y].r:id=rIdK
//        → _rels/richValueRel.xml.rels rIdK → image file path.
async function readXlsxRichDataImages(
  zip: JSZip,
  sheetName: (idx: number) => string,
): Promise<XlsxAnchoredImage[]> {
  const text = async (p: string) => {
    const f = zip.file(p);
    return f ? f.async("text") : null;
  };

  const relsXml = await text("xl/richData/_rels/richValueRel.xml.rels");
  const richRelXml = await text("xl/richData/richValueRel.xml");
  const rdXml = await text("xl/richData/rdrichvalue.xml");
  const mdXml = await text("xl/metadata.xml");
  if (!relsXml || !richRelXml || !rdXml || !mdXml) return [];

  const relMap = new Map<string, string>();
  for (const m of relsXml.matchAll(
    /<Relationship\s+Id="(rId\d+)"[^>]*Target="([^"]+)"/g,
  )) {
    if (!/image/i.test(m[0])) continue;
    relMap.set(m[1]!, m[2]!.replace(/^\.\.\//, "xl/"));
  }

  const richRelIdx: string[] = [];
  for (const m of richRelXml.matchAll(/<rel\s+r:id="(rId\d+)"\/>/g)) {
    richRelIdx.push(m[1]!);
  }

  const rdRichValue: number[] = [];
  for (const m of rdXml.matchAll(/<rv\b[^>]*>([\s\S]*?)<\/rv>/g)) {
    const inner = m[1]!;
    const v = inner.match(/<v>(\d+)<\/v>/);
    rdRichValue.push(v ? parseInt(v[1]!, 10) : -1);
  }

  const vmBlock =
    mdXml.match(/<valueMetadata\b[\s\S]*?<\/valueMetadata>/)?.[0] ?? "";
  const vmToRv: number[] = [];
  for (const m of vmBlock.matchAll(/<rc\b[^>]*\sv="(\d+)"/g)) {
    vmToRv.push(parseInt(m[1]!, 10));
  }

  const sheetFiles = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();
  const out: XlsxAnchoredImage[] = [];
  for (let i = 0; i < sheetFiles.length; i++) {
    const sheetXml = await text(sheetFiles[i]!);
    if (!sheetXml) continue;
    for (const m of sheetXml.matchAll(
      /<c\b[^>]*\br="([A-Z]+\d+)"[^>]*\bvm="(\d+)"[^>]*\/?>/g,
    )) {
      const cell = m[1]!;
      const vmIdx = parseInt(m[2]!, 10) - 1; // OOXML vm is 1-based
      const rvIdx = vmToRv[vmIdx];
      if (rvIdx == null) continue;
      const relIdx = rdRichValue[rvIdx];
      if (relIdx == null || relIdx < 0) continue;
      const rId = richRelIdx[relIdx];
      if (!rId) continue;
      const imgPath = relMap.get(rId);
      if (!imgPath) continue;
      const imgFile = zip.file(imgPath);
      if (!imgFile) continue;
      const buf = await imgFile.async("uint8array");
      const filename = imgPath.split("/").pop()!;
      out.push({
        sheet: sheetName(i),
        cell,
        filename,
        mimeType: mimeFromExt("." + (filename.split(".").pop() ?? "")),
        base64: Buffer.from(buf).toString("base64"),
        anchorKind: "cell",
      });
    }
  }
  return out;
}

// ---------- Splice into pandoc output ----------

function spliceXlsxImagesIntoSheets(
  markdown: string,
  existingImages: Image[],
  anchored: XlsxAnchoredImage[],
): { markdown: string; images: Image[] } {
  if (anchored.length === 0) return { markdown, images: existingImages };

  const bySheet = new Map<string, XlsxAnchoredImage[]>();
  for (const a of anchored) {
    if (!bySheet.has(a.sheet)) bySheet.set(a.sheet, []);
    bySheet.get(a.sheet)!.push(a);
  }

  const allImages: Image[] = [...existingImages];
  const placeholderFor = (im: XlsxAnchoredImage) => {
    const id = `${im.sheet}!${im.cell}!${im.filename}`;
    const placeholder = `<<IMG_XLSX_${escapeForToken(id)}>>`;
    allImages.push({
      id,
      pattern: new RegExp(escapeRegex(placeholder), "g"),
      mimeType: im.mimeType,
      base64: im.base64,
      context: im.anchorKind === "cell" ? "inline" : "block",
      filename: im.filename,
    });
    return placeholder;
  };

  const sections = markdown.split(/(?=^## )/m);
  const seenSheets = new Set<string>();
  const orphans: string[] = [];

  const rebuilt = sections.map((sec) => {
    const head = sec.match(/^## (.+?)\s*$/m);
    if (!head) return sec;
    const sheetName = head[1]!.trim();
    seenSheets.add(sheetName);
    const imgs = bySheet.get(sheetName) ?? [];
    if (imgs.length === 0) return sec;

    let section = sec;
    const drawing = imgs.filter((i) => i.anchorKind === "drawing");
    const cell = imgs.filter((i) => i.anchorKind === "cell");

    // (a) Cell-anchored images: drop the placeholder INTO the matching table
    //     cell. Also overwrites the `#VALUE!` artefact pandoc emits for
    //     IMAGE() formula cells.
    for (const im of cell) {
      const { col, row } = parseA1(im.cell);
      const ph = placeholderFor(im);
      const replaced = setMarkdownTableCell(section, row, col, ph);
      if (replaced !== null) section = replaced;
      else orphans.push(ph);
    }

    // (b) Split the table at empty rows, and inject each drawing-anchored
    //     image's placeholder right after the sub-table whose row range
    //     contains the image's anchor row. So a pie chart anchored at C2
    //     ends up right after the 区分/個人/法人/その他 sub-table, not at
    //     the very bottom of the section.
    const drawingPhsByRow = new Map<number, string[]>();
    for (const im of drawing) {
      const { row } = parseA1(im.cell);
      if (row <= 0) continue;
      if (!drawingPhsByRow.has(row)) drawingPhsByRow.set(row, []);
      drawingPhsByRow.get(row)!.push(placeholderFor(im));
    }
    section = splitTableAtEmptyRows(section, drawingPhsByRow);
    return section;
  });

  for (const [sheet, imgs] of bySheet) {
    if (seenSheets.has(sheet)) continue;
    for (const im of imgs) orphans.push(placeholderFor(im));
  }
  let result = rebuilt.join("");
  if (orphans.length) {
    result +=
      "\n\n---\n\n## 画像一覧 (位置特定不可)\n\n" + orphans.join("\n\n") + "\n";
  }
  return { markdown: result, images: allImages };
}

// Replace the (col, row) cell in the first GFM table of `section`. Returns
// the modified section, or null if the table doesn't reach that row.
function setMarkdownTableCell(
  section: string,
  xlsxRow: number,
  xlsxCol: number,
  replacement: string,
): string | null {
  const lines = section.split("\n");
  let tableStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|/.test(lines[i]!) && /^[\s|\-:]+$/.test(lines[i + 1] ?? "")) {
      tableStart = i;
      break;
    }
  }
  if (tableStart < 0) return null;
  // xlsx row N (1-indexed, row 1 = header). After header + separator the
  // first data line corresponds to xlsx row 2 → line index tableStart + 2.
  const target = tableStart + 2 + (xlsxRow - 2);
  if (target < 0 || target >= lines.length) return null;
  const line = lines[target]!;
  if (!line.startsWith("|")) return null;
  const parts = line.split("|"); // ['', ' cell1 ', ..., '']
  if (xlsxCol < 1 || xlsxCol > parts.length - 2) return null;
  parts[xlsxCol] = ` ${replacement} `;
  lines[target] = parts.join("|");
  return lines.join("\n");
}

// Split the first GFM table in `section` at every all-empty data row. Each
// chunk is emitted as its own GFM table. Drawing-anchored placeholders are
// dropped right after the chunk whose xlsx-row range contains the anchor row.
function splitTableAtEmptyRows(
  section: string,
  injectAfterXlsxRow: Map<number, string[]>,
): string {
  const lines = section.split("\n");
  const isTableRow = (s: string) => /^\|/.test(s);
  const isSeparator = (s: string) => /^\|[\s|\-:]+\|?\s*$/.test(s);
  const isEmptyRow = (s: string) =>
    isTableRow(s) && s.split("|").slice(1, -1).every((c) => c.trim() === "");

  let tStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isTableRow(lines[i]!) && isSeparator(lines[i + 1] ?? "")) {
      tStart = i;
      break;
    }
  }
  if (tStart < 0) return section;
  let tEnd = tStart + 2;
  while (tEnd < lines.length && isTableRow(lines[tEnd]!)) tEnd++;

  const header = lines[tStart]!;
  const data = lines.slice(tStart + 2, tEnd);

  // Bucket data rows into chunks while tracking each chunk's xlsx-row range.
  type Chunk = { rows: string[]; fromRow: number; toRow: number };
  const chunks: Chunk[] = [];
  let cursor: Chunk | null = null;
  data.forEach((row, idx) => {
    const xlsxRow = idx + 2; // first data row is xlsx row 2 (row 1 = header)
    if (isEmptyRow(row)) {
      if (cursor) {
        chunks.push(cursor);
        cursor = null;
      }
      return;
    }
    if (!cursor) cursor = { rows: [], fromRow: xlsxRow, toRow: xlsxRow };
    cursor.rows.push(row);
    cursor.toRow = xlsxRow;
  });
  if (cursor) chunks.push(cursor);
  if (chunks.length === 0) return section;

  const consumed = new Set<number>();
  const out: string[] = [];

  // For each chunk: emit it, then drop in any drawing-anchored placeholders
  // whose anchor row falls inside (or before, for chunk 0) the chunk's range.
  // Chunk 0 also absorbs anchors that sit BEFORE the data range (header row).
  chunks.forEach((chunk, idx) => {
    const isFirst = idx === 0;
    if (isFirst) {
      out.push(...emitGfmTable(header, chunk.rows));
    } else {
      out.push("", ...emitGfmTable(chunk.rows[0]!, chunk.rows.slice(1)));
    }
    for (const [row, phs] of injectAfterXlsxRow) {
      if (consumed.has(row)) continue;
      const inRange = row >= chunk.fromRow && row <= chunk.toRow;
      const beforeFirst = isFirst && row < chunk.fromRow;
      if (inRange || beforeFirst) {
        out.push("", ...phs);
        consumed.add(row);
      }
    }
  });

  // Anchors past the last chunk's range go at the bottom.
  for (const [row, phs] of injectAfterXlsxRow) {
    if (consumed.has(row)) continue;
    out.push("", ...phs);
    consumed.add(row);
  }

  return [...lines.slice(0, tStart), ...out, ...lines.slice(tEnd)].join("\n");
}

function emitGfmTable(headerLine: string, dataLines: string[]): string[] {
  const split = (l: string) => l.split("|").slice(1, -1).map((c) => c.trim());
  const headerCells = split(headerLine);
  const dataCells = dataLines.map(split);
  const keep = headerCells.map(
    (h, i) => h !== "" || dataCells.some((r) => (r[i] ?? "") !== ""),
  );
  const row = (cells: string[]) =>
    "| " + cells.filter((_, i) => keep[i]).join(" | ") + " |";
  const sep = "| " + keep.filter(Boolean).map(() => "---").join(" | ") + " |";
  return [row(headerCells), sep, ...dataCells.map(row)];
}
