import { deflateSync } from "node:zlib";

function crc32(buf: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
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

export function makePng(
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

// A small recognisable image: 5 colored vertical bars (pseudo bar chart).
export function barChartPng(): Uint8Array {
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
    if (x === margin && y >= margin && y <= H - margin)
      return [40, 40, 40, 255];
    if (y === H - margin && x >= margin && x <= W - margin)
      return [40, 40, 40, 255];
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

// A circular pie-like 3-slice image (red / green / blue thirds).
export function piePng(): Uint8Array {
  const W = 240;
  const H = 240;
  const cx = W / 2;
  const cy = H / 2;
  const r = 100;
  return makePng(W, H, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > r) return [255, 255, 255, 255];
    let theta = Math.atan2(dy, dx) + Math.PI; // 0..2π
    const slice = Math.floor((theta / (2 * Math.PI)) * 3); // 0,1,2
    if (slice === 0) return [220, 60, 60, 255];
    if (slice === 1) return [80, 170, 80, 255];
    return [60, 130, 220, 255];
  });
}
