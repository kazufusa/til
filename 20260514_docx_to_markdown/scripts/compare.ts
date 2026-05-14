// Run several docx → markdown approaches on the same fixtures and dump each
// result to compare/<approach>--<fixture>.md so we can eyeball them side by
// side. Image descriptions are NOT generated here — we just want to see how
// each library handles structure (paragraphs, headings, tables, images,
// lists, bold/italic, hyperlinks).

import mammoth from "mammoth";
import { parseOffice } from "officeparser";
import { $ } from "bun";
import { mkdir, writeFile } from "node:fs/promises";

const FIXTURES = [
  "fixtures/docx/sample.docx",
  "fixtures/docx/ペッツファースト広尾店open.docx",
];

await mkdir("compare", { recursive: true });

function tagFor(fixture: string): string {
  return fixture
    .replace(/^fixtures\//, "")
    .replace(/\.docx$/, "")
    .replace(/[^\w\-]+/g, "_");
}

type Stats = {
  approach: string;
  fixture: string;
  bytes: number;
  headings: number;        // count of #-prefixed lines
  gfmTableRows: number;    // count of lines matching the `| ... |` pattern
  htmlTables: number;      // count of <table>
  markdownImages: number;  // count of ![...](...)
  htmlImages: number;      // count of <img
  bytesInlineBase64: number; // size of base64 image bloat (approx)
};

const stats: Stats[] = [];

async function write(approach: string, fixture: string, body: string) {
  const path = `compare/${approach}--${tagFor(fixture)}.md`;
  await Bun.write(path, body);
  const inlineBase64Bytes =
    (body.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g) ?? []).reduce(
      (a, m) => a + m.length,
      0,
    );
  stats.push({
    approach,
    fixture: tagFor(fixture),
    bytes: body.length,
    headings: (body.match(/^#{1,6}\s/gm) ?? []).length,
    gfmTableRows: (body.match(/^\|.*\|\s*$/gm) ?? []).length,
    htmlTables: (body.match(/<table\b/g) ?? []).length,
    markdownImages: (body.match(/!\[[^\]]*\]\(/g) ?? []).length,
    htmlImages: (body.match(/<img\b/g) ?? []).length,
    bytesInlineBase64: inlineBase64Bytes,
  });
}

// Always swap in a placeholder for images so we don't inflate file sizes with
// base64. (This is just for comparing structure, not for production output.)
function imageStub() {
  let i = 0;
  return mammoth.images.imgElement(async (image) => {
    const id = `img_${i++}`;
    return { src: `PLACEHOLDER:${id}`, alt: id };
  });
}

// ---- 1. mammoth.convertToMarkdown (no image hook — shows default behaviour) ----
async function runMammothMarkdownDefault(fixture: string) {
  const buf = Buffer.from(await Bun.file(fixture).arrayBuffer());
  const res = await mammoth.convertToMarkdown({ buffer: buf });
  await write("mammoth-md-default", fixture, res.value);
}

// ---- 2. mammoth.convertToMarkdown WITH image stub (recommended mammoth use) ----
async function runMammothMarkdownStubbed(fixture: string) {
  const buf = Buffer.from(await Bun.file(fixture).arrayBuffer());
  const res = await mammoth.convertToMarkdown(
    { buffer: buf },
    { convertImage: imageStub() },
  );
  await write("mammoth-md-stubbed", fixture, res.value);
}

// ---- 3. mammoth.convertToHtml (no image hook — default behaviour) ----
async function runMammothHtmlDefault(fixture: string) {
  const buf = Buffer.from(await Bun.file(fixture).arrayBuffer());
  const res = await mammoth.convertToHtml({ buffer: buf });
  await write("mammoth-html-default", fixture, res.value);
}

// ---- 4. mammoth.convertToHtml WITH image stub ----
async function runMammothHtmlStubbed(fixture: string) {
  const buf = Buffer.from(await Bun.file(fixture).arrayBuffer());
  const res = await mammoth.convertToHtml(
    { buffer: buf },
    { convertImage: imageStub() },
  );
  await write("mammoth-html-stubbed", fixture, res.value);
}

// ---- 5. officeparser (text mode) ----
async function runOfficeparser(fixture: string) {
  const parsed: any = await parseOffice(fixture);
  const text =
    typeof parsed.toText === "function" ? parsed.toText() : String(parsed);
  await write("officeparser-text", fixture, text);
}

// ---- 6. pandoc (external binary, for upper-bound reference) ----
async function runPandoc(fixture: string) {
  const outDir = `compare/pandoc-media--${tagFor(fixture)}`;
  await mkdir(outDir, { recursive: true });
  const result = await $`pandoc --to=gfm --wrap=none --extract-media=${outDir} ${fixture}`.text();
  await write("pandoc-gfm", fixture, result);
}

for (const fixture of FIXTURES) {
  console.log(`\n=== ${fixture} ===`);
  const runs = [
    ["mammoth-md-default", runMammothMarkdownDefault],
    ["mammoth-md-stubbed", runMammothMarkdownStubbed],
    ["mammoth-html-default", runMammothHtmlDefault],
    ["mammoth-html-stubbed", runMammothHtmlStubbed],
    ["officeparser-text", runOfficeparser],
    ["pandoc-gfm", runPandoc],
  ] as const;
  for (const [name, fn] of runs) {
    try {
      await fn(fixture);
    } catch (e: any) {
      console.error(`  ${name} failed:`, e.message);
    }
  }
}

// --- Summary table ---
console.log("\n=== summary ===");
const cols = [
  "approach",
  "fixture",
  "bytes",
  "headings",
  "gfmRows",
  "htmlTbl",
  "mdImg",
  "htmlImg",
  "base64",
];
const rows = stats.map((s) => [
  s.approach,
  s.fixture,
  s.bytes.toLocaleString(),
  s.headings,
  s.gfmTableRows,
  s.htmlTables,
  s.markdownImages,
  s.htmlImages,
  s.bytesInlineBase64.toLocaleString(),
]);
const widths = cols.map((c, i) =>
  Math.max(c.length, ...rows.map((r) => String(r[i]).length)),
);
const fmt = (vals: any[]) =>
  vals.map((v, i) => String(v).padEnd(widths[i]!)).join("  ");
console.log(fmt(cols));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const r of rows) console.log(fmt(r));

await writeFile(
  "compare/SUMMARY.md",
  [
    "# 比較サマリ",
    "",
    "`scripts/compare.ts` で各アプローチを 2 つの fixture に対して実行した結果。",
    "",
    "| " + cols.join(" | ") + " |",
    "| " + cols.map(() => "---").join(" | ") + " |",
    ...rows.map((r) => "| " + r.join(" | ") + " |"),
    "",
    "## 列の意味",
    "- `bytes`: 出力ファイルサイズ (文字数)",
    "- `headings`: `^#{1,6} ` で始まる行の数 (Markdown 見出し)",
    "- `gfmRows`: `^|...|$` パターンの行数 (GFM テーブル行)",
    "- `htmlTbl`: `<table` の出現数 (HTML テーブル要素)",
    "- `mdImg`: `![alt](src)` 形式の画像数",
    "- `htmlImg`: `<img` の出現数",
    "- `base64`: data:image base64 として埋め込まれた合計バイト数 (見えない肥大化分)",
  ].join("\n"),
);
console.log("\nwrote compare/SUMMARY.md");
