// Find images whose marker doesn't appear exactly once in the pandoc output.
// More than one means pandoc emitted the same image twice; zero means our
// marker insertion failed (and would silently drop the image).
import { loadSource } from "../lib/common";
import { runPandocWasm } from "../lib/pandoc";

const path = process.argv[2] ?? "fixtures/pptx/050620keieizyogen.pptx";
const src = await loadSource(path);
const { markdown, images } = await runPandocWasm(src);
const failures: { filename: string; matches: number }[] = [];
for (const img of images) {
  const matches = markdown.split(img.marker).length - 1;
  if (matches !== 1) failures.push({ filename: img.filename, matches });
}
console.log(`${images.length} images, ${failures.length} mismatched:`);
for (const f of failures.slice(0, 10)) console.log(`  ${f.filename}: ${f.matches} matches`);
