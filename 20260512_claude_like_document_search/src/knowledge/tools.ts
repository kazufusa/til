// 低レベルツール (listDocuments / searchDocuments / grepBlocks / readBlocks)
// Vercel AI SDK の tool() でラップする.

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

const SNIPPET_LEN = 500;
const DEFAULT_LIMIT = {
  list: 50,
  searchDoc: 20,
  grep: 30,
  read: 20,
};
const MAX_LIMIT = {
  list: 200,
  searchDoc: 100,
  grep: 100,
  read: 100,
};

function clamp(n: number | undefined, def: number, max: number): number {
  if (n == null) return def;
  return Math.min(Math.max(1, Math.floor(n)), max);
}

export async function listDocuments(
  input: ListDocumentsInput
): Promise<ListDocumentsOutput> {
  const limit = clamp(input.limit, DEFAULT_LIMIT.list, MAX_LIMIT.list);
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

export async function grepBlocks(
  input: GrepBlocksInput
): Promise<GrepBlocksOutput> {
  const limit = clamp(input.limit, DEFAULT_LIMIT.grep, MAX_LIMIT.grep);
  const docIds =
    input.documentIds && input.documentIds.length > 0
      ? input.documentIds
      : null;
  const docTypes =
    input.docType && input.docType.length > 0 ? input.docType : null;
  const target = input.target && input.target.length > 0 ? input.target : null;
  const wantHeading = target == null || target.includes("heading");
  const wantBody = target == null || target.includes("body");
  const pattern = input.pattern;
  if (!pattern || pattern.length === 0) return { hits: [] };
  if (pattern.length > 500) {
    throw new Error("pattern too long (>500 chars)");
  }
  const mode = input.mode ?? "literal";
  const cs = input.caseSensitive ?? false;

  if (mode === "regex") {
    // pre-check regex validity via postgres
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

// --- Vercel AI SDK tool wrappers ---

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
