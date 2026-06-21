// チャンク化の動作確認(creds 不要)。char offset が生本文と一致するか検証する。
//   bun run scripts/chunk-test.ts [path-to-md]
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chunkMarkdown } from "../src/lib/chunk";

const ROOT = join(import.meta.dirname, "..");
const target =
  process.argv[2] ?? join(ROOT, "markdowns", "system-design-primer.md");

const raw = await readFile(target, "utf8");
const chunks = chunkMarkdown(raw);

let offsetOk = true;
let maxLen = 0;
for (const c of chunks) {
  if (raw.slice(c.charStart, c.charEnd) !== c.content) offsetOk = false;
  maxLen = Math.max(maxLen, c.content.length);
}

const byType: Record<string, number> = {};
for (const c of chunks) byType[c.blockType] = (byType[c.blockType] ?? 0) + 1;

console.log(`file: ${target}`);
console.log(`bytes: ${Buffer.byteLength(raw, "utf8")}`);
console.log(`chunks: ${chunks.length}`);
console.log(`block types: ${JSON.stringify(byType)}`);
console.log(`max chunk length: ${maxLen}`);
console.log(`char offset exact match: ${offsetOk ? "OK" : "FAILED"}`);

console.log("\n--- sample chunks ---");
for (const c of chunks.slice(0, 5)) {
  console.log(
    `#${c.ordinal} [${c.blockType}] path="${c.headingPath.join(
      " > ",
    )}" [${c.charStart}..${c.charEnd}]`,
  );
  console.log("   " + c.content.replace(/\n/g, "\\n").slice(0, 90));
}

if (!offsetOk) process.exit(1);
