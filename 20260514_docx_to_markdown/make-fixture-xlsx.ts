// Generate an xlsx fixture with a table, an embedded image (bar chart PNG),
// and a second sheet containing a pie chart image — enough to exercise the
// "image and graph" code paths in the converter.

import ExcelJS from "exceljs";
import { barChartPng, piePng } from "./lib/png";

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "til-fixture";
  wb.created = new Date(2026, 4, 14);

  // --- Sheet 1: 売上一覧 + bar chart image ---
  const s1 = wb.addWorksheet("売上一覧");
  s1.columns = [
    { header: "商品名", key: "name", width: 12 },
    { header: "数量", key: "qty", width: 10 },
    { header: "単価", key: "price", width: 10 },
    { header: "合計", key: "total", width: 12 },
  ];
  s1.getRow(1).font = { bold: true };
  for (const row of [
    { name: "りんご", qty: 3, price: 150, total: 450 },
    { name: "バナナ", qty: 5, price: 100, total: 500 },
    { name: "みかん", qty: 8, price: 80, total: 640 },
  ]) {
    s1.addRow(row);
  }

  // bar chart embedded as image (real Office charts are XML-only and a pain;
  // a pre-rendered image is closer to what a typical xlsx export contains)
  const barId = wb.addImage({
    buffer: Buffer.from(barChartPng()),
    extension: "png",
  });
  s1.addImage(barId, {
    tl: { col: 0, row: 6 },
    ext: { width: 300, height: 180 },
  });

  // --- Sheet 2: 構成比 + pie chart image ---
  const s2 = wb.addWorksheet("構成比");
  s2.columns = [
    { header: "区分", key: "kind", width: 14 },
    { header: "割合(%)", key: "ratio", width: 10 },
  ];
  s2.getRow(1).font = { bold: true };
  for (const row of [
    { kind: "個人", ratio: 45 },
    { kind: "法人", ratio: 35 },
    { kind: "その他", ratio: 20 },
  ]) {
    s2.addRow(row);
  }
  const pieId = wb.addImage({
    buffer: Buffer.from(piePng()),
    extension: "png",
  });
  s2.addImage(pieId, {
    tl: { col: 3, row: 0 },
    ext: { width: 240, height: 240 },
  });

  await wb.xlsx.writeFile("fixtures/xlsx/sample.xlsx");
  console.log(`wrote fixtures/xlsx/sample.xlsx`);
}

main();
