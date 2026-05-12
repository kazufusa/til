// ============================================================================
// types.ts — Search Agent / Chat Agent / 4 つの低レベルツールが共有する型定義.
//
// plan.md の I/O 仕様にほぼ 1:1 対応する.
// SDK 側 (zod スキーマ) はこの型と一致するように書くこと.
// ============================================================================

/**
 * 文書種別. plan.md に定義された 7 種類.
 * 現状の ingest 実装は判別ロジックを持たないので、全文書 "unknown" を入れている.
 * 将来的にファイル名/見出しから推定したくなったらここを参照する.
 */
export type DocType =
  | "spec"
  | "report"
  | "minutes"
  | "proposal"
  | "faq"
  | "contract"
  | "unknown";

/**
 * Markdown を block 単位にバラした時の種別.
 * parser.ts が markdown を読みながらこれを付与する.
 * grepBlocks の target 絞り込みで `heading` を別扱いにするため heading は独立カテゴリ.
 */
export type BlockType = "heading" | "paragraph" | "list" | "table" | "code" | "unknown";

// ---- DB 行 (raw) ----------------------------------------------------------
// postgres.js は snake_case をそのまま返すので alias なしの素の行を 1 度だけ定義.
// 公開 API ではキャメルケースにマップする (ListDocumentsOutput など).
// 用途: 内部の SQL 結果型として使う想定 (今は tools.ts でインライン型で書いているので未使用).

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

// ---- listDocuments --------------------------------------------------------
// Claude Code の `ls` 相当. まず全体像を見るためのツール.
// `pathPrefix` は path に対する前方一致 (LIKE), `docType` は OR フィルタ.

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

// ---- searchDocuments ------------------------------------------------------
// path / title / summary に対する曖昧検索 (ILIKE + pg_trgm).
// 本文 (blocks.text) は見ない. summary は要約なので「本文中の事実」を答えに使ってはダメ.

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
    score: number; // pg_trgm similarity の最大値 (path/title/summary のうち)
    matchedFields: ("path" | "title" | "summary")[];
  }[];
};

// ---- grepBlocks -----------------------------------------------------------
// Claude Code の Grep 相当. 本文ブロックに対する検索.
// `mode="literal"` (既定) は ILIKE + similarity、`mode="regex"` は Postgres 正規表現.
// `target` は heading / body の検索対象を絞る (両方デフォルト).
// `contextBlocks` は API 上は受け取るが、現状の実装では未使用 (readBlocks で代替する設計).

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
    /** 先頭から 500 文字までの抜粋。全文は readBlocks で取りに行く設計 */
    snippet: string;
    score: number;
    matchedFields: ("heading" | "body")[];
  }[];
};

// ---- readBlocks -----------------------------------------------------------
// Claude Code の Read 相当. grepBlocks のヒット周辺をまとめて読む.
// 範囲指定は `block_index` ベース. 行番号より「論理的なブロック単位」を採用しているのは
// markdown の見出し配下を意味ある単位で扱いたいため.

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
    /** 抜粋ではなく全文。ここを根拠に最終回答を書く */
    text: string;
  }[];
};

// ---- searchKnowledge (Chat Agent → Search Agent の境界) ------------------
// Chat Agent はこれ 1 つだけツールに渡す. 内部で Search Agent が起動.
// この境界で「探索」と「回答」を分離するのが本プロジェクトの核.

export type SearchKnowledgeInput = {
  question: string;
  /** 探索範囲を絞りたい時のヒント. 未指定なら全文書. */
  preferredDocType?: string[];
};

/**
 * 1 evidence = 1 つの原文確認済み根拠.
 * `quote` は readBlocks で確認した範囲から抜き出す. Search Agent の責務.
 * `relevance` は high / medium / low の 3 段階. プリプロセスで日本語 "高/中/低" や
 * "High" 等も寛容に吸収する (search-agent.ts の normalizeRelevance 参照).
 */
export type Evidence = {
  path: string;
  title?: string;
  docType?: string;
  headingPath: string[];
  /** readBlocks の最初の blockIndex */
  blockStartIndex: number;
  /** readBlocks の最後の blockIndex (含む) */
  blockEndIndex: number;
  quote: string;
  relevance: "high" | "medium" | "low";
  /** なぜこの evidence が質問に関連するかの一行説明 */
  reason: string;
};

export type SearchKnowledgeOutput = {
  /**
   * - `found`     : evidence が十分にある
   * - `partial`   : 一部しか答えられる根拠が無い
   * - `not_found` : 文書内に根拠が無い
   */
  status: "found" | "partial" | "not_found";
  /** Search Agent が試した検索クエリ. デバッグ用 */
  searchedQueries: string[];
  evidences: Evidence[];
  /** meta 情報. 「文書一覧を notes に入れる」など、evidence に乗らない補足はここ */
  notes?: string;
};
