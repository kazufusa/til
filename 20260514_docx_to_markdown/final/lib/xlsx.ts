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
  cell: string;
  col: number; // 1-based
  row: number; // 1-based
  filename: string;
  mimeType: string;
  base64: string;
  anchorKind: "drawing" | "cell";
};

async function readAnchoredImages(source: Source): Promise<AnchoredImage[]> {
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
        cell: `${colCache.n2l(col)}${row}`,
        col,
        row,
        filename: `image${++counter}.${ext}`,
        mimeType: mimeFromFilename(`x.${ext}`),
        base64: Buffer.from(m.buffer).toString("base64"),
        anchorKind: "drawing",
      });
    }
  }

  // (2) Rich-data cell images
  out.push(
    ...(await readRichDataCellImages(source, wb.worksheets.map((w) => w.name))),
  );
  return out;
}

async function readRichDataCellImages(
  source: Source,
  sheetNames: string[],
): Promise<AnchoredImage[]> {
  const text = async (p: string) => {
    const f = source.zip.file(p);
    return f ? f.async("text") : null;
  };
  const [relsXml, richRelXml, rdXml, mdXml] = await Promise.all([
    text("xl/richData/_rels/richValueRel.xml.rels"),
    text("xl/richData/richValueRel.xml"),
    text("xl/richData/rdrichvalue.xml"),
    text("xl/metadata.xml"),
  ]);
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
    const v = m[1]!.match(/<v>(\d+)<\/v>/);
    rdRichValue.push(v ? parseInt(v[1]!, 10) : -1);
  }
  const vmBlock = mdXml.match(/<valueMetadata\b[\s\S]*?<\/valueMetadata>/)?.[0] ?? "";
  const vmToRv: number[] = [];
  for (const m of vmBlock.matchAll(/<rc\b[^>]*\sv="(\d+)"/g)) {
    vmToRv.push(parseInt(m[1]!, 10));
  }

  const sheetFiles = Object.keys(source.zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();
  const out: AnchoredImage[] = [];
  for (let i = 0; i < sheetFiles.length; i++) {
    const sheetXml = await text(sheetFiles[i]!);
    if (!sheetXml) continue;
    for (const m of sheetXml.matchAll(
      /<c\b[^>]*\br="([A-Z]+\d+)"[^>]*\bvm="(\d+)"[^>]*\/?>/g,
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
        sheet: sheetNames[i] ?? `Sheet${i + 1}`,
        cell,
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
  const anchored = await readAnchoredImages(source);
  if (anchored.length === 0) return { markdown, images: [] };

  const bySheet = new Map<string, AnchoredImage[]>();
  for (const a of anchored) {
    if (!bySheet.has(a.sheet)) bySheet.set(a.sheet, []);
    bySheet.get(a.sheet)!.push(a);
  }

  const images: Image[] = [];
  const phCounter = { n: 0 };
  const placeholderFor = (im: AnchoredImage): string => {
    const placeholder = `<<IMG_XLSX_${phCounter.n++}>>`;
    images.push({
      id: `${im.sheet}!${im.cell}!${im.filename}`,
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
    const drawingByRow = new Map<number, string[]>();
    for (const im of imgs) {
      const ph = placeholderFor(im);
      if (im.anchorKind === "cell") {
        const replaced = setMarkdownTableCell(section, im.row, im.col, ph);
        if (replaced !== null) section = replaced;
        else orphans.push(ph);
      } else {
        if (!drawingByRow.has(im.row)) drawingByRow.set(im.row, []);
        drawingByRow.get(im.row)!.push(ph);
      }
    }
    return splitTableAtEmptyRows(section, drawingByRow);
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
): string | null {
  const lines = section.split("\n");
  const tableStart = findTableStart(lines);
  if (tableStart < 0) return null;
  // Header is xlsx row 1. The first GFM data row sits at tableStart + 2 and
  // represents xlsx row 2 → line index tableStart + 2 + (N - 2).
  const target = tableStart + 2 + (xlsxRow - 2);
  if (target < 0 || target >= lines.length) return null;
  const line = lines[target]!;
  if (!line.startsWith("|")) return null;
  const parts = line.split("|");
  if (xlsxCol < 1 || xlsxCol > parts.length - 2) return null;
  parts[xlsxCol] = ` ${replacement} `;
  lines[target] = parts.join("|");
  return lines.join("\n");
}

function splitTableAtEmptyRows(
  section: string,
  injectAfterXlsxRow: Map<number, string[]>,
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
    const xlsxRow = idx + 2;
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
  chunks.forEach((chunk, idx) => {
    const isFirst = idx === 0;
    if (isFirst) out.push(...emitGfmTable(header, chunk.rows));
    else out.push("", ...emitGfmTable(chunk.rows[0]!, chunk.rows.slice(1)));
    for (const [row, phs] of injectAfterXlsxRow) {
      if (consumed.has(row)) continue;
      // Chunk 0 also absorbs anchors that sit at or above the data range.
      const inRange = row >= chunk.fromRow && row <= chunk.toRow;
      const beforeFirst = isFirst && row < chunk.fromRow;
      if (inRange || beforeFirst) {
        out.push("", ...phs);
        consumed.add(row);
      }
    }
  });
  for (const [row, phs] of injectAfterXlsxRow) {
    if (consumed.has(row)) continue;
    out.push("", ...phs);
    consumed.add(row);
  }
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
