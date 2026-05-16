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
  // Unique sentinel placed in the markdown where the caption will land.
  // Replaced verbatim via String.prototype.replaceAll in the output stage.
  marker: string;
  mimeType: string;
  base64: string;
  filename: string;
  // "inline" keeps the rendered markdown flat (no newlines / blockquote) so
  // it survives inside a GFM table cell. Default is "block".
  context?: "block" | "inline";
};
