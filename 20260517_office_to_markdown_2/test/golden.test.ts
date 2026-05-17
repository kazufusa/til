import { test, expect } from "bun:test";
import { readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { validateAndDetectFormat } from "../lib/common";
import { convertDocx } from "../lib/docx";
import { convertXlsx } from "../lib/xlsx";
import { convertPptx } from "../lib/pptx";
import type { Conversion, Format } from "../lib/types";

const FIXTURES = join(import.meta.dir, "..", "fixtures");

type Case = { format: Format; file: string; input: string; expected: string };

function discoverCases(): Case[] {
  const out: Case[] = [];
  for (const fmt of ["docx", "xlsx", "pptx"] as const) {
    const dir = join(FIXTURES, fmt);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (extname(file).slice(1) !== fmt) continue;
      const input = join(dir, file);
      const expected = `${input}.expected.md`;
      if (!existsSync(expected)) continue;
      out.push({ format: fmt, file, input, expected });
    }
  }
  return out;
}

async function convert(input: string, format: Format): Promise<Conversion> {
  if (format === "docx") return convertDocx(input);
  if (format === "xlsx") return convertXlsx(input);
  return convertPptx(input);
}

for (const c of discoverCases()) {
  test(`golden: ${c.format}/${c.file}`, async () => {
    const format = await validateAndDetectFormat(c.input);
    const conv = await convert(c.input, format);
    const expected = await Bun.file(c.expected).text();
    expect(conv.markdown).toBe(expected);
  });
}
