import { test, expect } from "bun:test";
import { __testing } from "../lib/xlsx";

const { findTableStart, setMarkdownTableCell, splitTableAtEmptyRows, emitGfmTable, isEmptyRow } =
  __testing;

const TABLE = `pre

| A | B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6 |

post`;

test("findTableStart locates header line index", () => {
  const idx = findTableStart(TABLE.split("\n"));
  expect(TABLE.split("\n")[idx]).toBe("| A | B | C |");
});

test("findTableStart returns -1 when no table present", () => {
  expect(findTableStart(["just", "prose", "here"])).toBe(-1);
});

test("isEmptyRow recognises empty data rows", () => {
  expect(isEmptyRow("|  |  |  |")).toBe(true);
  expect(isEmptyRow("| x |  |")).toBe(false);
  expect(isEmptyRow("not a row")).toBe(false);
});

test("setMarkdownTableCell rewrites the targeted cell", () => {
  // xlsx row 2 = first data row (row 1 is the header). xlsx col 2 = column B.
  const out = setMarkdownTableCell(TABLE, 2, 2, "REPL");
  expect(out).toContain("| 1 | REPL | 3 |");
  // Other cells untouched
  expect(out).toContain("| 4 | 5 | 6 |");
});

test("setMarkdownTableCell returns null when row is out of range", () => {
  expect(setMarkdownTableCell(TABLE, 99, 1, "X")).toBeNull();
});

test("emitGfmTable drops entirely-empty columns", () => {
  const lines = emitGfmTable("| A |  | C |", ["| 1 |  | 3 |", "| 4 |  | 6 |"]);
  // Middle (empty) column should be gone.
  expect(lines[0]).toBe("| A | C |");
  expect(lines[1]).toBe("| --- | --- |");
  expect(lines[2]).toBe("| 1 | 3 |");
});

test("splitTableAtEmptyRows: no injections, no empty rows = unchanged-shape table", () => {
  const out = splitTableAtEmptyRows(TABLE, new Map());
  expect(out).toContain("| A | B | C |");
  expect(out).toContain("| 1 | 2 | 3 |");
});

test("splitTableAtEmptyRows splits at empty rows + injects placeholders", () => {
  const tbl = `## sheet

| A | B |
| --- | --- |
| 1 | 2 |
|   |   |
|   |   |
| label-a | label-b |
| value-a | value-b |
`;
  // Inject placeholder PH after the row containing xlsx row 2 (which is "1 | 2").
  const out = splitTableAtEmptyRows(tbl, new Map([[2, ["<<PH>>"]]]));
  // First chunk emitted, then placeholder, then second chunk (label/value).
  const phPos = out.indexOf("<<PH>>");
  const firstChunkPos = out.indexOf("| 1 | 2 |");
  const secondChunkPos = out.indexOf("| label-a | label-b |");
  expect(phPos).toBeGreaterThan(firstChunkPos);
  expect(secondChunkPos).toBeGreaterThan(phPos);
  // The second chunk's header line uses its first row as the header.
  expect(out).toMatch(/\| label-a \| label-b \|\s*\n\| --- \| --- \|/);
});

test("splitTableAtEmptyRows: anchors past the last chunk are flushed at end", () => {
  const tbl = `## s
| A |
| --- |
| 1 |
`;
  // xlsx row 99 is well past the data range → goes to the tail.
  const out = splitTableAtEmptyRows(tbl, new Map([[99, ["<<TAIL>>"]]]));
  expect(out.indexOf("<<TAIL>>")).toBeGreaterThan(out.indexOf("| 1 |"));
});
