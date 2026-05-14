// Run every (fixture × backend) combination we can locally and dump outputs
// into compare/all/ for inspection. Backends whose external dep is missing
// (gemini-pdf needs LibreOffice, markitdown needs pip) just print their
// error message and move on.

import { $ } from "bun";
import { readdir, mkdir } from "node:fs/promises";
import { extname, basename } from "node:path";

await mkdir("compare/all", { recursive: true });

const BY_FORMAT: Record<string, string[]> = {
  docx: ["pandoc", "mammoth-md", "mammoth-html", "officeparser", "gemini-pdf", "markitdown"],
  xlsx: ["pandoc", "officeparser", "gemini-pdf", "markitdown"],
  pptx: ["pandoc", "officeparser", "gemini-pdf", "markitdown"],
};

type Row = { fixture: string; backend: string; status: string; bytes: number };
const rows: Row[] = [];

for (const fmt of ["docx", "xlsx", "pptx"]) {
  const dir = `fixtures/${fmt}`;
  let files: string[];
  try {
    files = (await readdir(dir)).filter(
      (f) => extname(f).toLowerCase() === `.${fmt}` && !f.startsWith("~"),
    );
  } catch {
    continue;
  }
  for (const f of files) {
    const stem = basename(f, "." + fmt);
    for (const bk of BY_FORMAT[fmt]!) {
      const out = `compare/all/${stem}.${fmt}--${bk}.md`;
      const cmd = $`bun run convert.ts --backend=${bk} ${dir}/${f} ${out}`;
      try {
        await cmd.quiet();
        const size = (await Bun.file(out).text()).length;
        rows.push({ fixture: `${stem}.${fmt}`, backend: bk, status: "ok", bytes: size });
      } catch (e: any) {
        const stderr = (e?.stderr ?? "").toString().trim().split("\n").pop() ?? "";
        rows.push({
          fixture: `${stem}.${fmt}`,
          backend: bk,
          status: "FAIL: " + truncate(stderr, 60),
          bytes: 0,
        });
      }
    }
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// Print a summary table.
const cols = ["fixture", "backend", "status", "bytes"];
const widths = cols.map((c, i) =>
  Math.max(
    c.length,
    ...rows.map((r) => String(Object.values(r)[i]).length),
  ),
);
const fmt = (vals: any[]) =>
  vals.map((v, i) => String(v).padEnd(widths[i]!)).join("  ");
console.log(fmt(cols));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const r of rows) console.log(fmt(Object.values(r)));
