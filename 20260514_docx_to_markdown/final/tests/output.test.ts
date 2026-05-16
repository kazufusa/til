import { test, expect } from "bun:test";
import { injectImageDescriptions } from "../lib/output";
import type { Image } from "../lib/types";

// Happy-path block/inline rendering is exercised end-to-end by every
// golden-file fixture, so this file only keeps tests for behavior that
// no fixture happens to hit.

const img = (overrides: Partial<Image> = {}): Image => ({
  id: "i1",
  marker: "<<I1>>",
  mimeType: "image/png",
  base64: "AAAA",
  filename: "image1.png",
  ...overrides,
});

test("missing description falls back to a fixed marker", () => {
  const md = injectImageDescriptions("<<I1>>", [img()], new Map());
  expect(md).toContain("(画像説明なし)");
});

test("multiline descriptions collapse to one line", () => {
  const md = injectImageDescriptions(
    "<<I1>>",
    [img({ context: "inline" })],
    new Map([["i1", "line1\n  line2\nline3"]]),
  );
  expect(md).toContain("**[画像]** line1 line2 line3");
});

test("```markdown fence around a table is unwrapped", () => {
  const desc = "要約文。\n\n```markdown\n| a | b |\n|---|---|\n| 1 | 2 |\n```";
  const md = injectImageDescriptions("<<I1>>", [img()], new Map([["i1", desc]]));
  expect(md).toContain("> **[画像]** 要約文。");
  expect(md).toContain("| a | b |");
  expect(md).not.toContain("```markdown");
  expect(md).not.toMatch(/^```$/m);
});

test("```md fence is unwrapped too", () => {
  const desc = "```md\n| x |\n|---|\n| 1 |\n```";
  const md = injectImageDescriptions("<<I1>>", [img()], new Map([["i1", desc]]));
  expect(md).not.toContain("```md");
  expect(md).toContain("| x |");
});

test("plain ``` code fence is left alone", () => {
  const desc = "コード例:\n\n```\nconsole.log(1);\n```";
  const md = injectImageDescriptions("<<I1>>", [img()], new Map([["i1", desc]]));
  expect(md).toContain("```");
  expect(md).toContain("console.log(1);");
});
