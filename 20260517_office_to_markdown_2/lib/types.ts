export type Format = "docx" | "xlsx" | "pptx";

export type Image = {
  filename: string;
  mimeType: string;
  base64: string;
};

export type Conversion = {
  markdown: string;
  images: Image[];
  notes?: string[];
};
