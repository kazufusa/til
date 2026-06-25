import { tool } from "ai";
import { z } from "zod";
import * as R from "./retrieval";

// 1リクエストぶんの検索セッション。ツール実行を通じて
// 候補チャンク・確定チャンク・実行スキルを蓄積する。
// knowledge は会話をまたいで持続する検索セッション(深掘り用)で、
// 検索エージェントに「バインド」される(LLM が id を管理しなくてよい)。
export type AgentSession = {
  query: string;
  candidates: Map<number, R.ChunkHit>;
  selected: Set<number>;
  skillRefs: Map<
    number,
    { id: number; name: string; rel_path: string; content: string }
  >;
  knowledge: { id: string; seen: Set<number> };
};

export function newSession(
  query: string,
  knowledge: { id: string; seen: Set<number> },
): AgentSession {
  return {
    query,
    candidates: new Map(),
    selected: new Set(),
    skillRefs: new Map(),
    knowledge,
  };
}

// LLM に返す軽量表現(本文は冒頭のみ。token 節約)
function slim(h: R.ChunkHit) {
  return {
    chunk_id: h.id,
    file: h.filename,
    section: h.heading_path.join(" > "),
    type: h.block_type,
    score: Number(h.score?.toFixed?.(4) ?? h.score),
    preview: h.content.slice(0, 240),
  };
}

export function createTools(session: AgentSession) {
  const remember = (hits: R.ChunkHit[]) => {
    for (const h of hits) session.candidates.set(h.id, h);
    return hits.map(slim);
  };

  return {
    search_files: tool({
      description:
        "登録されている markdown ソースの一覧を取得する。query を渡すとタイトル類似で並べ替える。まず全体像を掴むのに使う。",
      inputSchema: z.object({
        query: z.string().optional().describe("任意。ファイルの絞り込みキーワード"),
      }),
      execute: async ({ query }) => R.searchFiles(query),
    }),

    search_headings: tool({
      description:
        "見出しテキストを類似検索する。どの章/セクションに目的の情報があるか当たりを付けるのに使う。",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => remember(await R.searchHeadings(query, 12)),
    }),

    keyword_search: tool({
      description:
        "本文の全文検索(キーワード一致)。固有名詞・コマンド名・正確な語句に強い。",
      inputSchema: z.object({
        query: z.string(),
        k: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, k }) =>
        remember(await R.keywordSearch(query, k ?? 8)),
    }),

    vector_search: tool({
      description:
        "本文の意味(ベクトル)検索。言い換え・概念的な問いに強い。キーワードで取りこぼす時に併用する。",
      inputSchema: z.object({
        query: z.string(),
        k: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, k }) =>
        remember(await R.vectorSearch(query, k ?? 8)),
    }),

    search_knowledge: tool({
      description:
        "ナレッジベースをハイブリッド(キーワード+ベクトル, RRF)検索する。検索セッションに紐づき、既に取得済みのチャンクは除外して返す。同じトピックを「もっと深掘り」したい時に呼ぶと、未取得の関連情報を追加で取得できる。",
      inputSchema: z.object({
        query: z.string(),
        k: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, k }) => {
        const hits = await R.hybridSearch(query, k ?? 8);
        // バインド済みセッションの既出を除外(=深掘り)
        const fresh = hits.filter((h) => !session.knowledge.seen.has(h.id));
        const out = fresh.length ? fresh : hits;
        for (const h of hits) {
          session.candidates.set(h.id, h);
          session.knowledge.seen.add(h.id);
        }
        await R.touchSearchSession(
          session.knowledge.id,
          query,
          hits.map((h) => h.id),
        );
        return { results: out.map(slim), fresh: fresh.length };
      },
    }),

    expand_chunk: tool({
      description:
        "指定チャンクの前後ブロックを取得し文脈を広げる。引用範囲が途中で切れている時に使う。",
      inputSchema: z.object({
        chunk_id: z.number().int(),
        before: z.number().int().min(0).max(3).optional(),
        after: z.number().int().min(0).max(3).optional(),
      }),
      execute: async ({ chunk_id, before, after }) =>
        remember(await R.expandChunk(chunk_id, before ?? 1, after ?? 1)),
    }),

    list_skills: tool({
      description:
        "投入済みのスキル(実行可能な手順)一覧を取得する。ユーザの要求に合うスキルがあるか確認する。",
      inputSchema: z.object({}),
      execute: async () => R.listSkills(),
    }),

    run_skill: tool({
      description:
        "スキルを名前で実行する。ユーザがそのスキルの挙動を回答に適用してほしい時に呼ぶ。手順本文が返るので最終回答ではそれに従うこと。実行したスキルはファイル参照として記録される。",
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        const sk = await R.getSkillByName(name);
        if (!sk) return { error: `skill not found: ${name}` };
        session.skillRefs.set(sk.id, {
          id: sk.id,
          name: sk.name,
          rel_path: sk.rel_path,
          content: sk.content,
        });
        await R.recordSkillInvocation(sk, session.query);
        return { name: sk.name, instructions: sk.content };
      },
    }),

    select_sources: tool({
      description:
        "回答の根拠になるチャンクを確定する。検索が十分終わったら最後に必ず呼ぶこと。",
      inputSchema: z.object({
        chunk_ids: z.array(z.number().int()).describe("根拠となる chunk_id 群"),
        rationale: z.string().optional(),
      }),
      execute: async ({ chunk_ids }) => {
        for (const id of chunk_ids) session.selected.add(id);
        return { ok: true, selected: chunk_ids.length };
      },
    }),
  };
}
