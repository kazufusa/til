// Golden-file test. For every fixture, run the dummy-describer pipeline and
// compare the markdown to the checked-in `<fixture>.expected.md`. The
// expected files are regenerated with `bun run regen:expected` — that
// command's diff against git HEAD IS the review surface for parser/splice
// changes.

import { test, expect } from "bun:test";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { runPipeline, dummyDescribe } from "../lib/pipeline";

async function listFixtures(): Promise<string[]> {
  const out: string[] = [];
  for (const fmt of ["docx", "xlsx", "pptx"] as const) {
    const dir = `./fixtures/${fmt}`;
    for (const name of await readdir(dir)) {
      if (extname(name).toLowerCase() !== `.${fmt}`) continue;
      if (name.startsWith("~$")) continue;
      out.push(join(dir, name));
    }
  }
  return out;
}

const FIXTURES = await listFixtures();
const TIMEOUT_MS = 300_000;

for (const path of FIXTURES) {
  test(
    `golden: ${path}`,
    async () => {
      const actual = await runPipeline(path, dummyDescribe);
      const expectedPath = `${path}.expected.md`;
      const expectedFile = Bun.file(expectedPath);
      const exists = await expectedFile.exists();
      expect(
        exists,
        `${expectedPath} missing — run \`bun run regen:expected\` to create it`,
      ).toBe(true);
      const expected = await expectedFile.text();
      expect(actual).toBe(expected);
    },
    TIMEOUT_MS,
  );
}
