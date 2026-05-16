// Parser-only fixture sweep (no Gemini, no disk writes). Useful for verifying
// new test inputs parse cleanly end-to-end.
import { loadSource } from "../lib/common";
import { runPandocWasm } from "../lib/pandoc";
import { spliceXlsxImages } from "../lib/xlsx";

const paths = [
  "fixtures/docx/sample.docx",
  "fixtures/xlsx/example.xlsx",
  "fixtures/pptx/sample.pptx",
];

for (const p of paths) {
  try {
    const src = await loadSource(p);
    const r = await runPandocWasm(src);
    let imgs = r.images.length;
    let mdLen = r.markdown.length;
    if (src.format === "xlsx") {
      const sp = await spliceXlsxImages(r.markdown, src);
      imgs += sp.images.length;
      mdLen = sp.markdown.length;
    }
    console.log(`OK   ${p.padEnd(45)} → ${mdLen.toString().padStart(7)} chars, ${imgs} image(s)`);
  } catch (e: any) {
    console.log(`FAIL ${p}: ${e.message ?? e}`);
  }
}
