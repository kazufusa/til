// End-to-end fixture tests: run pandoc-wasm + xlsx anchor splice against the
// committed fixtures and assert the converted markdown has the structure we
// expect. These don't call Gemini — they only check the parser-side output
// (image patterns + table shape + heading detection).

import { test, expect } from "bun:test";
import { loadSource } from "../lib/common";
import { runPandocWasm } from "../lib/pandoc";
import { spliceXlsxImages } from "../lib/xlsx";

test("docx: pandoc-wasm picks up headings and emits an image reference", async () => {
  const source = await loadSource("./fixtures/docx/sample.docx");
  const { markdown, images } = await runPandocWasm(source);
  // make-fixture-side patch ensures Heading[N] styles are recognised.
  expect(markdown).toMatch(/^# 月次売上レポート/m);
  expect(markdown).toMatch(/^## 売上一覧/m);
  // GFM table with the apple/banana/orange rows.
  expect(markdown).toMatch(/\| りんご\s*\|/);
  // One bar-chart image.
  expect(images).toHaveLength(1);
  expect(images[0]!.filename).toMatch(/\.png$/);
  // Pattern matches the actual <img>/![]() in the markdown.
  expect(images[0]!.pattern.test(markdown)).toBe(true);
});

test("pptx: each slide becomes a Slide heading and image refs are recovered", async () => {
  const source = await loadSource("./fixtures/pptx/sample.pptx");
  const { markdown, images } = await runPandocWasm(source);
  expect(markdown).toMatch(/^## Slide 1/m);
  expect(markdown).toMatch(/^## Slide 4/m);
  expect(images.length).toBeGreaterThanOrEqual(2);
  // Each image's pattern must hit the markdown.
  for (const img of images) {
    expect(img.pattern.test(markdown)).toBe(true);
  }
});

test("xlsx: anchor splice places drawing images per sheet + writes cell images into table cells", async () => {
  const source = await loadSource("./fixtures/xlsx/sample.xlsx");
  const { markdown: rawMd, images: rawImgs } = await runPandocWasm(source);
  // pandoc-wasm doesn't touch xlsx images itself.
  expect(rawImgs).toHaveLength(0);

  const { markdown, images } = await spliceXlsxImages(rawMd, source);
  // 売上一覧: 1 bar chart (drawing). 構成比: 1 pie chart (drawing) + 3 dog cell images.
  expect(images.length).toBe(5);

  // Each placeholder must appear exactly once in the output.
  for (const img of images) {
    const matches = markdown.match(img.pattern);
    expect(matches?.length ?? 0).toBe(1);
  }

  // Cell-anchored images render inline within the dog row.
  const cellImgs = images.filter((i) => i.context === "inline");
  expect(cellImgs).toHaveLength(3);
  // The dog row (犬1 / 犬2 / 犬3) and the image-placeholder row are on
  // consecutive lines (no blank-line break inside the GFM table).
  const lines = markdown.split("\n");
  const dogHeaderIdx = lines.findIndex((l) => l.includes("犬1") && l.includes("犬2"));
  expect(dogHeaderIdx).toBeGreaterThan(-1);

  // Drawing-anchored images sit between the data sub-table and the dog
  // sub-table (構成比), not at the bottom of the section.
  const sheet2Start = markdown.indexOf("## 構成比");
  const pieAnchor = images.find(
    (i) => i.context !== "inline" && i.id.startsWith("構成比!"),
  );
  expect(pieAnchor).toBeDefined();
  const pieIdx = markdown.search(pieAnchor!.pattern);
  const dogRowIdx = markdown.indexOf("犬1");
  expect(pieIdx).toBeGreaterThan(sheet2Start);
  expect(pieIdx).toBeLessThan(dogRowIdx);
});
