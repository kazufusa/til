// xlsx-specific post-processing on top of pandoc-wasm output.
//
// pandoc never references xlsx images. We recover them ourselves from two
// sources:
//   (1) drawing-anchored images (classic xl/drawings/* chart/picture float)
//       — exceljs reads each anchor's top-left cell for us.
//   (2) "Image in cell" / IMAGE() rich-data images (Excel 2022+). exceljs
//       doesn't surface these; we walk the OOXML rich-data layer ourselves:
//       cell `<c r="A2" … vm="N">` → metadata.valueMetadata[N-1].rc.v=X
//       → rdrichvalue.rv[X].v=Y → richValueRel.rel[Y].r:id=rIdK
//       → _rels/richValueRel.xml.rels rIdK → image file path.
//
// Then we splice the placeholders into the right place in pandoc's output:
//   - cell-anchored images go INTO the matching table cell (pandoc emitted
//     it as `#VALUE!`). Inline rendering, since blockquotes break GFM table
//     cells.
//   - drawing-anchored images go right AFTER the sub-table that contains
//     their anchor row. Sub-tables are created by splitting the GFM table
//     at all-empty data rows — that's how pandoc represents xlsx layouts
//     where blocks are vertically separated by blank rows.

import ExcelJS from "exceljs";
import colCache from "exceljs/lib/utils/col-cache.js";
import { escapeRegex, mimeFromFilename } from "./common";
import type { Image, Source } from "./types";

type AnchoredImage = {
  sheet: string;
  col: number; // 1-based
  row: number; // 1-based
  filename: string;
  mimeType: string;
  base64: string;
  anchorKind: "drawing" | "cell";
};

const a1 = (col: number, row: number) => `${colCache.n2l(col)}${row}`;

// Per-sheet top-left cell of the populated data range. Pandoc emits the GFM
// table starting from this cell — so a sheet whose used range is B2:C3 has
// its xlsx row 2 mapped to the markdown header line, and xlsx column B to the
// markdown's first column. Defaults to (1, 1) when no <dimension> is present.
type SheetOrigin = { row: number; col: number };
const DEFAULT_ORIGIN: SheetOrigin = { row: 1, col: 1 };

async function readAnchoredImages(
  source: Source,
): Promise<{ images: AnchoredImage[]; origins: Map<string, SheetOrigin> }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(source.bytes);
  const out: AnchoredImage[] = [];

  // (1) Drawing-anchored
  let counter = 0;
  for (const ws of wb.worksheets) {
    for (const a of ws.getImages?.() ?? []) {
      const m: any = wb.model.media.find(
        (x: any) => String(x.index) === String(a.imageId),
      );
      if (!m) continue;
      const ext = (m.extension as string) || "png";
      const col0 = a.range?.tl?.nativeCol ?? 0;
      const row0 = a.range?.tl?.nativeRow ?? 0;
      const col = col0 + 1;
      const row = row0 + 1;
      out.push({
        sheet: ws.name,
        col,
        row,
        filename: `image${++counter}.${ext}`,
        mimeType: mimeFromFilename(`x.${ext}`),
        base64: Buffer.from(m.buffer).toString("base64"),
        anchorKind: "drawing",
      });
    }
  }

  // (2) + (3) Walk sheets in workbook order, reading each sheet xml exactly
  //     once and extracting both the data-range origin and any rich-data
  //     cell-image references in one pass.
  const sheets = await readSheetXmls(source);
  const origins = new Map<string, SheetOrigin>();
  for (const s of sheets) origins.set(s.name, extractSheetOrigin(s.xml));
  out.push(...(await readRichDataCellImages(source, sheets)));
  return { images: out, origins };
}

// Walk `xl/workbook.xml` + `xl/_rels/workbook.xml.rels` to enumerate sheets
// in the workbook's intended order (NOT alphabetical filename order — Excel
// can save workbooks where rId2 → sheet5.xml). Reads each sheet xml once.
type SheetEntry = { name: string; path: string; xml: string };
async function readSheetXmls(source: Source): Promise<SheetEntry[]> {
  const text = (p: string) => source.zip.file(p)?.async("text");
  const [wbXml, relsXml] = await Promise.all([
    text("xl/workbook.xml"),
    text("xl/_rels/workbook.xml.rels"),
  ]);
  if (!wbXml || !relsXml) return [];

  const rels = new Map(parseRelationships(relsXml).map((r) => [r.rId, r.target]));
  const out: SheetEntry[] = [];
  for (const m of wbXml.matchAll(
    /<sheet\b[^>]*\bname=['"]([^'"]+)['"][^>]*\br:id=['"]([^'"]+)['"]/g,
  )) {
    const name = m[1]!;
    const target = rels.get(m[2]!);
    if (!target) continue;
    const path = resolveOoxmlPath("xl", target);
    const xml = await text(path);
    if (xml) out.push({ name, path, xml });
  }
  return out;
}

type Relationship = { rId: string; type: string; target: string };

function parseRelationships(relsXml: string): Relationship[] {
  const out: Relationship[] = [];
  // `[^>]*?` lazy-matches the attribute list up to `>`, leaving the optional
  // self-closing `/` outside the capture so attribute values containing `/`
  // (e.g. Type URIs) are preserved.
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const attrs = m[1]!;
    const rId = attrs.match(/\bId=['"]([^'"]+)['"]/)?.[1];
    const target = attrs.match(/\bTarget=['"]([^'"]+)['"]/)?.[1];
    const type = attrs.match(/\bType=['"]([^'"]+)['"]/)?.[1] ?? "";
    if (rId && target) out.push({ rId, type, target });
  }
  return out;
}

// Resolve an OOXML rels Target against the directory of the file that
// contained the rels. Targets are either absolute ("/word/document.xml")
// or relative ("../charts/chart1.xml" from "xl/drawings/_rels/").
function resolveOoxmlPath(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `${baseDir}/${target}`.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

function extractSheetOrigin(sheetXml: string): SheetOrigin {
  // Tolerate single quotes and attribute reordering: `<dimension … ref="A1"/>`.
  const m = sheetXml.match(/<dimension\b[^>]*\bref=['"]([A-Z]+\d+)/);
  if (!m) return DEFAULT_ORIGIN;
  const tl = colCache.decodeAddress(m[1]!);
  return { row: tl.row, col: tl.col };
}

async function readRichDataCellImages(
  source: Source,
  sheets: SheetEntry[],
): Promise<AnchoredImage[]> {
  const text = (p: string) => source.zip.file(p)?.async("text");
  const [relsXml, richRelXml, rdXml, mdXml] = await Promise.all([
    text("xl/richData/_rels/richValueRel.xml.rels"),
    text("xl/richData/richValueRel.xml"),
    text("xl/richData/rdrichvalue.xml"),
    text("xl/metadata.xml"),
  ]);
  if (!relsXml || !richRelXml || !rdXml || !mdXml) return [];

  const relMap = new Map(
    parseRelationships(relsXml)
      .filter((r) => /image/i.test(r.type))
      .map((r) => [r.rId, resolveOoxmlPath("xl/richData", r.target)] as const),
  );
  const richRelIdx: string[] = [];
  for (const m of richRelXml.matchAll(/<rel\s+r:id=['"]([^'"]+)['"]\/>/g)) {
    richRelIdx.push(m[1]!);
  }
  const rdRichValue: number[] = [];
  for (const m of rdXml.matchAll(/<rv\b[^>]*>([\s\S]*?)<\/rv>/g)) {
    const v = m[1]!.match(/<v>(\d+)<\/v>/);
    rdRichValue.push(v ? parseInt(v[1]!, 10) : -1);
  }
  const vmBlock = mdXml.match(/<valueMetadata\b[\s\S]*?<\/valueMetadata>/)?.[0] ?? "";
  const vmToRv: number[] = [];
  for (const m of vmBlock.matchAll(/<rc\b[^>]*\bv=['"](\d+)['"]/g)) {
    vmToRv.push(parseInt(m[1]!, 10));
  }

  const out: AnchoredImage[] = [];
  for (const sheet of sheets) {
    for (const m of sheet.xml.matchAll(
      /<c\b[^>]*\br=['"]([A-Z]+\d+)['"][^>]*\bvm=['"](\d+)['"][^>]*\/?>/g,
    )) {
      const cell = m[1]!;
      // OOXML: cell `vm` attr is a 1-based index into valueMetadata.
      const rvIdx = vmToRv[parseInt(m[2]!, 10) - 1];
      if (rvIdx == null) continue;
      const relIdx = rdRichValue[rvIdx];
      if (relIdx == null || relIdx < 0) continue;
      const rId = richRelIdx[relIdx];
      const imgPath = rId ? relMap.get(rId) : undefined;
      const imgFile = imgPath ? source.zip.file(imgPath) : null;
      if (!imgFile) continue;
      const buf = await imgFile.async("uint8array");
      const filename = imgPath!.split("/").pop()!;
      const { col, row } = colCache.decodeAddress(cell);
      out.push({
        sheet: sheet.name,
        col,
        row,
        filename,
        mimeType: mimeFromFilename(filename),
        base64: Buffer.from(buf).toString("base64"),
        anchorKind: "cell",
      });
    }
  }
  return out;
}

export async function spliceXlsxImages(
  markdown: string,
  source: Source,
): Promise<{ markdown: string; images: Image[] }> {
  const { images: anchored, origins } = await readAnchoredImages(source);
  if (anchored.length === 0) return { markdown, images: [] };

  const bySheet = Map.groupBy(anchored, (a) => a.sheet);

  const images: Image[] = [];
  let phCounter = 0;
  const placeholderFor = (im: AnchoredImage): string => {
    const placeholder = `<<IMG_XLSX_${phCounter++}>>`;
    images.push({
      id: `${im.sheet}!${a1(im.col, im.row)}!${im.filename}`,
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
    const imgs = bySheet.get(sheetName);
    if (!imgs || imgs.length === 0) return sec;

    let section = sec;
    const origin = origins.get(sheetName) ?? DEFAULT_ORIGIN;
    const drawingByRow = new Map<number, string[]>();
    for (const im of imgs) {
      const ph = placeholderFor(im);
      if (im.anchorKind === "cell") {
        const replaced = setMarkdownTableCell(section, im.row, im.col, ph, origin);
        if (replaced !== null) section = replaced;
        else orphans.push(ph);
      } else {
        if (!drawingByRow.has(im.row)) drawingByRow.set(im.row, []);
        drawingByRow.get(im.row)!.push(ph);
      }
    }
    // Skip the full table rewrite when there are no drawing-anchored
    // placeholders to slot in — for sheets with only cell-anchored images
    // (or none at all on that sheet) the table is already correct.
    return drawingByRow.size === 0
      ? section
      : splitTableAtEmptyRows(section, drawingByRow, origin);
  });

  for (const [sheet, imgs] of bySheet) {
    if (seenSheets.has(sheet)) continue;
    for (const im of imgs) orphans.push(placeholderFor(im));
  }
  let result = rebuilt.join("");
  if (orphans.length) {
    result += "\n\n---\n\n## 画像一覧 (位置特定不可)\n\n" + orphans.join("\n\n") + "\n";
  }
  return { markdown: result, images };
}

// ---------- GFM table helpers ----------

const isTableRow = (s: string) => /^\|/.test(s);
const isSeparator = (s: string) => /^\|[\s|\-:]+\|?\s*$/.test(s);
const isEmptyRow = (s: string) =>
  isTableRow(s) && s.split("|").slice(1, -1).every((c) => c.trim() === "");

function findTableStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (isTableRow(lines[i]!) && isSeparator(lines[i + 1] ?? "")) return i;
  }
  return -1;
}

function setMarkdownTableCell(
  section: string,
  xlsxRow: number,
  xlsxCol: number,
  replacement: string,
  origin: SheetOrigin,
): string | null {
  const lines = section.split("\n");
  const tableStart = findTableStart(lines);
  if (tableStart < 0) return null;
  // pandoc renders the row at the sheet's data-range top (origin.row) as the
  // markdown header line; subsequent xlsx rows are data lines after the
  // separator. xlsx column `origin.col` is parts[1] in each pipe-split row.
  const target =
    xlsxRow === origin.row
      ? tableStart
      : tableStart + 2 + (xlsxRow - origin.row - 1);
  if (target < 0 || target >= lines.length) return null;
  const line = lines[target]!;
  if (!line.startsWith("|")) return null;
  const partsIdx = xlsxCol - origin.col + 1;
  const parts = line.split("|");
  if (partsIdx < 1 || partsIdx > parts.length - 2) return null;
  parts[partsIdx] = ` ${replacement} `;
  lines[target] = parts.join("|");
  return lines.join("\n");
}

function splitTableAtEmptyRows(
  section: string,
  injectAfterXlsxRow: Map<number, string[]>,
  origin: SheetOrigin,
): string {
  const lines = section.split("\n");
  const tStart = findTableStart(lines);
  if (tStart < 0) return section;
  let tEnd = tStart + 2;
  while (tEnd < lines.length && isTableRow(lines[tEnd]!)) tEnd++;

  const header = lines[tStart]!;
  const data = lines.slice(tStart + 2, tEnd);

  type Chunk = { rows: string[]; fromRow: number; toRow: number };
  const chunks: Chunk[] = [];
  let cursor: Chunk | null = null;
  data.forEach((row, idx) => {
    // Header line corresponds to xlsx row `origin.row`; data row N (0-based)
    // is xlsx row origin.row + N + 1.
    const xlsxRow = origin.row + idx + 1;
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

  const pending = new Map(injectAfterXlsxRow);
  const out: string[] = [];
  chunks.forEach((chunk, idx) => {
    const isFirst = idx === 0;
    // Chunk 0 uses the original header; later chunks consume their own first
    // row as the header. A blank line precedes every chunk except the first.
    if (!isFirst) out.push("");
    out.push(
      ...(isFirst
        ? emitGfmTable(header, chunk.rows)
        : emitGfmTable(chunk.rows[0]!, chunk.rows.slice(1))),
    );
    // Chunk 0 also absorbs anchors that sit above the data range.
    for (const [row, phs] of [...pending]) {
      const above = isFirst && row < chunk.fromRow;
      const within = row >= chunk.fromRow && row <= chunk.toRow;
      if (above || within) {
        out.push("", ...phs);
        pending.delete(row);
      }
    }
  });
  // Anchors past the last chunk go after it.
  for (const phs of pending.values()) out.push("", ...phs);
  return [...lines.slice(0, tStart), ...out, ...lines.slice(tEnd)].join("\n");
}

function emitGfmTable(headerLine: string, dataLines: string[]): string[] {
  const splitCells = (l: string) => l.split("|").slice(1, -1).map((c) => c.trim());
  const headerCells = splitCells(headerLine);
  const dataCells = dataLines.map(splitCells);
  // Drop columns that are entirely empty within this chunk.
  const keep = headerCells.map(
    (h, i) => h !== "" || dataCells.some((r) => (r[i] ?? "") !== ""),
  );
  const row = (cells: string[]) =>
    "| " + cells.filter((_, i) => keep[i]).join(" | ") + " |";
  const sep = "| " + keep.filter(Boolean).map(() => "---").join(" | ") + " |";
  return [row(headerCells), sep, ...dataCells.map(row)];
}

// Exported for tests.
export const __testing = {
  findTableStart,
  setMarkdownTableCell,
  splitTableAtEmptyRows,
  emitGfmTable,
  isEmptyRow,
};
