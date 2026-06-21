-- ============================================================
-- RAG chat schema (PostgreSQL 18 + pgvector)
-- 埋め込み次元は 3072。pgvector の HNSW は通常の vector だと
-- 2000次元までなので halfvec(3072) を使う(HNSW は 4000次元まで対応)。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---- RAG ソース(markdown ファイル) ----
CREATE TABLE sources (
  id           serial PRIMARY KEY,
  filename     text        NOT NULL UNIQUE,
  title        text        NOT NULL,
  rel_path     text        NOT NULL,
  byte_size    integer     NOT NULL,
  content      text        NOT NULL,        -- 生 markdown 全文(プレビュー & char offset の基準)
  content_hash text        NOT NULL,
  -- 保存された回答のみ: 構造化データ(blocks+refs)。表示はこれから直接描画する
  -- (markdown content は DL/検索インデックス用の派生物)。
  block_data   jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---- チャンク(構造認識: 見出し→ブロック) ----
CREATE TABLE chunks (
  id             serial PRIMARY KEY,
  source_id      integer NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  ordinal        integer NOT NULL,                 -- ソース内の出現順(expand 用)
  block_type     text    NOT NULL,                 -- heading|paragraph|list|table|code|blockquote|other
  heading_depth  integer,                          -- heading の場合の深さ
  heading_path   text[]  NOT NULL DEFAULT '{}',    -- 祖先見出しのパス
  heading_text   text,                             -- 直近の見出しテキスト
  char_start     integer NOT NULL,                 -- 生 content への開始オフセット
  char_end       integer NOT NULL,                 -- 終了オフセット
  content        text    NOT NULL,                 -- チャンク本文(= content[char_start:char_end])
  token_estimate integer NOT NULL,
  embedding      halfvec(3072),
  tsv            tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

CREATE INDEX chunks_source_ord_idx ON chunks (source_id, ordinal);
CREATE INDEX chunks_tsv_idx        ON chunks USING GIN (tsv);
CREATE INDEX chunks_heading_idx    ON chunks USING GIN (heading_path);
CREATE INDEX chunks_heading_trgm   ON chunks USING GIN (heading_text gin_trgm_ops);
-- ANN(コサイン)。halfvec なので halfvec_cosine_ops。
CREATE INDEX chunks_embedding_idx  ON chunks USING hnsw (embedding halfvec_cosine_ops);

-- ---- スキル(skill.md を投入して登録。実行可能な手順) ----
CREATE TABLE skills (
  id           serial PRIMARY KEY,
  name         text        NOT NULL UNIQUE,
  description  text        NOT NULL,
  rel_path     text        NOT NULL,
  content      text        NOT NULL,   -- skill.md 全文(プレビュー対象)
  content_hash text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---- スキル実行ログ(呼び出すたびに「ファイルへの参照」を記録) ----
CREATE TABLE skill_invocations (
  id         serial PRIMARY KEY,
  skill_id   integer NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  skill_name text    NOT NULL,
  rel_path   text    NOT NULL,
  query      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX skill_invocations_skill_idx ON skill_invocations (skill_id);

-- ---- 検索セッション(エージェントの深掘り検索を復元するための短期保持) ----
-- id は UUID v7(PG18 の uuidv7())。TTL は約1時間(expires_at)で、アクセス時に prune。
CREATE TABLE search_sessions (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  queries        text[]      NOT NULL DEFAULT '{}',  -- これまでの検索クエリ
  seen_chunk_ids integer[]   NOT NULL DEFAULT '{}',  -- 既に返したチャンク(深掘りで除外)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);
CREATE INDEX search_sessions_expires_idx ON search_sessions (expires_at);
