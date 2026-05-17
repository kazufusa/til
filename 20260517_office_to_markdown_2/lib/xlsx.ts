import ExcelJS from "exceljs";
import JSZip from "jszip";
import { imagePlaceholder, mimeFromExt } from "./common";
import type { Conversion, Image } from "./types";

// xlsx → markdown.
//
// Approach: walk each sheet's cell grid with exceljs. Split rows into
// "chunks" at empty rows so a sheet with multiple sub-tables emits multiple
// markdown tables. Each chunk's first row is the header.
//
// Images come in two flavours:
//   (a) drawing-anchored — classic chart/picture floats. Emitted as a block
//       placeholder after the chunk whose data range contains the anchor row.
//   (b) cell-anchored ("Image in cell" / IMAGE() rich-data) — emitted inline
//       inside the matching cell of the matching chunk.
//
// Images are renumbered per-extension (image1.png, image2.png, image1.jpeg)
// to match the convention pandoc uses, regardless of the original ordering
// inside `xl/media/`.
export async function convertXlsx(inputPath: string): Promise<Conversion> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inputPath);

  const bytes = await Bun.file(inputPath).arrayBuffer();
  const zip = await JSZip.loadAsync(bytes);

  const anchored = await readAllAnchoredImages(wb, zip);

  // Keep original media filenames (image1.jpeg, image6.png, etc). Matches the
  // names inside the .xlsx zip; pandoc-style chart renumbering would require
  // rendering charts, which we don't do.
  const renameMap = new Map<string, string>();
  for (const a of anchored) {
    if (renameMap.has(a.origPath)) continue;
    renameMap.set(a.origPath, a.origPath.split("/").pop()!);
  }

  const images: Image[] = [];
  const seenFiles = new Set<string>();
  for (const a of anchored) {
    const fname = renameMap.get(a.origPath)!;
    if (seenFiles.has(fname)) continue;
    seenFiles.add(fname);
    images.push({
      filename: fname,
      mimeType: a.mimeType,
      base64: a.base64,
    });
  }

  const chunks: string[] = [];
  for (const ws of wb.worksheets) {
    chunks.push(`## ${ws.name}`);
    const grid = sheetGrid(ws);
    const sheetAnchors = anchored.filter((a) => a.sheet === ws.name);
    // Apply cell-anchored images BEFORE chunking so cells that started out as
    // #VALUE! errors count as non-empty content (and the row carrying them
    // joins a chunk instead of being treated as a separator).
    for (const a of sheetAnchors) {
      if (a.kind !== "cell") continue;
      const row = grid[a.row - 1];
      const cell = row?.[a.col - 1];
      if (!cell) continue;
      cell.text = imagePlaceholder(renameMap.get(a.origPath)!, "inline");
      cell.bold = false;
    }
    chunks.push(renderSheet(grid, sheetAnchors, renameMap));
  }

  return {
    markdown: chunks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    images,
  };
}

// ---------- sheet → 2D grid ----------

type Cell = { text: string; bold: boolean };

function sheetGrid(ws: ExcelJS.Worksheet): Cell[][] {
  // rowCount/columnCount give the max row/col with any data. actualRowCount is
  // unreliable — drops trailing or empty-anchored rows. Iterate the full
  // bounding box so we keep gaps (handled later as chunk separators).
  const rows: Cell[][] = [];
  const maxCol = ws.columnCount || 0;
  for (let r = 1; r <= (ws.rowCount || 0); r++) {
    const row = ws.getRow(r);
    const cells: Cell[] = [];
    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      cells.push({
        text: cellToText(cell),
        bold: cellIsBold(cell),
      });
    }
    rows.push(cells);
  }
  return rows;
}

function cellIsBold(cell: ExcelJS.Cell): boolean {
  // exceljs surfaces bold via cell.font.bold. Some files only set it on the
  // cell's master style (cell.style.font.bold) or via the row's font.
  if (cell.font?.bold) return true;
  const style = (cell as unknown as { style?: { font?: { bold?: boolean } } }).style;
  if (style?.font?.bold) return true;
  return false;
}

// Excel serial date: integer day count from 1900-01-00 (with the 1900 leap
// year bug). To convert a JS Date to Excel serial:
//   serial = (jsDate - excelEpoch_ms) / msPerDay + 1
// where excelEpoch is 1899-12-30 UTC (offset chosen so 1900-01-01 → 1.
// Adding 1 instead of 2 because we start the epoch at Dec 30, not 31).
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86400000;

function dateToExcelSerial(d: Date): number {
  return (d.getTime() - EXCEL_EPOCH_MS) / MS_PER_DAY;
}

function cellToText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v == null) return "";
  if (typeof v === "number") {
    // Match pandoc's convention: integers render with trailing .0 (e.g. 3 →
    // "3.0"); float values pass through.
    return Number.isInteger(v) ? `${v}.0` : String(v);
  }
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) {
    // Re-emit Date as the raw Excel serial number so output matches what's
    // actually stored in the cell (pandoc / Excel itself work this way).
    return String(dateToExcelSerial(v));
  }
  if (typeof v === "object" && v !== null) {
    const obj = v as Record<string, unknown>;
    // formula
    if ("result" in obj) {
      const r = obj.result;
      if (typeof r === "number") {
        return Number.isInteger(r) ? `${r}.0` : String(r);
      }
      return String(r);
    }
    // rich text
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>)
        .map((p) => p.text ?? "")
        .join("");
    }
    if ("text" in obj) return String(obj.text);
    // error / unrecognised → leave empty so a rich-data anchor can fill it.
    if ("error" in obj) return "";
  }
  return cell.text ?? String(v);
}

// ---------- render ----------

function renderSheet(
  grid: Cell[][],
  anchors: AnchoredImage[],
  renameMap: Map<string, string>,
): string {
  // Chunk into sub-tables on all-empty rows (cell anchors have already been
  // applied to grid, so anchor cells count as non-empty).
  type Chunk = { rows: Cell[][]; fromRow: number; toRow: number };
  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;
  grid.forEach((row, idx) => {
    const rowIdx = idx + 1;
    const allEmpty = row.every((c) => c.text === "");
    if (allEmpty) {
      if (cur) {
        chunks.push(cur);
        cur = null;
      }
      return;
    }
    if (!cur) cur = { rows: [], fromRow: rowIdx, toRow: rowIdx };
    cur.rows.push(row);
    cur.toRow = rowIdx;
  });
  if (cur) chunks.push(cur);

  // Per-chunk column trim: drop columns where every cell in this chunk is
  // empty (both leading and trailing). Each sub-table sizes to its own data.
  const trimChunk = (rows: Cell[][]): Cell[][] => {
    if (rows.length === 0) return rows;
    const colCount = Math.max(...rows.map((r) => r.length), 0);
    const keep: number[] = [];
    for (let c = 0; c < colCount; c++) {
      if (rows.some((r) => (r[c]?.text ?? "") !== "")) keep.push(c);
    }
    return rows.map((r) => keep.map((c) => r[c] ?? { text: "", bold: false }));
  };

  // Emit each chunk as a GFM table; drop drawing-anchored images after the
  // chunk whose row range covers the anchor.
  const drawingAnchors = anchors.filter((a) => a.kind === "drawing");
  const consumed = new Set<number>();
  const out: string[] = [];

  chunks.forEach((chunk, i) => {
    out.push(renderChunk(trimChunk(chunk.rows)));
    for (let j = 0; j < drawingAnchors.length; j++) {
      if (consumed.has(j)) continue;
      const a = drawingAnchors[j]!;
      const inRange = a.row >= chunk.fromRow && a.row <= chunk.toRow;
      const beforeFirst = i === 0 && a.row < chunk.fromRow;
      if (inRange || beforeFirst) {
        out.push(imagePlaceholder(renameMap.get(a.origPath)!, "block"));
        consumed.add(j);
      }
    }
  });
  for (let j = 0; j < drawingAnchors.length; j++) {
    if (consumed.has(j)) continue;
    const a = drawingAnchors[j]!;
    out.push(imagePlaceholder(renameMap.get(a.origPath)!, "block"));
    consumed.add(j);
  }

  return out.join("\n\n");
}

function renderChunk(rows: Cell[][]): string {
  if (rows.length === 0) return "";
  const cols = rows[0]!.length;
  if (cols === 0) return "";
  const fmtCell = (c: Cell | undefined): string => {
    if (!c || c.text === "") return "";
    return c.bold ? `**${c.text}**` : c.text;
  };
  const renderRow = (r: Cell[]) =>
    "| " + Array.from({ length: cols }, (_, i) => fmtCell(r[i])).join(" | ") + " |";
  const sep = "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
  return [renderRow(rows[0]!), sep, ...rows.slice(1).map(renderRow)].join("\n");
}

// ---------- anchor extraction ----------

type AnchoredImage = {
  sheet: string;
  row: number; // 1-indexed
  col: number; // 1-indexed
  origPath: string; // xl/media/...
  mimeType: string;
  base64: string;
  kind: "drawing" | "cell";
};

async function readAllAnchoredImages(
  wb: ExcelJS.Workbook,
  zip: JSZip,
): Promise<AnchoredImage[]> {
  const out: AnchoredImage[] = [];

  // (1) Drawing-anchored — exceljs surfaces these.
  for (const ws of wb.worksheets) {
    const anchored = ws.getImages?.() ?? [];
    for (const a of anchored) {
      const m: any = wb.model.media.find(
        (x: any) => String(x.index) === String(a.imageId),
      );
      if (!m) continue;
      const ext = (m.extension as string) || "png";
      const path = `xl/media/image${Number(a.imageId) + 1}.${ext}`;
      const col = (a.range?.tl?.nativeCol ?? 0) + 1;
      const row = (a.range?.tl?.nativeRow ?? 0) + 1;
      out.push({
        sheet: ws.name,
        row,
        col,
        origPath: path,
        mimeType: mimeFromExt(ext),
        base64: Buffer.from(m.buffer).toString("base64"),
        kind: "drawing",
      });
    }
  }

  // (2) "Image in cell" / IMAGE() rich-data — exceljs doesn't surface these.
  const richData = await readRichDataImages(zip, (i) => wb.worksheets[i]?.name ?? `Sheet${i + 1}`);
  out.push(...richData);

  return out;
}

async function readRichDataImages(
  zip: JSZip,
  sheetName: (idx: number) => string,
): Promise<AnchoredImage[]> {
  const read = async (p: string) => {
    const f = zip.file(p);
    return f ? f.async("text") : null;
  };

  const relsXml = await read("xl/richData/_rels/richValueRel.xml.rels");
  const richRelXml = await read("xl/richData/richValueRel.xml");
  const rdXml = await read("xl/richData/rdrichvalue.xml");
  const mdXml = await read("xl/metadata.xml");
  if (!relsXml || !richRelXml || !rdXml || !mdXml) return [];

  // rId → image path
  const relMap = new Map<string, string>();
  for (const m of relsXml.matchAll(
    /<Relationship\s+Id="(rId\d+)"[^>]*Target="([^"]+)"/g,
  )) {
    if (!/image/i.test(m[0])) continue;
    relMap.set(m[1]!, m[2]!.replace(/^\.\.\//, "xl/"));
  }

  // <rel r:id="rId#"/> in document order
  const richRelIdx: string[] = [];
  for (const m of richRelXml.matchAll(/<rel\s+r:id="(rId\d+)"\/>/g)) {
    richRelIdx.push(m[1]!);
  }

  // rdrichvalue.xml → list of rv blocks. Each <rv> first <v> points at richRelIdx.
  const rdRichValue: number[] = [];
  for (const m of rdXml.matchAll(/<rv\b[^>]*>([\s\S]*?)<\/rv>/g)) {
    const v = m[1]!.match(/<v>(\d+)<\/v>/);
    rdRichValue.push(v ? parseInt(v[1]!, 10) : -1);
  }

  // metadata.xml → valueMetadata sequence: each <rc v="N"/> points at rdRichValue.
  const vmBlock =
    mdXml.match(/<valueMetadata\b[\s\S]*?<\/valueMetadata>/)?.[0] ?? "";
  const vmToRv: number[] = [];
  for (const m of vmBlock.matchAll(/<rc\b[^>]*\sv="(\d+)"/g)) {
    vmToRv.push(parseInt(m[1]!, 10));
  }

  const sheetFiles = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();
  const out: AnchoredImage[] = [];
  for (let i = 0; i < sheetFiles.length; i++) {
    const sheetXml = await read(sheetFiles[i]!);
    if (!sheetXml) continue;
    for (const m of sheetXml.matchAll(
      /<c\b[^>]*\br="([A-Z]+\d+)"[^>]*\bvm="(\d+)"[^>]*\/?>/g,
    )) {
      const a1 = parseA1(m[1]!);
      const vmIdx = parseInt(m[2]!, 10) - 1;
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
      out.push({
        sheet: sheetName(i),
        row: a1.row,
        col: a1.col,
        origPath: imgPath,
        mimeType: mimeFromExt("." + (imgPath.split(".").pop() ?? "bin")),
        base64: Buffer.from(buf).toString("base64"),
        kind: "cell",
      });
    }
  }
  return out;
}

function parseA1(addr: string): { col: number; row: number } {
  const m = addr.match(/^([A-Z]+)(\d+)$/);
  if (!m) return { col: 1, row: 1 };
  let col = 0;
  for (let i = 0; i < m[1]!.length; i++) {
    col = col * 26 + (m[1]!.charCodeAt(i) - 64);
  }
  return { col, row: parseInt(m[2]!, 10) };
}
