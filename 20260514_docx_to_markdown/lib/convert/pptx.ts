import { runPandoc } from "../pandoc";
import { runOfficeparser } from "../officeparser";
import { runGeminiPdf } from "../gemini-pdf";
import { runMarkitdown } from "../markitdown";
import { runPandocWasm } from "../pandoc-wasm";
import type { Backend } from "../types";

const pandocPptx: Backend = {
  name: "pandoc",
  supports: ["pptx"],
  async convert(inputPath, format) {
    const r = await runPandoc(inputPath, format);
    return { markdown: r.markdown, images: r.images, cleanup: r.cleanup };
  },
};

const officeparserPptx: Backend = {
  name: "officeparser",
  supports: ["pptx"],
  async convert(inputPath, format) {
    return runOfficeparser(inputPath, format);
  },
};

const geminiPdfPptx: Backend = {
  name: "gemini-pdf",
  supports: ["pptx"],
  async convert(inputPath, format) {
    return runGeminiPdf(inputPath, format);
  },
};

const markitdownPptx: Backend = {
  name: "markitdown",
  supports: ["pptx"],
  async convert(inputPath, format) {
    return runMarkitdown(inputPath, format);
  },
};

const pandocWasmPptx: Backend = {
  name: "pandoc-wasm",
  supports: ["pptx"],
  async convert(inputPath, format) {
    return runPandocWasm(inputPath, format);
  },
};

export const PPTX_BACKENDS: readonly Backend[] = [
  pandocPptx,
  pandocWasmPptx,
  officeparserPptx,
  geminiPdfPptx,
  markitdownPptx,
];
