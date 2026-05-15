// Trace what spliceXlsxImages produces for a given xlsx.
import { loadSource } from "../lib/common";
import { runPandocWasm } from "../lib/pandoc";
import { spliceXlsxImages } from "../lib/xlsx";

const path = process.argv[2] ?? "fixtures/xlsx/example.xlsx";
const src = await loadSource(path);
const r = await runPandocWasm(src);
console.log("=== PANDOC OUTPUT ===");
console.log(r.markdown);
console.log("=== AFTER SPLICE ===");
const s = await spliceXlsxImages(r.markdown, src);
console.log(s.markdown);
console.log(`\n=== IMAGES (${s.images.length}) ===`);
for (const im of s.images) {
  console.log(`  ${im.id}  context=${im.context}`);
}
