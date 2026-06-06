import { readFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { Data, Effect, Schedule } from "effect";
import { createVertex } from "@ai-sdk/google-vertex";
import {
  APICallError,
  generateObject,
  generateText,
  NoObjectGeneratedError,
} from "ai";
import { z } from "zod";

// ----------------------------------------------------------------------------
// 設定: env で上書き可能 (Vertex AI 経由 = Project ID + ADC)
// ----------------------------------------------------------------------------
const PROJECT = process.env.GOOGLE_VERTEX_PROJECT;
const LOCATION = process.env.GOOGLE_VERTEX_LOCATION ?? "us-central1";
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
const IMAGE_SIZE_MB = Number(process.env.IMAGE_SIZE_MB ?? "25");
// "text":     壊れた(ゼロ埋め)でかい画像 → 画像不正の API エラー
// "size":     有効な大 PNG(乱数ノイズ) → 純粋なサイズ超過エラー
// "file":     実ファイル(意味のある画像)を送って通常応答を見る
// "bigfile":  意味のある実画像を巨大化(拡大+無圧縮)して送る
// "pdf":      多ページ PDF を送る(PAGES でページ数。画像と違いページ数で頭打ち)
// "object":   スキーマ出力を要求し、守れないと NoObjectGeneratedError
const MODE = process.env.MODE ?? "text";
// file モードで送る実画像。既定はリポジトリ内の実データ可視化チャート。
const IMAGE_PATH =
  process.env.IMAGE_PATH ??
  new URL("../../20170724_pro_shogi_bayes_2/rating-skill.png", import.meta.url)
    .pathname;
// object モードでスキーマ違反(NoObjectGeneratedError)時の再生成回数。
// SDK は APICallError しか自動リトライしないので、ここだけ自前で再生成する。
const SCHEMA_RETRIES = Number(process.env.SCHEMA_RETRIES ?? "3");

// ----------------------------------------------------------------------------
// タグ付きエラー: 種類ごとに分けて持つ
// ----------------------------------------------------------------------------
class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly message: string;
}> {}

// ① 出力(スキーマ)を守れない: HTTP は成功だが中身が不正
class OutputSchemaError extends Data.TaggedError("OutputSchemaError")<{
  readonly message: string;
  readonly text: string | undefined; // モデルが実際に吐いた生テキスト
  readonly finishReason: string | undefined;
}> {}

// ② サイズ超過: 413、または 400 でも本文が size 超過パターン
class PayloadTooLargeError extends Data.TaggedError("PayloadTooLargeError")<{
  readonly statusCode: number | undefined;
  readonly url: string | undefined;
  readonly responseBody: string | undefined;
  readonly message: string;
}> {}

// ③ その他の API エラー(画像不正・認証・レート等)
class ApiError extends Data.TaggedError("ApiError")<{
  readonly statusCode: number | undefined;
  readonly url: string | undefined;
  readonly responseBody: string | undefined;
  readonly isRetryable: boolean | undefined;
  readonly message: string;
}> {}

class UnknownError extends Data.TaggedError("UnknownError")<{
  readonly message: string;
}> {}

// ----------------------------------------------------------------------------
// 例外 → タグ付きエラーへの分類器
//   Gemini は 400 系を全部 INVALID_ARGUMENT に潰すので、サイズ超過は
//   statusCode(413) か responseBody/message の文字列で見分けるしかない。
// ----------------------------------------------------------------------------
const SIZE_PATTERN =
  /payload size exceeds|exceeds the (maximum|limit)|request entity too large|too large/i;

const classify = (error: unknown) => {
  if (NoObjectGeneratedError.isInstance(error)) {
    return new OutputSchemaError({
      message: error.message,
      text: error.text,
      finishReason: error.finishReason,
    });
  }
  if (APICallError.isInstance(error)) {
    const haystack = `${error.message} ${error.responseBody ?? ""}`;
    if (error.statusCode === 413 || SIZE_PATTERN.test(haystack)) {
      return new PayloadTooLargeError({
        statusCode: error.statusCode,
        url: error.url,
        responseBody: error.responseBody,
        message: error.message,
      });
    }
    return new ApiError({
      statusCode: error.statusCode,
      url: error.url,
      responseBody: error.responseBody,
      isRetryable: error.isRetryable,
      message: error.message,
    });
  }
  return new UnknownError({ message: String(error) });
};

// ----------------------------------------------------------------------------
// 合成画像 / モデル
// ----------------------------------------------------------------------------
// 壊れた画像: ゼロ埋め。デコードできないので「画像不正」になる。
const makeOversizedImage = (sizeMB: number) =>
  Effect.sync(() => {
    const bytes = new Uint8Array(sizeMB * 1024 * 1024);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // PNG sig
    return bytes;
  });

// --- 正規 PNG エンコーダ (依存無し, node:zlib のみ) -------------------------
const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// length(4) + type(4) + data + crc(4)。crc は type+data に掛ける。
const pngChunk = (type: string, data: Uint8Array) => {
  const body = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i);
  body.set(data, 4);
  const out = new Uint8Array(4 + body.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(body, 4);
  dv.setUint32(out.length - 4, crc32(body));
  return out;
};

// --- PNG デコード (8bit / 非インターレース / colortype 0,2,4,6) --------------
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

type DecodedPng = {
  width: number;
  height: number;
  colorType: number;
  channels: number;
  pixels: Uint8Array; // フィルタ除去済みの生画素 (height*width*channels)
};

const decodePng = (bytes: Uint8Array): DecodedPng => {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIG[i]) throw new Error("PNG シグネチャ不正");
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idatParts: Uint8Array[] = [];
  while (i < bytes.length) {
    const len = dv.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    const data = bytes.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      width = dv.getUint32(i + 8);
      height = dv.getUint32(i + 12);
      const bitDepth = bytes[i + 16];
      colorType = bytes[i + 17];
      const interlace = bytes[i + 20];
      if (bitDepth !== 8) throw new Error(`bitDepth=${bitDepth} は非対応`);
      if (interlace !== 0) throw new Error("interlace は非対応");
      if (!CHANNELS[colorType]) throw new Error(`colorType=${colorType} は非対応`);
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      break;
    }
    i += 12 + len;
  }
  const ch = CHANNELS[colorType];
  const merged = new Uint8Array(idatParts.reduce((n, p) => n + p.length, 0));
  let mp = 0;
  for (const p of idatParts) {
    merged.set(p, mp);
    mp += p.length;
  }
  const raw = new Uint8Array(inflateSync(merged));
  const stride = width * ch;
  const out = new Uint8Array(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[pos++];
      const a = x >= ch ? out[row + x - ch] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= ch && y > 0 ? out[prev + x - ch] : 0;
      let val: number;
      switch (filter) {
        case 1: val = v + a; break;
        case 2: val = v + b; break;
        case 3: val = v + ((a + b) >> 1); break;
        case 4: val = v + paeth(a, b, c); break;
        default: val = v; // 0 = None
      }
      out[row + x] = val & 0xff;
    }
  }
  return { width, height, colorType, channels: ch, pixels: out };
};

// 最近傍で拡大した画素を返す
const upscaleNearest = (
  src: DecodedPng,
  outW: number,
  outH: number,
): Uint8Array => {
  const ch = src.channels;
  const out = new Uint8Array(outW * outH * ch);
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(src.height - 1, (y * src.height / outH) | 0);
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(src.width - 1, (x * src.width / outW) | 0);
      const s = (sy * src.width + sx) * ch;
      const d = (y * outW + x) * ch;
      for (let k = 0; k < ch; k++) out[d + k] = src.pixels[s + k];
    }
  }
  return out;
};

// 生画素を無圧縮(deflate level 0)で PNG 化 → 実バイトが画素数に比例して巨大化
const encodePngStored = (
  width: number,
  height: number,
  colorType: number,
  pixels: Uint8Array,
): Uint8Array => {
  const ch = CHANNELS[colorType];
  const stride = width * ch;
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0; // filter: None
    raw.set(pixels.subarray(y * stride, y * stride + stride), y * (1 + stride) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const idat = new Uint8Array(deflateSync(raw, { level: 0 })); // 無圧縮
  const chunks = [
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const png = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    png.set(c, p);
    p += c.length;
  }
  return png;
};

// 意味のある実画像を読み込み、目標バイト数まで拡大して無圧縮 PNG 化する。
// 中身は本物の画像のまま、実バイトだけ巨大化できる。
const makeBigMeaningfulImage = (path: string, targetMB: number) =>
  Effect.try({
    try: () => {
      const src = decodePng(new Uint8Array(readFileSync(path)));
      const targetBytes = targetMB * 1024 * 1024;
      // 無圧縮 PNG ≈ H*(1+W*ch) ≈ ch*W*H。拡大率 s で W,H を s 倍する。
      const base = src.channels * src.width * src.height;
      const s = Math.max(1, Math.sqrt(targetBytes / base));
      const outW = Math.max(src.width, Math.round(src.width * s));
      const outH = Math.max(src.height, Math.round(src.height * s));
      const pixels =
        outW === src.width && outH === src.height
          ? src.pixels
          : upscaleNearest(src, outW, outH);
      const png = encodePngStored(outW, outH, src.colorType, pixels);
      return { png, outW, outH, srcW: src.width, srcH: src.height };
    },
    catch: (e) =>
      new ConfigError({ message: `巨大化に失敗: ${path}: ${String(e)}` }),
  });

// 有効な大 PNG。ノイズで埋めて deflate が縮められないようにし、実サイズを稼ぐ。
const makeValidPng = (targetMB: number) =>
  Effect.sync(() => {
    const width = 2048;
    const rowBytes = 1 + width * 3; // filter byte + RGB
    const height = Math.ceil((targetMB * 1024 * 1024) / rowBytes);

    const raw = new Uint8Array(height * rowBytes);
    // 暗号乱数で埋める = deflate が縮められない → 実サイズを確保する。
    // crypto.getRandomValues は 1 回 65536 バイトまでなので分割して埋める。
    for (let off = 0; off < raw.length; off += 65536) {
      crypto.getRandomValues(raw.subarray(off, Math.min(off + 65536, raw.length)));
    }
    for (let y = 0; y < height; y++) raw[y * rowBytes] = 0; // filter: None

    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width);
    dv.setUint32(4, height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type: RGB
    // [10..12] = 0: compression / filter / interlace

    const idat = new Uint8Array(deflateSync(raw));
    const chunks = [
      PNG_SIG,
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", idat),
      pngChunk("IEND", new Uint8Array(0)),
    ];
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const png = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
      png.set(c, pos);
      pos += c.length;
    }
    return png;
  });

// --- 多ページ PDF を手組み (依存無し) --------------------------------------
// 画像と違い PDF は 1 ページずつ処理されるので、ページ数を増やすと Gemini の
// ページ上限/トークン上限に当たる。サイズではなくページ数で頭打ちになる例。
const TEXT_ENC = new TextEncoder();
const makePdf = (pages: number) =>
  Effect.sync(() => {
    const objs: string[] = []; // 1-based 番号でアクセス
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    const kids: string[] = [];
    for (let p = 0; p < pages; p++) kids.push(`${4 + 2 * p} 0 R`);
    objs[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages} >>`;
    objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    for (let p = 0; p < pages; p++) {
      const pageNum = 4 + 2 * p;
      const contentNum = 5 + 2 * p;
      objs[pageNum] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>`;
      const stream = `BT /F1 24 Tf 72 700 Td (Page ${p + 1} of ${pages}) Tj ET`;
      objs[contentNum] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }
    const count = 3 + 2 * pages;
    let body = "%PDF-1.4\n";
    const offsets = new Array<number>(count + 1).fill(0);
    for (let n = 1; n <= count; n++) {
      offsets[n] = body.length; // 全て ASCII なので文字長=バイト長
      body += `${n} 0 obj\n${objs[n]}\nendobj\n`;
    }
    const xrefOffset = body.length;
    body += `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= count; n++) {
      body += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
    }
    body += `trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return TEXT_ENC.encode(body);
  });

const callPdf = (pdf: Uint8Array) =>
  Effect.tryPromise({
    try: () =>
      generateText({
        model: model(),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "このPDFの内容を一言で要約してください。" },
              { type: "file", data: pdf, mediaType: "application/pdf" },
            ],
          },
        ],
      }).then((r) => r.text),
    catch: classify,
  });

// 実ファイルを読み込む。拡張子から mediaType を決める。
const mediaTypeOf = (path: string) => {
  switch (path.toLowerCase().split(".").pop()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/png";
  }
};

const loadImage = (path: string) =>
  Effect.try({
    try: () => new Uint8Array(readFileSync(path)),
    catch: (e) =>
      new ConfigError({ message: `画像の読み込みに失敗: ${path}: ${String(e)}` }),
  });

const model = () => createVertex({ project: PROJECT, location: LOCATION })(MODEL);

// 画像を 1 枚送って応答テキストを得る(失敗は classify でタグ付け)。
const callText = (image: Uint8Array, mediaType: string) =>
  Effect.tryPromise({
    try: () =>
      generateText({
        model: model(),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "この画像には何が写っていますか?" },
              { type: "image", image, mediaType },
            ],
          },
        ],
      }).then((r) => r.text),
    catch: classify,
  });

// object モード(1回分): スキーマ出力を要求 → 守れないと NoObjectGeneratedError
const callObjectOnce = () =>
  Effect.tryPromise({
    try: () =>
      generateObject({
        model: model(),
        schema: z.object({
          summary: z.string(),
          tags: z.array(z.string()),
        }),
        prompt: "エッフェル塔について summary と tags を返してください。",
      }).then((r) => JSON.stringify(r.object)),
    catch: classify,
  });

// OutputSchemaError のときだけ最大 SCHEMA_RETRIES 回まで再生成する Schedule。
// recurs で回数を、whileInput で対象エラーを限定(バックオフ無し)。
// それ以外(ApiError 等)は whileInput が false → 即停止 = リトライしない。
// APICallError(429/5xx 等)は SDK が既にリトライ済みなのでここでは触らない。
const schemaRetrySchedule = Schedule.recurs(SCHEMA_RETRIES).pipe(
  Schedule.whileInput((e: { readonly _tag: string }) => e._tag === "OutputSchemaError"),
);

const callObject = () =>
  callObjectOnce().pipe(
    Effect.tapError((e) =>
      e._tag === "OutputSchemaError"
        ? Effect.logWarning("schema violation — 再生成リトライします").pipe(
            Effect.annotateLogs("generatedText", e.text),
          )
        : Effect.void,
    ),
    Effect.retry(schemaRetrySchedule),
  );

// ----------------------------------------------------------------------------
// メイン
// ----------------------------------------------------------------------------
const program = Effect.gen(function* () {
  if (!PROJECT) {
    return yield* new ConfigError({
      message: "GOOGLE_VERTEX_PROJECT (GCP の Project ID) が未設定です",
    });
  }

  yield* Effect.log(
    `setup: project=${PROJECT} location=${LOCATION} model=${MODEL} mode=${MODE}`,
  );

  let output: string;
  if (MODE === "object") {
    output = yield* callObject();
  } else if (MODE === "file") {
    const image = yield* loadImage(IMAGE_PATH);
    yield* Effect.log(
      `画像読込: ${IMAGE_PATH} (${(image.length / 1024 / 1024).toFixed(2)}MB)`,
    );
    output = yield* callText(image, mediaTypeOf(IMAGE_PATH));
  } else if (MODE === "bigfile") {
    const r = yield* makeBigMeaningfulImage(IMAGE_PATH, IMAGE_SIZE_MB);
    yield* Effect.log(
      `巨大化: ${IMAGE_PATH} ${r.srcW}x${r.srcH} → ${r.outW}x${r.outH} ` +
        `(${(r.png.length / 1024 / 1024).toFixed(1)}MB, 無圧縮PNG)`,
    );
    // DUMP=path を指定すると API に送らずファイルに書き出して終了(検証用)
    if (process.env.DUMP) {
      yield* Effect.promise(() => Bun.write(process.env.DUMP!, r.png));
      return yield* Effect.log(`dump: ${process.env.DUMP}`);
    }
    output = yield* callText(r.png, "image/png");
  } else if (MODE === "pdf") {
    const pages = Number(process.env.PAGES ?? "1500");
    const pdf = yield* makePdf(pages);
    yield* Effect.log(
      `PDF生成: ${pages}ページ (${(pdf.length / 1024 / 1024).toFixed(2)}MB)`,
    );
    if (process.env.DUMP) {
      yield* Effect.promise(() => Bun.write(process.env.DUMP!, pdf));
      return yield* Effect.log(`dump: ${process.env.DUMP}`);
    }
    output = yield* callPdf(pdf);
  } else {
    const image = yield* (MODE === "size"
      ? makeValidPng(IMAGE_SIZE_MB)
      : makeOversizedImage(IMAGE_SIZE_MB));
    yield* Effect.log(`画像生成: ${(image.length / 1024 / 1024).toFixed(1)}MB`);
    output = yield* callText(image, "image/png");
  }

  yield* Effect.log("Gemini からの応答").pipe(
    Effect.annotateLogs("output", output),
  );
}).pipe(
  Effect.catchTags({
    ConfigError: (e) => Effect.logError(e.message),
    // ① 出力を守れない(HTTP 成功・中身不正)
    OutputSchemaError: (e) =>
      Effect.logError("output schema violation").pipe(
        Effect.annotateLogs({
          finishReason: e.finishReason,
          generatedText: e.text,
          message: e.message,
        }),
      ),
    // ② サイズ超過
    PayloadTooLargeError: (e) =>
      Effect.logError("payload too large").pipe(
        Effect.annotateLogs({
          status: e.statusCode,
          url: e.url,
          message: e.message,
          responseBody: e.responseBody,
        }),
      ),
    // ③ その他 API エラー
    ApiError: (e) =>
      Effect.logError("gemini api error").pipe(
        Effect.annotateLogs({
          status: e.statusCode,
          url: e.url,
          retryable: e.isRetryable,
          message: e.message,
          responseBody: e.responseBody,
        }),
      ),
    UnknownError: (e) => Effect.logError(e.message),
  }),
);

Effect.runPromise(program);
