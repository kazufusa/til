import mammoth from "mammoth";
import { runPandoc } from "../pandoc";
import { runOfficeparser } from "../officeparser";
import { runGeminiPdf } from "../gemini-pdf";
import { runMarkitdown } from "../markitdown";
import { runPandocWasm } from "../pandoc-wasm";
import type { Backend, Image } from "../types";

const pandocDocx: Backend = {
  name: "pandoc",
  supports: ["docx"],
  async convert(inputPath, format) {
    const r = await runPandoc(inputPath, format);
    return { markdown: r.markdown, images: r.images, cleanup: r.cleanup };
  },
};

const mammothMd: Backend = {
  name: "mammoth-md",
  supports: ["docx"],
  async convert(inputPath) {
    const buffer = Buffer.from(await Bun.file(inputPath).arrayBuffer());
    const images: Image[] = [];
    let i = 0;
    const result = await mammoth.convertToMarkdown(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const id = `img_${i++}`;
          const ext = mammothExt(image.contentType);
          const filename = `${id}.${ext}`;
          const base64 = await image.read("base64");
          images.push({
            id,
            pattern: new RegExp(`!\\[[^\\]]*\\]\\(placeholder:${id}\\)`, "g"),
            mimeType: image.contentType,
            base64,
            filename,
          });
          return { src: `placeholder:${id}`, alt: id };
        }),
      },
    );
    return {
      markdown: result.value,
      images,
      notes: result.messages.map((m) => `[mammoth] ${m.type}: ${m.message}`),
    };
  },
};

const mammothHtml: Backend = {
  name: "mammoth-html",
  supports: ["docx"],
  async convert(inputPath) {
    const buffer = Buffer.from(await Bun.file(inputPath).arrayBuffer());
    const images: Image[] = [];
    let i = 0;
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const id = `img_${i++}`;
          const ext = mammothExt(image.contentType);
          const filename = `${id}.${ext}`;
          const base64 = await image.read("base64");
          images.push({
            id,
            pattern: new RegExp(
              `<img\\b[^>]*\\bsrc="placeholder:${id}"[^>]*/?>`,
              "g",
            ),
            mimeType: image.contentType,
            base64,
            filename,
          });
          return { src: `placeholder:${id}`, alt: id };
        }),
      },
    );
    return {
      markdown: prettifyBlocks(result.value),
      images,
      notes: result.messages.map((m) => `[mammoth] ${m.type}: ${m.message}`),
    };
  },
};

const officeparserDocx: Backend = {
  name: "officeparser",
  supports: ["docx"],
  async convert(inputPath, format) {
    return runOfficeparser(inputPath, format);
  },
};

const geminiPdfDocx: Backend = {
  name: "gemini-pdf",
  supports: ["docx"],
  async convert(inputPath, format) {
    return runGeminiPdf(inputPath, format);
  },
};

const markitdownDocx: Backend = {
  name: "markitdown",
  supports: ["docx"],
  async convert(inputPath, format) {
    return runMarkitdown(inputPath, format);
  },
};

const pandocWasmDocx: Backend = {
  name: "pandoc-wasm",
  supports: ["docx"],
  async convert(inputPath, format) {
    return runPandocWasm(inputPath, format);
  },
};

function mammothExt(contentType: string): string {
  return (contentType.split("/")[1] ?? "bin").replace(/\+xml$/, "");
}

function prettifyBlocks(html: string): string {
  return (
    html
      .replace(
        /<\/(h[1-6]|p|table|tr|li|ul|ol|blockquote|div|section)>/gi,
        "</$1>\n",
      )
      .replace(
        /(<(h[1-6]|table|tr|ul|ol|blockquote|div|section)\b[^>]*>)/gi,
        "\n$1",
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

export const DOCX_BACKENDS: readonly Backend[] = [
  pandocDocx,
  pandocWasmDocx,
  mammothMd,
  mammothHtml,
  officeparserDocx,
  geminiPdfDocx,
  markitdownDocx,
];
