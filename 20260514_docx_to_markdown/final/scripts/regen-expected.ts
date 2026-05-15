// Regenerate `fixtures/**/<name>.<ext>.expected.md` from each fixture using
// the deterministic dummy describer. Run this after changing the parser
// output or after adding/replacing a fixture.
//   bun run scripts/regen-expected.ts
//
// Each fixture lands at `<input>.expected.md`. Diff that file against the
// previous git revision to review the change — that diff is the test signal.

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

for (const path of await listFixtures()) {
  const md = await runPipeline(path, dummyDescribe);
  const outPath = `${path}.expected.md`;
  await Bun.write(outPath, md);
  console.log(`wrote ${outPath} (${md.length} chars)`);
}
