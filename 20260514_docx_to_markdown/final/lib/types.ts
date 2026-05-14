import type JSZip from "jszip";

export type Format = "docx" | "xlsx" | "pptx";

// Input file loaded once: every backend stage reuses the same bytes / zip
// instance instead of re-reading from disk.
export type Source = {
  path: string;
  format: Format;
  bytes: ArrayBuffer;
  zip: JSZip;
};

export type Image = {
  id: string;
  pattern: RegExp;
  mimeType: string;
  base64: string;
  filename: string;
  // "inline" keeps the rendered markdown flat (no newlines / blockquote) so
  // it survives inside a GFM table cell. Default is "block".
  context?: "block" | "inline";
};
