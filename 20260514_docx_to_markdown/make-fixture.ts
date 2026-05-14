import { deflateSync } from "node:zlib";
import JSZip from "jszip";
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
  TextRun,
} from "docx";

// The `docx` npm package emits paragraph style definitions that don't match
// what pandoc looks for when deciding "is this a Heading paragraph?". The
// gaps observed:
//   (a) No <w:style w:styleId="Normal"> defined, even though Heading[N] use
//       basedOn="Normal" — pandoc fails to follow the chain.
//   (b) Heading style name is "Heading 1" (capital H), Word/pandoc emit
//       "heading 1" (lowercase).
//   (c) No <w:outlineLvl> in the Heading <w:pPr>.
// We post-process the zip to plug those gaps. Purely a fixture concern.
async function patchHeadingStyles(buf: Buffer | Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buf);
  const stylesFile = zip.file("word/styles.xml");
  if (!stylesFile) return new Uint8Array(buf);
  let xml = await stylesFile.async("text");

  // (a) Inject a minimal Normal paragraph style if it isn't already defined.
  if (!/w:styleId="Normal"/.test(xml)) {
    const normalDef =
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
      '<w:name w:val="Normal"/><w:qFormat/></w:style>';
    xml = xml.replace(
      /<\/w:docDefaults>/,
      `</w:docDefaults>${normalDef}`,
    );
  }

  // (b) + (c) Patch each Heading[N] style definition.
  xml = xml.replace(
    /<w:style w:type="paragraph" w:styleId="Heading(\d+)">([\s\S]*?)<\/w:style>/g,
    (_full, levelStr: string, inner: string) => {
      const level = parseInt(levelStr, 10);
      let patched = inner.replace(
        /<w:name w:val="Heading (\d+)"\/>/,
        (_m, n) => `<w:name w:val="heading ${n}"/>`,
      );
      if (!/<w:pPr\b/.test(patched)) {
        const insertion = `<w:pPr><w:outlineLvl w:val="${level - 1}"/></w:pPr>`;
        patched = patched.replace(/<w:qFormat\/>/, `<w:qFormat/>${insertion}`);
        if (!patched.includes(insertion)) patched = patched + insertion;
      }
      return `<w:style w:type="paragraph" w:styleId="Heading${levelStr}">${patched}</w:style>`;
    },
  );

  zip.file("word/styles.xml", xml);
  return await zip.generateAsync({ type: "uint8array" });
}

function crc32(buf: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length);
  const typeBuf = new TextEncoder().encode(type);
  const crcInput = new Uint8Array(typeBuf.length + data.length);
  crcInput.set(typeBuf, 0);
  crcInput.set(data, typeBuf.length);
  const crcVal = crc32(crcInput);
  const crcBuf = new Uint8Array(4);
  new DataView(crcBuf.buffer).setUint32(0, crcVal);
  const out = new Uint8Array(4 + typeBuf.length + data.length + 4);
  out.set(len, 0);
  out.set(typeBuf, 4);
  out.set(data, 4 + typeBuf.length);
  out.set(crcBuf, 4 + typeBuf.length + data.length);
  return out;
}

function makePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10..12 already zero

  const rowBytes = width * 4 + 1;
  const raw = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const off = y * rowBytes + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const idat = deflateSync(raw);

  const ihdrChunk = pngChunk("IHDR", ihdr);
  const idatChunk = pngChunk("IDAT", new Uint8Array(idat));
  const iendChunk = pngChunk("IEND", new Uint8Array(0));

  const total =
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const out = new Uint8Array(total);
  let off = 0;
  out.set(signature, off); off += signature.length;
  out.set(ihdrChunk, off); off += ihdrChunk.length;
  out.set(idatChunk, off); off += idatChunk.length;
  out.set(iendChunk, off);
  return out;
}

// 5 colored vertical bars on a white background with different heights — a
// pseudo bar chart that Gemini should describe as a colored bar chart.
function makeBarChartPng(): Uint8Array {
  const W = 300;
  const H = 180;
  const margin = 20;
  const bars = [
    { color: [220, 60, 60] as const, h: 130 },
    { color: [240, 170, 60] as const, h: 95 },
    { color: [80, 170, 80] as const, h: 150 },
    { color: [60, 130, 220] as const, h: 70 },
    { color: [150, 80, 200] as const, h: 110 },
  ];
  const usableW = W - margin * 2;
  const barWidth = Math.floor(usableW / (bars.length * 1.5));
  const gap = Math.floor((usableW - barWidth * bars.length) / (bars.length + 1));
  return makePng(W, H, (x, y) => {
    // axes
    if (x === margin && y >= margin && y <= H - margin) return [40, 40, 40, 255];
    if (y === H - margin && x >= margin && x <= W - margin) return [40, 40, 40, 255];
    // bars
    for (let i = 0; i < bars.length; i++) {
      const bx = margin + gap + i * (barWidth + gap);
      const by = H - margin - bars[i]!.h;
      if (x >= bx && x < bx + barWidth && y >= by && y < H - margin) {
        const c = bars[i]!.color;
        return [c[0], c[1], c[2], 255];
      }
    }
    return [255, 255, 255, 255];
  });
}

async function main() {
  const pngBytes = makeBarChartPng();

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: ["商品名", "数量", "単価", "合計"].map(
          (h) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: h, bold: true })],
                }),
              ],
            }),
        ),
      }),
      ...[
        ["りんご", "3", "150", "450"],
        ["バナナ", "5", "100", "500"],
        ["みかん", "8", "80", "640"],
      ].map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ text: cell })],
                }),
            ),
          }),
      ),
    ],
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("月次売上レポート")],
          }),
          new Paragraph({
            children: [
              new TextRun(
                "このドキュメントは docx → markdown 変換のテスト用に作成されたサンプルです。表と画像を含みます。",
              ),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("売上一覧")],
          }),
          table,
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("売上グラフ")],
          }),
          new Paragraph({
            children: [
              new ImageRun({
                type: "png",
                data: pngBytes,
                transformation: { width: 300, height: 180 },
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun(
                "上のグラフは各商品の売上を示しています。詳細は表を参照してください。",
              ),
            ],
          }),
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  const patched = await patchHeadingStyles(buf);
  await Bun.write("fixtures/docx/sample.docx", patched);
  console.log(`wrote fixtures/docx/sample.docx (${patched.length} bytes)`);
}

main();
