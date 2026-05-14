export type Format = "docx" | "xlsx" | "pptx";

export type Image = {
  id: string;        // stable id used in the description map
  pattern: RegExp;   // regex (global) that finds this image's reference(s) in markdown
  mimeType: string;
  base64: string;
  filename: string;  // basename used when writing the image to <output>.media/
  // "block" (default): rendered as a paragraph with the markdown image syntax.
  // "inline": rendered without surrounding newlines, so it survives inside a
  //   GFM table cell.
  context?: "block" | "inline";
};

export type Conversion = {
  markdown: string;
  images: Image[];
  notes?: string[];
  cleanup?: () => Promise<void>;
};

export type Backend = {
  name: string;
  supports: readonly Format[];
  convert: (inputPath: string, format: Format) => Promise<Conversion>;
};
