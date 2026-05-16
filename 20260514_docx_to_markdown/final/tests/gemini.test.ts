import { test, expect } from "bun:test";
import { formatDescription, __testing } from "../lib/gemini";

const { parseAndFormat } = __testing;

test("formatDescription: summary kind returns summary only", () => {
  expect(
    formatDescription({ kind: "summary", summary: "犬の写真。" }),
  ).toBe("犬の写真。");
});

test("formatDescription: decorative kind returns summary only", () => {
  expect(
    formatDescription({ kind: "decorative", summary: "装飾的なアイコン。" }),
  ).toBe("装飾的なアイコン。");
});

test("formatDescription: table renders summary + GFM table", () => {
  const md = formatDescription({
    kind: "table",
    summary: "売上一覧。",
    table: {
      headers: ["商品", "数量"],
      rows: [
        ["りんご", "3"],
        ["みかん", "8"],
      ],
    },
  });
  expect(md).toBe(
    "売上一覧。\n\n| 商品 | 数量 |\n| --- | --- |\n| りんご | 3 |\n| みかん | 8 |",
  );
});

test("formatDescription: table without summary returns just the table", () => {
  const md = formatDescription({
    kind: "table",
    summary: "",
    table: { headers: ["a"], rows: [["1"]] },
  });
  expect(md).toBe("| a |\n| --- |\n| 1 |");
});

test("formatDescription: kind=='table' but empty/missing table degrades to summary", () => {
  expect(
    formatDescription({ kind: "table", summary: "表らしき画像。", table: null }),
  ).toBe("表らしき画像。");
  expect(
    formatDescription({
      kind: "table",
      summary: "表らしき画像。",
      table: { headers: [], rows: [] },
    }),
  ).toBe("表らしき画像。");
});

test("parseAndFormat: valid JSON yields formatted markdown", () => {
  const json = JSON.stringify({
    kind: "table",
    summary: "サンプル。",
    table: { headers: ["a", "b"], rows: [["1", "2"]] },
  });
  expect(parseAndFormat(json)).toBe(
    "サンプル。\n\n| a | b |\n| --- | --- |\n| 1 | 2 |",
  );
});

test("parseAndFormat: malformed JSON falls back to raw text", () => {
  expect(parseAndFormat("  not json  ")).toBe("not json");
});

test("parseAndFormat: empty response returns a fixed marker", () => {
  expect(parseAndFormat(undefined)).toContain("画像説明を取得できませんでした");
});

test("parseAndFormat: JSON that doesn't match schema falls back to raw text", () => {
  const bad = JSON.stringify({ kind: "weird", value: 42 });
  expect(parseAndFormat(bad)).toBe(bad);
});
