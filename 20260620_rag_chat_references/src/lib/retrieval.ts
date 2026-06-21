import { sql, toVectorLiteral } from "./db";
import { embedQuery } from "./embed";

export type ChunkHit = {
  id: number;
  source_id: number;
  filename: string;
  title: string;
  ordinal: number;
  block_type: string;
  heading_path: string[];
  heading_text: string | null;
  char_start: number;
  char_end: number;
  content: string;
  score: number;
};

const SELECT_COLS = sql`
  c.id, c.source_id, s.filename, s.title, c.ordinal, c.block_type,
  c.heading_path, c.heading_text, c.char_start, c.char_end, c.content
`;

// --- ベクトル検索(pgvector / halfvec, コサイン) ---
export async function vectorSearch(query: string, k = 8): Promise<ChunkHit[]> {
  const emb = await embedQuery(query);
  const v = toVectorLiteral(emb);
  const rows = await sql<ChunkHit[]>`
    SELECT ${SELECT_COLS},
      1 - (c.embedding <=> ${v}::halfvec) AS score
    FROM chunks c JOIN sources s ON s.id = c.source_id
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${v}::halfvec
    LIMIT ${k}
  `;
  return rows;
}

// --- キーワード(全文)検索 ---
export async function keywordSearch(query: string, k = 8): Promise<ChunkHit[]> {
  const rows = await sql<ChunkHit[]>`
    SELECT ${SELECT_COLS},
      ts_rank_cd(c.tsv, websearch_to_tsquery('english', ${query})) AS score
    FROM chunks c JOIN sources s ON s.id = c.source_id
    WHERE c.tsv @@ websearch_to_tsquery('english', ${query})
    ORDER BY score DESC
    LIMIT ${k}
  `;
  return rows;
}

// --- ハイブリッド検索(vector + keyword を RRF 融合) ---
export async function hybridSearch(query: string, k = 8): Promise<ChunkHit[]> {
  const [vec, kw] = await Promise.all([
    vectorSearch(query, k * 2),
    keywordSearch(query, k * 2),
  ]);
  const C = 60; // RRF 定数
  const score = new Map<number, number>();
  const byId = new Map<number, ChunkHit>();
  const add = (arr: ChunkHit[]) => {
    arr.forEach((h, i) => {
      score.set(h.id, (score.get(h.id) ?? 0) + 1 / (C + i + 1));
      if (!byId.has(h.id)) byId.set(h.id, h);
    });
  };
  add(vec);
  add(kw);
  return [...byId.values()]
    .map((h) => ({ ...h, score: score.get(h.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// --- 見出し検索(trigram 類似) ---
export async function searchHeadings(query: string, k = 12): Promise<ChunkHit[]> {
  const rows = await sql<ChunkHit[]>`
    SELECT ${SELECT_COLS},
      similarity(coalesce(c.heading_text, ''), ${query}) AS score
    FROM chunks c JOIN sources s ON s.id = c.source_id
    WHERE c.block_type = 'heading'
      AND coalesce(c.heading_text, '') % ${query}
    ORDER BY score DESC
    LIMIT ${k}
  `;
  return rows;
}

// --- ファイル検索(全 markdown の一覧 / 任意でタイトル類似) ---
export type SourceInfo = {
  id: number;
  filename: string;
  title: string;
  byte_size: number;
  chunk_count: number;
};
export async function searchFiles(query?: string): Promise<SourceInfo[]> {
  // スキル(skills/ 配下)は一覧では別枠(/api/skills)で扱うため除外
  if (query && query.trim()) {
    return sql<SourceInfo[]>`
      SELECT s.id, s.filename, s.title, s.byte_size,
        (SELECT count(*)::int FROM chunks c WHERE c.source_id = s.id) AS chunk_count
      FROM sources s
      WHERE s.rel_path NOT LIKE 'skills/%'
      ORDER BY similarity(s.title || ' ' || s.filename, ${query}) DESC
      LIMIT 20
    `;
  }
  return sql<SourceInfo[]>`
    SELECT s.id, s.filename, s.title, s.byte_size,
      (SELECT count(*)::int FROM chunks c WHERE c.source_id = s.id) AS chunk_count
    FROM sources s
    WHERE s.rel_path NOT LIKE 'skills/%'
    ORDER BY s.filename
  `;
}

// --- 前後ブロック展開 ---
export async function expandChunk(
  chunkId: number,
  before = 1,
  after = 1,
): Promise<ChunkHit[]> {
  const base = await sql<{ source_id: number; ordinal: number }[]>`
    SELECT source_id, ordinal FROM chunks WHERE id = ${chunkId}
  `;
  if (!base.length) return [];
  const { source_id, ordinal } = base[0];
  const rows = await sql<ChunkHit[]>`
    SELECT ${SELECT_COLS}, 0::float AS score
    FROM chunks c JOIN sources s ON s.id = c.source_id
    WHERE c.source_id = ${source_id}
      AND c.ordinal BETWEEN ${ordinal - before} AND ${ordinal + after}
    ORDER BY c.ordinal
  `;
  return rows;
}

export async function getChunksByIds(ids: number[]): Promise<ChunkHit[]> {
  if (!ids.length) return [];
  const rows = await sql<ChunkHit[]>`
    SELECT ${SELECT_COLS}, 0::float AS score
    FROM chunks c JOIN sources s ON s.id = c.source_id
    WHERE c.id = ANY(${ids})
    ORDER BY c.source_id, c.ordinal
  `;
  return rows;
}

// --- スキル ---
export type Skill = {
  id: number;
  name: string;
  description: string;
  rel_path: string;
  content: string;
};
export async function listSkills(): Promise<Omit<Skill, "content">[]> {
  return sql<Omit<Skill, "content">[]>`
    SELECT id, name, description, rel_path FROM skills ORDER BY name
  `;
}
export async function getSkillByName(name: string): Promise<Skill | null> {
  const rows = await sql<Skill[]>`
    SELECT id, name, description, rel_path, content FROM skills WHERE name = ${name}
  `;
  return rows[0] ?? null;
}
export async function getSkillsByIds(ids: number[]): Promise<Skill[]> {
  if (!ids.length) return [];
  return sql<Skill[]>`
    SELECT id, name, description, rel_path, content FROM skills WHERE id = ANY(${ids})
  `;
}
export async function recordSkillInvocation(
  skill: { id: number; name: string; rel_path: string },
  query: string,
): Promise<void> {
  await sql`
    INSERT INTO skill_invocations (skill_id, skill_name, rel_path, query)
    VALUES (${skill.id}, ${skill.name}, ${skill.rel_path}, ${query})
  `;
}

// --- 検索セッション(UUID v7, Postgres, 約1時間 TTL) ---
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// session_id を解決。期限切れは prune。指定が無効/失効なら新規(uuidv7)を発行。
// 深掘り時の話題復元のため、これまでの検索クエリ(queries)も返す。
export async function resolveSearchSession(
  sessionId: string | null,
): Promise<{ id: string; seen: number[]; queries: string[] }> {
  await sql`DELETE FROM search_sessions WHERE expires_at < now()`;
  if (sessionId && UUID_RE.test(sessionId)) {
    const rows = await sql<
      { id: string; seen_chunk_ids: number[]; queries: string[] }[]
    >`
      UPDATE search_sessions
      SET expires_at = now() + interval '1 hour'
      WHERE id = ${sessionId} AND expires_at >= now()
      RETURNING id, seen_chunk_ids, queries
    `;
    if (rows.length)
      return {
        id: rows[0].id,
        seen: rows[0].seen_chunk_ids ?? [],
        queries: rows[0].queries ?? [],
      };
  }
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO search_sessions DEFAULT VALUES RETURNING id
  `;
  return { id: row.id, seen: [], queries: [] };
}

// セッションにクエリと既出チャンクを追記し、TTL を延長
export async function touchSearchSession(
  id: string,
  query: string,
  chunkIds: number[],
): Promise<void> {
  await sql`
    UPDATE search_sessions SET
      queries = array_append(queries, ${query}),
      seen_chunk_ids = (
        SELECT coalesce(array_agg(DISTINCT x), '{}')
        FROM unnest(seen_chunk_ids || ${chunkIds}::int[]) AS x
      ),
      updated_at = now(),
      expires_at = now() + interval '1 hour'
    WHERE id = ${id}
  `;
}

// --- プレビュー用 全文取得 ---
export async function getSourceContent(id: number) {
  const rows = await sql<
    { id: number; filename: string; title: string; content: string }[]
  >`SELECT id, filename, title, content FROM sources WHERE id = ${id}`;
  return rows[0] ?? null;
}
export async function getSkillContent(id: number) {
  const rows = await sql<
    { id: number; name: string; rel_path: string; content: string }[]
  >`SELECT id, name, rel_path, content FROM skills WHERE id = ${id}`;
  return rows[0] ?? null;
}
