import { test, expect } from "bun:test";
import { __testing } from "../lib/pandoc";

const { extractFigcaptionText, collectText, findRefInHtmlRaw } = __testing;

// All tests below are pure-sync helpers — no pandoc-wasm invocation, no
// async setup, no per-test fixture work. The end-to-end behavior (docx ->
// markdown with figcaption-as-heading) is covered by the golden test for
// fixtures/docx/sample.docx; these unit tests pin the helper edge cases
// the golden doesn't exercise.

// ---------- extractFigcaptionText ----------

test("extractFigcaptionText: pandoc's canonical figure-with-caption shape", () => {
  const html = `<figure>
<img src="media/image2.jpeg" style="width:6.26806in;height:4.69931in" alt="しっぽでハートを作る猫" />
<figcaption><p>図 1猫</p></figcaption>
</figure>`;
  expect(extractFigcaptionText(html)).toBe("図 1猫");
});

test("extractFigcaptionText: caption text directly under figcaption (no <p>)", () => {
  const html = `<figure>
<img src="media/x.png" />
<figcaption>裸テキスト</figcaption>
</figure>`;
  expect(extractFigcaptionText(html)).toBe("裸テキスト");
});

test("extractFigcaptionText: empty figcaption returns null", () => {
  const html = `<figure>
<img src="media/x.png" />
<figcaption></figcaption>
</figure>`;
  expect(extractFigcaptionText(html)).toBeNull();
});

test("extractFigcaptionText: figure without a figcaption returns null", () => {
  const html = `<figure>
<img src="media/x.png" />
</figure>`;
  expect(extractFigcaptionText(html)).toBeNull();
});

test("extractFigcaptionText: bare <img> outside a figure returns null", () => {
  expect(extractFigcaptionText(`<img src="media/x.png" alt="x" />`)).toBeNull();
});

test("extractFigcaptionText: whitespace inside the figcaption is trimmed", () => {
  const html = `<figure>
<img src="media/x.png" />
<figcaption><p>  spaced caption  </p></figcaption>
</figure>`;
  expect(extractFigcaptionText(html)).toBe("spaced caption");
});

test("extractFigcaptionText: malformed input never throws past the caller", () => {
  const html = `<figure><img<<<<>nope`;
  expect(() => extractFigcaptionText(html)).not.toThrow();
  expect(extractFigcaptionText(html)).toBeNull();
});

// ---------- collectText ----------

test("collectText: strings pass through, numbers stringify, nullish → ''", () => {
  expect(collectText("hello")).toBe("hello");
  expect(collectText("")).toBe("");
  expect(collectText(42)).toBe("42");
  expect(collectText(null)).toBe("");
  expect(collectText(undefined)).toBe("");
});

test("collectText: attribute keys (@…) are skipped", () => {
  expect(collectText({ "@id": "x", "@class": "y", p: "body" })).toBe("body");
});

test("collectText: nested objects concatenate left-to-right", () => {
  expect(
    collectText({ a: "1", b: { "@x": "ignored", c: "2" }, d: "3" }),
  ).toBe("123");
});

test("collectText: arrays join their elements", () => {
  expect(collectText([{ p: "a" }, { p: "b" }, "c"])).toBe("abc");
});

// ---------- findRefInHtmlRaw ----------

test("findRefInHtmlRaw: matches the first refPath whose src= attribute appears", () => {
  const byRefPath = new Map<string, { refPath: string; tag: string }>([
    ["media/a.png", { refPath: "media/a.png", tag: "A" }],
    ["media/b.png", { refPath: "media/b.png", tag: "B" }],
  ]);
  expect(
    findRefInHtmlRaw(`<img src="media/b.png" alt="x" />`, byRefPath)?.tag,
  ).toBe("B");
});

test("findRefInHtmlRaw: anchors on src=\"...\" so alt-text collisions don't match", () => {
  const byRefPath = new Map<string, { refPath: string }>([
    ["media/img.png", { refPath: "media/img.png" }],
  ]);
  const html = `<img src="media/different.png" alt="cf. media/img.png" />`;
  expect(findRefInHtmlRaw(html, byRefPath)).toBeNull();
});

test("findRefInHtmlRaw: returns null when no refPath matches", () => {
  const byRefPath = new Map<string, { refPath: string }>([
    ["media/a.png", { refPath: "media/a.png" }],
  ]);
  expect(findRefInHtmlRaw(`<img src="other.png"/>`, byRefPath)).toBeNull();
});
