import { test, expect } from "bun:test";
import { injectImageDescriptions } from "../lib/output";
import type { Image } from "../lib/types";

const img = (overrides: Partial<Image> = {}): Image => ({
  id: "i1",
  pattern: /<<I1>>/g,
  mimeType: "image/png",
  base64: "AAAA",
  filename: "image1.png",
  ...overrides,
});

test("block image becomes a standalone blockquote line", () => {
  const md = injectImageDescriptions(
    "before\n\n<<I1>>\n\nafter",
    [img()],
    new Map([["i1", "a chart"]]),
  );
  expect(md).toContain("> **[画像]** a chart");
  // No accidental triple newlines.
  expect(md).not.toMatch(/\n{3,}/);
});

test("inline image stays on the same line (no blockquote)", () => {
  const md = injectImageDescriptions(
    "| <<I1>> | foo |\n| --- | --- |\n| x | y |",
    [img({ context: "inline" })],
    new Map([["i1", "a dog"]]),
  );
  const firstLine = md.split("\n")[0]!;
  expect(firstLine).toContain("**[画像]** a dog");
  // Not wrapped in a blockquote.
  expect(firstLine.startsWith(">")).toBe(false);
});

test("missing description falls back gracefully", () => {
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
