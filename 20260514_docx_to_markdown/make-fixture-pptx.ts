// Generate a pptx fixture with multiple slides, text, a table, and embedded
// images (a generated bar chart PNG and a pie chart PNG).

import pptxgen from "pptxgenjs";
import { barChartPng, piePng } from "./lib/png";

async function main() {
  const pres = new pptxgen();
  pres.author = "til-fixture";
  pres.title = "月次売上レポート (pptx fixture)";

  // --- Slide 1: title ---
  const s1 = pres.addSlide();
  s1.addText("月次売上レポート", {
    x: 0.5, y: 0.5, w: 9, h: 1,
    fontSize: 36, bold: true,
  });
  s1.addText("docx/xlsx/pptx → markdown 変換テスト用 pptx fixture", {
    x: 0.5, y: 1.5, w: 9, h: 0.6, fontSize: 16,
  });

  // --- Slide 2: table ---
  const s2 = pres.addSlide();
  s2.addText("売上一覧", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
  s2.addTable(
    [
      [
        { text: "商品名", options: { bold: true } },
        { text: "数量", options: { bold: true } },
        { text: "単価", options: { bold: true } },
        { text: "合計", options: { bold: true } },
      ],
      ["りんご", "3", "150", "450"],
      ["バナナ", "5", "100", "500"],
      ["みかん", "8", "80", "640"],
    ],
    { x: 0.5, y: 1.2, w: 9, fontSize: 16 },
  );

  // --- Slide 3: bar chart image ---
  const s3 = pres.addSlide();
  s3.addText("売上グラフ", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
  s3.addImage({
    data: `data:image/png;base64,${Buffer.from(barChartPng()).toString("base64")}`,
    x: 1, y: 1.2, w: 5, h: 3,
  });
  s3.addText("各商品の売上を示しています。", {
    x: 0.5, y: 4.5, w: 9, h: 0.5, fontSize: 14,
  });

  // --- Slide 4: pie chart image ---
  const s4 = pres.addSlide();
  s4.addText("構成比", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
  s4.addImage({
    data: `data:image/png;base64,${Buffer.from(piePng()).toString("base64")}`,
    x: 2, y: 1.2, w: 4, h: 4,
  });

  await pres.writeFile({ fileName: "fixtures/pptx/sample.pptx" });
  console.log("wrote fixtures/pptx/sample.pptx");
}

main();
