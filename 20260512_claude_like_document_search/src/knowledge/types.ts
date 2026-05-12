export type DocType =
  | "spec"
  | "report"
  | "minutes"
  | "proposal"
  | "faq"
  | "contract"
  | "unknown";

export type BlockType = "heading" | "paragraph" | "list" | "table" | "code" | "unknown";

export type DocumentRow = {
  id: string;
  path: string;
  title: string | null;
  doc_type: string | null;
  summary: string | null;
};

export type BlockRow = {
  id: number;
  document_id: string;
  block_index: number;
  heading_path: string[];
  block_type: string;
  text: string;
};

export type ListDocumentsInput = {
  pathPrefix?: string;
  docType?: string[];
  limit?: number;
};

export type ListDocumentsOutput = {
  documents: {
    documentId: string;
    path: string;
    title?: string;
    docType?: string;
    summary?: string;
  }[];
};

export type SearchDocumentsInput = {
  query: string;
  docType?: string[];
  limit?: number;
};

export type SearchDocumentsOutput = {
  documents: {
    documentId: string;
    path: string;
    title?: string;
    docType?: string;
    summary?: string;
    score: number;
    matchedFields: ("path" | "title" | "summary")[];
  }[];
};

export type GrepBlocksInput = {
  pattern: string;
  mode?: "literal" | "regex";
  documentIds?: string[];
  docType?: string[];
  target?: ("heading" | "body")[];
  caseSensitive?: boolean;
  contextBlocks?: number;
  limit?: number;
};

export type GrepBlocksOutput = {
  hits: {
    documentId: string;
    path: string;
    title?: string;
    docType?: string;
    blockIndex: number;
    blockType: string;
    headingPath: string[];
    snippet: string;
    score: number;
    matchedFields: ("heading" | "body")[];
  }[];
};

export type ReadBlocksInput = {
  documentId: string;
  startBlockIndex: number;
  limitBlocks?: number;
};

export type ReadBlocksOutput = {
  documentId: string;
  path: string;
  title?: string;
  docType?: string;
  blocks: {
    blockIndex: number;
    blockType: string;
    headingPath: string[];
    text: string;
  }[];
};

export type SearchKnowledgeInput = {
  question: string;
  preferredDocType?: string[];
};

export type Evidence = {
  path: string;
  title?: string;
  docType?: string;
  headingPath: string[];
  blockStartIndex: number;
  blockEndIndex: number;
  quote: string;
  relevance: "high" | "medium" | "low";
  reason: string;
};

export type SearchKnowledgeOutput = {
  status: "found" | "partial" | "not_found";
  searchedQueries: string[];
  evidences: Evidence[];
  notes?: string;
};
