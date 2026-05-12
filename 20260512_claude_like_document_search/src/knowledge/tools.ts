// ============================================================================
// tools.ts — Search Agent が使う 4 つの低レベルツール.
//
// 各ツールは「ロジック関数」+「AI SDK 用 tool() ラッパー」の 2 段構成:
//   listDocuments(input)       <- 直接呼べる純粋関数
//   listDocumentsTool          <- LLM ツールとして渡すラッパー (zod スキーマ付き)
//
// Search Agent の system prompt はこれらの description を読んでツール選択する.
// description は plan.md の仕様にユーザー向けヒント (e.g. 「summary だけで答えるな」)
// を足したもの. **prompt 改善のたびに description も同期させること**.
//
// 設計上の注意:
// - SQL は全てパラメータバインド. ユーザー入力 (LLM 入力) を直接 SQL に埋めない.
// - regex は事前に Postgres で構文チェックして、ダメなら例外を投げる (DoS 回避).
// - limit は MAX_LIMIT で抑えて、悪意/暴走でも大量行を返さない.
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { sql } from "./db";
import type {
  GrepBlocksInput,
  GrepBlocksOutput,
  ListDocumentsInput,
  ListDocumentsOutput,
  ReadBlocksInput,
  ReadBlocksOutput,
  SearchDocumentsInput,
  SearchDocumentsOutput,
} from "./types";

/** grepBlocks の snippet は 500 文字で切る. 全文を見たい時は readBlocks に切り替えさせる設計. */
const SNIPPET_LEN = 500;

/** 各ツールの limit の既定値. LLM が limit を省略した時に使う. */
const DEFAULT_LIMIT = {
  list: 50,
  searchDoc: 20,
  grep: 30,
  read: 20,
};

/** 各ツールの limit の上限. LLM が暴走して 10000 とか指定しても抑える. */
const MAX_LIMIT = {
  list: 200,
  searchDoc: 100,
  grep: 100,
  read: 100,
};

/** limit を [1, max] にクランプ. 未指定なら default. */
function clamp(n: number | undefined, def: number, max: number): number {
  if (n == null) return def;
  return Math.min(Math.max(1, Math.floor(n)), max);
}

/**
 * listDocuments — 文書一覧を返す.
 *
 * Claude Code の `ls` 相当. 「まず何があるか」を把握する.
 * `pathPrefix` は path 前方一致, `docType` は OR フィルタ.
 *
 * SQL イメージ:
 *   select ... from documents
 *   where (prefix is null or path like prefix||'%')
 *     and (docTypes is null or doc_type = any(docTypes))
 *   order by path limit ?
 */
export async function listDocuments(
  input: ListDocumentsInput
): Promise<ListDocumentsOutput> {
  const limit = clamp(input.limit, DEFAULT_LIMIT.list, MAX_LIMIT.list);
  // 未指定は null で送る (SQL 側で is null チェック → 条件無視)
  const prefix = input.pathPrefix ?? null;
  const docTypes =
    input.docType && input.docType.length > 0 ? input.docType : null;

  const rows = await sql<
    {
      documentId: string;
      path: string;
      title: string | null;
      docType: string | null;
      summary: string | null;
    }[]
  >`
    select
      id as "documentId",
      path,
      title,
      doc_type as "docType",
      summary
    from documents
    where
      (${prefix}::text is null or path like ${prefix} || '%')
      and (${docTypes}::text[] is null or doc_type = any(${docTypes}))
    order by path
    limit ${limit}
  `;

  return {
    documents: rows.map((r) => ({
      documentId: r.documentId,
      path: r.path,
      title: r.title ?? undefined,
      docType: r.docType ?? undefined,
      summary: r.summary ?? undefined,
    })),
  };
}

/**
 * searchDocuments — path / title / summary に対する曖昧検索.
 *
 * **本文 (blocks.text) は見ない**. これは「候補文書を絞る」ためのツール.
 * 本文確認は必ず grepBlocks → readBlocks で行う (system prompt にも明記).
 *
 * 検索ロジック:
 * - ILIKE で部分一致を取りつつ、pg_trgm の `%` で類似度マッチも取る
 * - スコアは similarity() の最大値. 完全一致じゃなくても近いトピックを引っかける.
 * - 表記揺れ・タイプミスにある程度強い.
 *
 * 限界:
 * - summary は ingest 時の deriveSummary で「先頭付近の地の文 800 文字」を入れているだけ.
 *   トピックが文書中央以降に出てくる場合はヒットしないので、その時は grepBlocks で本文を引く.
 */
export async function searchDocuments(
  input: SearchDocumentsInput
): Promise<SearchDocumentsOutput> {
  const limit = clamp(
    input.limit,
    DEFAULT_LIMIT.searchDoc,
    MAX_LIMIT.searchDoc
  );
  const docTypes =
    input.docType && input.docType.length > 0 ? input.docType : null;
  const q = input.query;
  if (!q || q.length === 0) return { documents: [] };

  const rows = await sql<
    {
      documentId: string;
      path: string;
      title: string | null;
      docType: string | null;
      summary: string | null;
      score: number;
      path_match: boolean;
      title_match: boolean;
      summary_match: boolean;
    }[]
  >`
    select
      id as "documentId",
      path,
      title,
      doc_type as "docType",
      summary,
      greatest(
        similarity(coalesce(path, ''), ${q}),
        similarity(coalesce(title, ''), ${q}),
        similarity(coalesce(summary, ''), ${q})
      ) as score,
      (path ilike '%' || ${q} || '%' or path % ${q}) as path_match,
      (title ilike '%' || ${q} || '%' or title % ${q}) as title_match,
      (summary ilike '%' || ${q} || '%' or summary % ${q}) as summary_match
    from documents
    where
      (${docTypes}::text[] is null or doc_type = any(${docTypes}))
      and (
        path ilike '%' || ${q} || '%'
        or title ilike '%' || ${q} || '%'
        or summary ilike '%' || ${q} || '%'
        or path % ${q}
        or title % ${q}
        or summary % ${q}
      )
    order by score desc
    limit ${limit}
  `;

  return {
    documents: rows.map((r) => {
      const matchedFields: ("path" | "title" | "summary")[] = [];
      if (r.path_match) matchedFields.push("path");
      if (r.title_match) matchedFields.push("title");
      if (r.summary_match) matchedFields.push("summary");
      return {
        documentId: r.documentId,
        path: r.path,
        title: r.title ?? undefined,
        docType: r.docType ?? undefined,
        summary: r.summary ?? undefined,
        score: Number(r.score),
        matchedFields,
      };
    }),
  };
}

/**
 * grepBlocks — 本文ブロックを検索する.
 *
 * Claude Code の Grep 相当. 本プロジェクトの **主力検索ツール**.
 *
 * 2 つのモード:
 * - `literal` (既定): ILIKE で部分一致 + pg_trgm の `%` で類似マッチ. メタ文字は文字通り.
 * - `regex`         : Postgres 正規表現 (`~` / `~*`). ripgrep 完全互換ではない (POSIX ERE).
 *
 * 安全策:
 * - pattern 長さ 500 文字超は弾く (悪意/暴走対策)
 * - regex は事前に Postgres で空文字に対して match させて構文チェック.
 *   これで不正パターン (e.g. 括弧の対応漏れ) が後段の本クエリで巨大スキャンになるのを防ぐ.
 *
 * snippet は SNIPPET_LEN (500) 文字で切る. 全文は readBlocks で取りに行く設計.
 * これで LLM に渡るトークン数を抑えて、context を浪費しない.
 */
export async function grepBlocks(
  input: GrepBlocksInput
): Promise<GrepBlocksOutput> {
  const limit = clamp(input.limit, DEFAULT_LIMIT.grep, MAX_LIMIT.grep);
  // 各種絞り込みフィルタ. 未指定は null にして SQL 側で「条件無視」させる.
  const docIds =
    input.documentIds && input.documentIds.length > 0
      ? input.documentIds
      : null;
  const docTypes =
    input.docType && input.docType.length > 0 ? input.docType : null;
  // target 未指定 / 空配列 → heading も body も両方検索
  const target = input.target && input.target.length > 0 ? input.target : null;
  const wantHeading = target == null || target.includes("heading");
  const wantBody = target == null || target.includes("body");
  const pattern = input.pattern;
  if (!pattern || pattern.length === 0) return { hits: [] };
  if (pattern.length > 500) {
    // LLM が壊れたパターンを延々生成するのを防止
    throw new Error("pattern too long (>500 chars)");
  }
  const mode = input.mode ?? "literal";
  const cs = input.caseSensitive ?? false;

  if (mode === "regex") {
    // 正規表現の構文を Postgres 側で先にチェックする.
    // 空文字に対して match させるだけ. invalid なら例外が起きる.
    // これで本クエリで大量行 × 不正 regex の無駄スキャンを防ぐ.
    try {
      await sql`select ''::text ${cs ? sql`~` : sql`~*`} ${pattern}`;
    } catch (e) {
      throw new Error(
        `invalid regex (postgres syntax): ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
    const rows = await sql<
      {
        documentId: string;
        path: string;
        title: string | null;
        docType: string | null;
        blockIndex: number;
        blockType: string;
        headingPath: string[];
        snippet: string;
        score: number;
        heading_match: boolean;
        body_match: boolean;
      }[]
    >`
      select
        d.id as "documentId",
        d.path,
        d.title,
        d.doc_type as "docType",
        b.block_index as "blockIndex",
        b.block_type as "blockType",
        b.heading_path as "headingPath",
        left(b.text, ${SNIPPET_LEN}) as snippet,
        case
          when ${
            wantHeading
              ? sql`array_to_string(b.heading_path, ' ') ${cs ? sql`~` : sql`~*`} ${pattern}`
              : sql`false`
          } then 2.0
          when ${
            wantBody
              ? sql`b.text ${cs ? sql`~` : sql`~*`} ${pattern}`
              : sql`false`
          } then 1.0
          else 0.0
        end as score,
        (${
          wantHeading
            ? sql`array_to_string(b.heading_path, ' ') ${cs ? sql`~` : sql`~*`} ${pattern}`
            : sql`false`
        }) as heading_match,
        (${
          wantBody
            ? sql`b.text ${cs ? sql`~` : sql`~*`} ${pattern}`
            : sql`false`
        }) as body_match
      from blocks b
      join documents d on d.id = b.document_id
      where
        (${docIds}::text[] is null or d.id = any(${docIds}))
        and (${docTypes}::text[] is null or d.doc_type = any(${docTypes}))
        and (
          ${
            wantHeading
              ? sql`array_to_string(b.heading_path, ' ') ${cs ? sql`~` : sql`~*`} ${pattern}`
              : sql`false`
          }
          or ${
            wantBody
              ? sql`b.text ${cs ? sql`~` : sql`~*`} ${pattern}`
              : sql`false`
          }
        )
      order by score desc, d.path, b.block_index
      limit ${limit}
    `;
    return {
      hits: rows.map((r) => {
        const matchedFields: ("heading" | "body")[] = [];
        if (r.heading_match) matchedFields.push("heading");
        if (r.body_match) matchedFields.push("body");
        return {
          documentId: r.documentId,
          path: r.path,
          title: r.title ?? undefined,
          docType: r.docType ?? undefined,
          blockIndex: r.blockIndex,
          blockType: r.blockType,
          headingPath: r.headingPath,
          snippet: r.snippet,
          score: Number(r.score),
          matchedFields,
        };
      }),
    };
  }

  // literal
  const rows = await sql<
    {
      documentId: string;
      path: string;
      title: string | null;
      docType: string | null;
      blockIndex: number;
      blockType: string;
      headingPath: string[];
      snippet: string;
      score: number;
      heading_match: boolean;
      body_match: boolean;
    }[]
  >`
    select
      d.id as "documentId",
      d.path,
      d.title,
      d.doc_type as "docType",
      b.block_index as "blockIndex",
      b.block_type as "blockType",
      b.heading_path as "headingPath",
      left(b.text, ${SNIPPET_LEN}) as snippet,
      greatest(
        case when ${
          wantHeading ? sql`true` : sql`false`
        } then similarity(array_to_string(b.heading_path, ' '), ${pattern}) else 0 end,
        case when ${
          wantBody ? sql`true` : sql`false`
        } then similarity(b.text, ${pattern}) else 0 end
      ) as score,
      (${
        wantHeading
          ? sql`(array_to_string(b.heading_path, ' ') ilike '%' || ${pattern} || '%' or array_to_string(b.heading_path, ' ') % ${pattern})`
          : sql`false`
      }) as heading_match,
      (${
        wantBody
          ? sql`(b.text ilike '%' || ${pattern} || '%' or b.text % ${pattern})`
          : sql`false`
      }) as body_match
    from blocks b
    join documents d on d.id = b.document_id
    where
      (${docIds}::text[] is null or d.id = any(${docIds}))
      and (${docTypes}::text[] is null or d.doc_type = any(${docTypes}))
      and (
        ${
          wantHeading
            ? sql`(array_to_string(b.heading_path, ' ') ilike '%' || ${pattern} || '%' or array_to_string(b.heading_path, ' ') % ${pattern})`
            : sql`false`
        }
        or ${
          wantBody
            ? sql`(b.text ilike '%' || ${pattern} || '%' or b.text % ${pattern})`
            : sql`false`
        }
      )
    order by score desc, d.path, b.block_index
    limit ${limit}
  `;

  return {
    hits: rows.map((r) => {
      const matchedFields: ("heading" | "body")[] = [];
      if (r.heading_match) matchedFields.push("heading");
      if (r.body_match) matchedFields.push("body");
      return {
        documentId: r.documentId,
        path: r.path,
        title: r.title ?? undefined,
        docType: r.docType ?? undefined,
        blockIndex: r.blockIndex,
        blockType: r.blockType,
        headingPath: r.headingPath,
        snippet: r.snippet,
        score: Number(r.score),
        matchedFields,
      };
    }),
  };
}

/**
 * readBlocks — 指定文書の startBlockIndex から limit 個のブロックを順に読む.
 *
 * Claude Code の Read 相当. **最終回答の根拠は readBlocks の出力 (text 全文) を使う**.
 * grepBlocks のヒット周辺を確認するのが基本フロー:
 *   1. grepBlocks(pattern="外貨建保険") → block_index=96 がヒット
 *   2. readBlocks(documentId="docs/01.pdf.md", startBlockIndex=94, limit=10)
 *      → 前後数ブロック含めて文脈を取る
 *
 * 起点 (startBlockIndex) は 0 未満なら 0 にクランプ. 範囲外を渡しても空配列が返るだけ.
 */
export async function readBlocks(
  input: ReadBlocksInput
): Promise<ReadBlocksOutput> {
  const limit = clamp(input.limitBlocks, DEFAULT_LIMIT.read, MAX_LIMIT.read);
  const start = Math.max(0, Math.floor(input.startBlockIndex));

  const rows = await sql<
    {
      documentId: string;
      path: string;
      title: string | null;
      docType: string | null;
      blockIndex: number;
      blockType: string;
      headingPath: string[];
      text: string;
    }[]
  >`
    select
      d.id as "documentId",
      d.path,
      d.title,
      d.doc_type as "docType",
      b.block_index as "blockIndex",
      b.block_type as "blockType",
      b.heading_path as "headingPath",
      b.text
    from blocks b
    join documents d on d.id = b.document_id
    where b.document_id = ${input.documentId}
      and b.block_index >= ${start}
    order by b.block_index
    limit ${limit}
  `;

  if (rows.length === 0) {
    return {
      documentId: input.documentId,
      path: "",
      blocks: [],
    };
  }
  const first = rows[0]!;
  return {
    documentId: first.documentId,
    path: first.path,
    title: first.title ?? undefined,
    docType: first.docType ?? undefined,
    blocks: rows.map((r) => ({
      blockIndex: r.blockIndex,
      blockType: r.blockType,
      headingPath: r.headingPath,
      text: r.text,
    })),
  };
}

// ===========================================================================
// Vercel AI SDK の tool() ラッパー.
// LLM はこの description を読んでツールを選択するので、文面は重要 (運用文書を兼ねる).
// description を変えたら src/knowledge/prompts.ts の方針とも同期させること.
// ===========================================================================

export const listDocumentsTool = tool({
  description:
    "登録された文書の一覧を返す。pathPrefix で配下指定、docType で種別フィルタが可能。",
  inputSchema: z.object({
    pathPrefix: z.string().optional(),
    docType: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT.list).optional(),
  }),
  execute: async (i) => listDocuments(i),
});

export const searchDocumentsTool = tool({
  description:
    "documents の path / title / summary から候補文書を探す。summary だけで最終回答してはいけない。本文確認は grepBlocks → readBlocks で行う。",
  inputSchema: z.object({
    query: z.string().min(1),
    docType: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT.searchDoc).optional(),
  }),
  execute: async (i) => searchDocuments(i),
});

export const grepBlocksTool = tool({
  description:
    "本文ブロックを検索する。mode='literal' は ILIKE + pg_trgm、mode='regex' は Postgres 正規表現 (~/~*)。ripgrep 完全互換ではない。caseSensitive で大文字小文字、target で heading/body の絞り込み。snippet は最大500文字。本文確認は必ず readBlocks で行う。",
  inputSchema: z.object({
    pattern: z.string().min(1).max(500),
    mode: z.enum(["literal", "regex"]).optional(),
    documentIds: z.array(z.string()).optional(),
    docType: z.array(z.string()).optional(),
    target: z.array(z.enum(["heading", "body"])).optional(),
    caseSensitive: z.boolean().optional(),
    contextBlocks: z.number().int().min(0).max(20).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT.grep).optional(),
  }),
  execute: async (i) => grepBlocks(i),
});

export const readBlocksTool = tool({
  description:
    "指定文書の startBlockIndex から limitBlocks 個の原文ブロックを順に読む。grepBlocks のヒット周辺確認に使う。最終回答の根拠は readBlocks で読んだ原文だけにする。",
  inputSchema: z.object({
    documentId: z.string().min(1),
    startBlockIndex: z.number().int().min(0),
    limitBlocks: z.number().int().min(1).max(MAX_LIMIT.read).optional(),
  }),
  execute: async (i) => readBlocks(i),
});

export const searchAgentTools = {
  listDocuments: listDocumentsTool,
  searchDocuments: searchDocumentsTool,
  grepBlocks: grepBlocksTool,
  readBlocks: readBlocksTool,
};
