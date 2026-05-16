// xlsx-specific post-processing on top of pandoc-wasm output.
//
// pandoc never references xlsx images. We recover them ourselves from two
// sources:
//   (1) drawing-anchored images (classic xl/drawings/* chart/picture float)
//       — exceljs reads each anchor's top-left cell for us.
//   (2) "Image in cell" / IMAGE() rich-data images (Excel 2022+). exceljs
//       doesn't surface these; we walk the OOXML rich-data layer ourselves
//       (via fast-xml-parser):
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
//
// All markdown structure recognition (sheet headings, tables, cells) goes
// through marked's tokenizer; all OOXML parsing goes through
// fast-xml-parser. No regex appears anywhere in this file.

import ExcelJS from "exceljs";
import colCache from "exceljs/lib/utils/col-cache.js";
import { XMLParser } from "fast-xml-parser";
import { Lexer, type Token, type Tokens } from "marked";
import { mimeFromFilename } from "./common";
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

// Shared parser: attributes prefixed with "@", values left as strings unless
// they're inside element text (numbers there get parsed automatically, which
// is fine since we only read numeric ids from <v>).
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  isArray: (name) =>
    ["Relationship", "sheet", "row", "c", "rv", "v", "bk", "rc", "rel"].includes(name),
});

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
  const wb: any = xmlParser.parse(wbXml);
  const sheets: any[] = wb?.workbook?.sheets?.sheet ?? [];
  for (const sh of sheets) {
    const name: string | undefined = sh["@name"];
    const rId: string | undefined = sh["@r:id"];
    if (!name || !rId) continue;
    const target = rels.get(rId);
    if (!target) continue;
    const path = resolveOoxmlPath("xl", target);
    const xml = await text(path);
    if (xml) out.push({ name, path, xml });
  }
  return out;
}

type Relationship = { rId: string; type: string; target: string };

function parseRelationships(relsXml: string): Relationship[] {
  const parsed: any = xmlParser.parse(relsXml);
  const list: any[] = parsed?.Relationships?.Relationship ?? [];
  const out: Relationship[] = [];
  for (const r of list) {
    const rId: string | undefined = r["@Id"];
    const target: string | undefined = r["@Target"];
    const type: string = r["@Type"] ?? "";
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
  const parsed: any = xmlParser.parse(sheetXml);
  const ref: string | undefined = parsed?.worksheet?.dimension?.["@ref"];
  if (!ref) return DEFAULT_ORIGIN;
  // <dimension ref="A1"/> or <dimension ref="A1:C5"/> — top-left is the
  // first cell address, before any colon.
  const tlAddr = ref.split(":", 1)[0]!;
  if (!tlAddr) return DEFAULT_ORIGIN;
  const tl = colCache.decodeAddress(tlAddr);
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
      .filter((r) => r.type.toLowerCase().includes("image"))
      .map((r) => [r.rId, resolveOoxmlPath("xl/richData", r.target)] as const),
  );

  // richValueRel.xml: ordered list of <rel r:id="rIdN"/> — index into
  // relMap is what rdrichvalue.xml's <v> values point at.
  const richRel: any = xmlParser.parse(richRelXml);
  const rels: any[] = richRel?.richValueRels?.rel ?? [];
  const richRelIdx: string[] = rels
    .map((r) => r["@r:id"])
    .filter((id): id is string => typeof id === "string");

  // rdrichvalue.xml: each <rv> wraps an ordered <v> list. We want the
  // first <v> of each rv — that's the index into richRelIdx.
  const rd: any = xmlParser.parse(rdXml);
  const rvs: any[] = rd?.rvData?.rv ?? [];
  const rdRichValue: number[] = rvs.map((rv) => {
    const vs: any[] = rv?.v ?? [];
    if (vs.length === 0) return -1;
    const n = Number(vs[0]);
    return Number.isFinite(n) ? n : -1;
  });

  // metadata.xml: valueMetadata contains an ordered list of <bk> blocks,
  // each with <rc v="N"/> entries. The cell's vm="K" attribute is a 1-based
  // index into the flattened list of all <rc> elements.
  const md: any = xmlParser.parse(mdXml);
  const bks: any[] = md?.metadata?.valueMetadata?.bk ?? [];
  const vmToRv: number[] = [];
  for (const bk of bks) {
    const rcs: any[] = bk?.rc ?? [];
    for (const rc of rcs) {
      const v = rc?.["@v"];
      vmToRv.push(v == null ? -1 : parseInt(String(v), 10));
    }
  }

  const out: AnchoredImage[] = [];
  for (const sheet of sheets) {
    for (const { addr, vm } of cellsWithVm(sheet.xml)) {
      const rvIdx = vmToRv[vm - 1];
      if (rvIdx == null || !Number.isFinite(rvIdx)) continue;
      const relIdx = rdRichValue[rvIdx];
      if (relIdx == null || relIdx < 0) continue;
      const rId = richRelIdx[relIdx];
      const imgPath = rId ? relMap.get(rId) : undefined;
      const imgFile = imgPath ? source.zip.file(imgPath) : null;
      if (!imgFile) continue;
      const buf = await imgFile.async("uint8array");
      const filename = imgPath!.split("/").pop()!;
      const { col, row } = colCache.decodeAddress(addr);
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

// Walk a sheet xml and yield every cell that has a vm attribute (i.e. is a
// rich-data image cell). Returns the cell's A1 address and 1-based vm index.
function* cellsWithVm(sheetXml: string): Iterable<{ addr: string; vm: number }> {
  const parsed: any = xmlParser.parse(sheetXml);
  const rows: any[] = parsed?.worksheet?.sheetData?.row ?? [];
  for (const r of rows) {
    const cells: any[] = r?.c ?? [];
    for (const c of cells) {
      const vmRaw = c?.["@vm"];
      const addr: string | undefined = c?.["@r"];
      if (vmRaw == null || !addr) continue;
      const vm = parseInt(String(vmRaw), 10);
      if (!Number.isFinite(vm)) continue;
      yield { addr, vm };
    }
  }
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
    const marker = `<<IMG_XLSX_${phCounter++}>>`;
    images.push({
      id: `${im.sheet}!${a1(im.col, im.row)}!${im.filename}`,
      marker,
      mimeType: im.mimeType,
      base64: im.base64,
      context: im.anchorKind === "cell" ? "inline" : "block",
      filename: im.filename,
    });
    return marker;
  };

  // Tokenize pandoc's xlsx markdown so we can locate sheets (## headings)
  // and their associated tables structurally — no regex slicing.
  const topTokens = new Lexer().lex(markdown);
  const seenSheets = new Set<string>();
  const orphans: string[] = [];
  const outParts: string[] = [];
  let i = 0;
  while (i < topTokens.length) {
    const tok = topTokens[i]!;
    if (!isSheetHeading(tok)) {
      outParts.push(tok.raw);
      i++;
      continue;
    }
    // Collect [heading, ...inter-blocks, table?, ...post-blocks] up to the
    // next sheet heading.
    const headingTok = tok as Tokens.Heading;
    const sheetName = headingTok.text.trim();
    seenSheets.add(sheetName);
    let j = i + 1;
    while (j < topTokens.length && !isSheetHeading(topTokens[j]!)) j++;
    const section = topTokens.slice(i + 1, j);
    const tableIdx = section.findIndex((t) => t.type === "table");
    const imgs = bySheet.get(sheetName);

    outParts.push(headingTok.raw);

    if (!imgs || imgs.length === 0 || tableIdx < 0) {
      // No table in this section, or no images for this sheet — emit
      // section verbatim. Anchored images for a missing-table sheet become
      // orphans.
      if (imgs && tableIdx < 0) for (const im of imgs) orphans.push(placeholderFor(im));
      for (const sub of section) outParts.push(sub.raw);
      i = j;
      continue;
    }

    const tableTok = section[tableIdx] as Tokens.Table;
    const origin = origins.get(sheetName) ?? DEFAULT_ORIGIN;

    // Cell-anchored: write the placeholder directly into the matching cell.
    // Drawing-anchored: collect by row, to be slotted between sub-tables.
    const drawingByRow = new Map<number, string[]>();
    for (const im of imgs) {
      const ph = placeholderFor(im);
      if (im.anchorKind === "cell") {
        if (!setTableCellInToken(tableTok, im.row, im.col, ph, origin)) orphans.push(ph);
      } else {
        if (!drawingByRow.has(im.row)) drawingByRow.set(im.row, []);
        drawingByRow.get(im.row)!.push(ph);
      }
    }

    // Emit any blocks that sat between heading and table verbatim.
    for (let k = 0; k < tableIdx; k++) outParts.push(section[k]!.raw);
    outParts.push(
      drawingByRow.size === 0
        ? emitGfmTableFromToken(tableTok)
        : splitTableTokenAtEmptyRows(tableTok, drawingByRow, origin),
    );
    // Any blocks after the table are emitted verbatim.
    for (let k = tableIdx + 1; k < section.length; k++) outParts.push(section[k]!.raw);
    i = j;
  }

  for (const [sheet, imgs] of bySheet) {
    if (seenSheets.has(sheet)) continue;
    for (const im of imgs) orphans.push(placeholderFor(im));
  }

  let result = outParts.join("");
  if (orphans.length) {
    result += "\n\n---\n\n## 画像一覧 (位置特定不可)\n\n" + orphans.join("\n\n") + "\n";
  }
  // Marked's table token raw drops the trailing source newline; pandoc's
  // own output keeps one, and the goldens were authored that way too.
  // Restore the single EOF newline so file-shape stays stable.
  if (!result.endsWith("\n")) result += "\n";
  return { markdown: result, images };
}

function isSheetHeading(tok: Token): boolean {
  return tok.type === "heading" && (tok as Tokens.Heading).depth === 2;
}

// ---------- Token-level GFM table helpers ----------

type Cell = Tokens.TableCell;

const cellText = (c: Cell): string => (c?.text ?? "").trim();

// Set the cell at (xlsxRow, xlsxCol) to `replacement`. Origin maps xlsx
// coordinates to the table's header (xlsxRow=origin.row) and first column
// (xlsxCol=origin.col). Returns false when the coordinates fall outside the
// rendered table.
function setTableCellInToken(
  table: Tokens.Table,
  xlsxRow: number,
  xlsxCol: number,
  replacement: string,
  origin: SheetOrigin,
): boolean {
  const colIdx = xlsxCol - origin.col;
  if (colIdx < 0 || colIdx >= table.header.length) return false;
  const targetCells =
    xlsxRow === origin.row
      ? table.header
      : table.rows[xlsxRow - origin.row - 1];
  if (!targetCells) return false;
  const cell = targetCells[colIdx];
  if (!cell) return false;
  cell.text = replacement;
  cell.tokens = [];
  return true;
}

// Render a table (header + rows) as GFM, dropping any column that's empty
// across the whole table. Used by both the "no split" and "split" paths.
function emitGfmTableFromToken(table: Tokens.Table): string {
  return renderGfmTable(table.header, table.rows);
}

function renderGfmTable(header: Cell[], rows: Cell[][]): string {
  const keep = header.map(
    (h, i) => cellText(h) !== "" || rows.some((r) => cellText(r[i]!) !== ""),
  );
  const fmt = (cells: Cell[]) =>
    "| " + cells.filter((_, i) => keep[i]).map(cellText).join(" | ") + " |";
  const sep = "| " + keep.filter(Boolean).map(() => "---").join(" | ") + " |";
  return [fmt(header), sep, ...rows.map(fmt)].join("\n");
}

// Split the table into sub-tables at all-empty data rows; between sub-tables
// emit any drawing placeholders whose xlsx row falls within the preceding
// sub-table (or above the first one). Anchors past the last sub-table get
// flushed at the end.
function splitTableTokenAtEmptyRows(
  table: Tokens.Table,
  injectAfterXlsxRow: Map<number, string[]>,
  origin: SheetOrigin,
): string {
  type Chunk = { header: Cell[]; rows: Cell[][]; fromRow: number; toRow: number };
  const chunks: Chunk[] = [];
  let cursor: { rows: Cell[][]; fromRow: number; toRow: number } | null = null;
  table.rows.forEach((row, idx) => {
    // Header line corresponds to xlsx row `origin.row`; data row N (0-based)
    // is xlsx row origin.row + N + 1.
    const xlsxRow = origin.row + idx + 1;
    if (isEmptyRowCells(row)) {
      if (cursor) {
        chunks.push({ header: table.header, rows: cursor.rows, fromRow: cursor.fromRow, toRow: cursor.toRow });
        cursor = null;
      }
      return;
    }
    if (!cursor) cursor = { rows: [], fromRow: xlsxRow, toRow: xlsxRow };
    cursor.rows.push(row);
    cursor.toRow = xlsxRow;
  });
  if (cursor) chunks.push({ header: table.header, rows: (cursor as any).rows, fromRow: (cursor as any).fromRow, toRow: (cursor as any).toRow });
  if (chunks.length === 0) return renderGfmTable(table.header, table.rows);

  // Chunks past the first consume their own first data row as the header
  // (this matches how pandoc represents vertically-stacked xlsx blocks).
  for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i]!;
    c.header = c.rows[0] ?? c.header;
    c.rows = c.rows.slice(1);
  }

  const pending = new Map(injectAfterXlsxRow);
  const out: string[] = [];
  chunks.forEach((chunk, idx) => {
    const isFirst = idx === 0;
    if (!isFirst) out.push("");
    out.push(renderGfmTable(chunk.header, chunk.rows));
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
  for (const phs of pending.values()) out.push("", ...phs);
  return out.join("\n");
}

function isEmptyRowCells(cells: Cell[]): boolean {
  return cells.every((c) => cellText(c) === "");
}

// Exported for tests.
export const __testing = {
  setTableCellInToken,
  splitTableTokenAtEmptyRows,
  renderGfmTable,
  isEmptyRowCells,
  isSheetHeading,
};
