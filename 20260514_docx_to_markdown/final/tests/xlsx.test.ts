import { test, expect } from "bun:test";
import { Lexer, type Tokens } from "marked";
import { __testing } from "../lib/xlsx";

const {
  setTableCellInToken,
  splitTableTokenAtEmptyRows,
  renderGfmTable,
  isEmptyRowCells,
  isSheetHeading,
} = __testing;

const ORIGIN_A1 = { row: 1, col: 1 };

// Helper: parse a single GFM table out of a markdown blob and return the
// first table token marked emits.
function parseTable(md: string): Tokens.Table {
  const tokens = new Lexer().lex(md);
  const tbl = tokens.find((t) => t.type === "table") as Tokens.Table | undefined;
  if (!tbl) throw new Error("no table in input");
  return tbl;
}

test("isSheetHeading recognises `## …` H2 headings", () => {
  const [h2, , h1, , p] = new Lexer().lex(`## sheet\n\n# top\n\nparagraph\n`);
  expect(isSheetHeading(h2!)).toBe(true);
  expect(isSheetHeading(h1!)).toBe(false);
  expect(isSheetHeading(p!)).toBe(false);
});

test("isEmptyRowCells recognises rows whose every cell is blank", () => {
  const empty = parseTable(`| A | B |\n| --- | --- |\n|   |   |\n`);
  const nonEmpty = parseTable(`| A | B |\n| --- | --- |\n| x |   |\n`);
  expect(isEmptyRowCells(empty.rows[0]!)).toBe(true);
  expect(isEmptyRowCells(nonEmpty.rows[0]!)).toBe(false);
});

test("setTableCellInToken rewrites the targeted cell (default A1 origin)", () => {
  const tbl = parseTable(`| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n`);
  // xlsx row 2 = first data row (row 1 is the header). xlsx col 2 = column B.
  expect(setTableCellInToken(tbl, 2, 2, "REPL", ORIGIN_A1)).toBe(true);
  const out = renderGfmTable(tbl.header, tbl.rows);
  expect(out).toContain("| 1 | REPL | 3 |");
  expect(out).toContain("| 4 | 5 | 6 |");
});

test("setTableCellInToken with non-A1 origin: targets header line correctly", () => {
  // Pretend the sheet's data range starts at B2. Pandoc's header line
  // corresponds to xlsx row 2. Writing to xlsx C2 should hit the second
  // cell of the header row.
  const tbl = parseTable(`| image1 | #VALUE! |\n| --- | --- |\n| imag2 | #VALUE! |\n`);
  expect(setTableCellInToken(tbl, 2, 3, "REPL", { row: 2, col: 2 })).toBe(true);
  const out = renderGfmTable(tbl.header, tbl.rows);
  expect(out).toContain("| image1 | REPL |");
  expect(out).toContain("| imag2 | #VALUE! |");
});

test("setTableCellInToken with non-A1 origin: targets data line correctly", () => {
  const tbl = parseTable(`| image1 | #VALUE! |\n| --- | --- |\n| imag2 | #VALUE! |\n`);
  expect(setTableCellInToken(tbl, 3, 3, "REPL", { row: 2, col: 2 })).toBe(true);
  const out = renderGfmTable(tbl.header, tbl.rows);
  expect(out).toContain("| image1 | #VALUE! |");
  expect(out).toContain("| imag2 | REPL |");
});

test("setTableCellInToken returns false when row is out of range", () => {
  const tbl = parseTable(`| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n`);
  expect(setTableCellInToken(tbl, 99, 1, "X", ORIGIN_A1)).toBe(false);
});

test("renderGfmTable drops entirely-empty columns", () => {
  const tbl = parseTable(`| A |  | C |\n| --- | --- | --- |\n| 1 |  | 3 |\n| 4 |  | 6 |\n`);
  const lines = renderGfmTable(tbl.header, tbl.rows).split("\n");
  expect(lines[0]).toBe("| A | C |");
  expect(lines[1]).toBe("| --- | --- |");
  expect(lines[2]).toBe("| 1 | 3 |");
});

test("splitTableTokenAtEmptyRows: no injections = unchanged-shape table", () => {
  const tbl = parseTable(`| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n`);
  const out = splitTableTokenAtEmptyRows(tbl, new Map(), ORIGIN_A1);
  expect(out).toContain("| A | B | C |");
  expect(out).toContain("| 1 | 2 | 3 |");
});

test("splitTableTokenAtEmptyRows splits at empty rows + injects placeholders", () => {
  const tbl = parseTable(
    `| A | B |\n| --- | --- |\n| 1 | 2 |\n|   |   |\n|   |   |\n| label-a | label-b |\n| value-a | value-b |\n`,
  );
  // Inject placeholder PH after the row containing xlsx row 2 (which is "1 | 2").
  const out = splitTableTokenAtEmptyRows(tbl, new Map([[2, ["<<PH>>"]]]), ORIGIN_A1);
  const phPos = out.indexOf("<<PH>>");
  const firstChunkPos = out.indexOf("| 1 | 2 |");
  const secondChunkPos = out.indexOf("| label-a | label-b |");
  expect(phPos).toBeGreaterThan(firstChunkPos);
  expect(secondChunkPos).toBeGreaterThan(phPos);
  // The second chunk's "| label-a | label-b |" line must be immediately
  // followed by a fresh separator line.
  const lines = out.split("\n");
  const labelIdx = lines.findIndex((l) => l === "| label-a | label-b |");
  expect(lines[labelIdx + 1]).toBe("| --- | --- |");
});

test("splitTableTokenAtEmptyRows: anchors past the last chunk are flushed at end", () => {
  const tbl = parseTable(`| A |\n| --- |\n| 1 |\n`);
  const out = splitTableTokenAtEmptyRows(tbl, new Map([[99, ["<<TAIL>>"]]]), ORIGIN_A1);
  expect(out.indexOf("<<TAIL>>")).toBeGreaterThan(out.indexOf("| 1 |"));
});
