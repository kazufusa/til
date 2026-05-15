// Find images whose pattern matches the pandoc output more than once.
import { loadSource } from "../lib/common";
import { runPandocWasm } from "../lib/pandoc";

const path = process.argv[2] ?? "fixtures/pptx/050620keieizyogen.pptx";
const src = await loadSource(path);
const { markdown, images } = await runPandocWasm(src);
const failures: { filename: string; matches: number }[] = [];
for (const img of images) {
  const fresh = new RegExp(img.pattern.source, "g");
  const matches = markdown.match(fresh)?.length ?? 0;
  if (matches !== 1) failures.push({ filename: img.filename, matches });
}
console.log(`${images.length} images, ${failures.length} mismatched:`);
for (const f of failures.slice(0, 10)) console.log(`  ${f.filename}: ${f.matches} matches`);
