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
