-- ============================================================================
-- 01_init.sql — documents / blocks スキーマと pg_trgm インデックス.
--
-- plan.md の DB 設計に対応する初期マイグレーション.
-- 2 テーブルだけのシンプル構成:
--   documents : 文書メタ (path, title, summary, doc_type). 探索用.
--   blocks    : 本文 (段落・表・list・heading 等のブロック単位). 検索/回答用.
--
-- 設計ポリシー:
--   - 本文は blocks にしか保存しない (documents.content のような重複は持たない)
--   - blocks.heading_path は文字列配列で保持 (見出し階層を保つ)
--   - GIN(gin_trgm_ops) で全カラム trigram インデックスを張り、
--     ILIKE と pg_trgm の `%` 演算子で曖昧検索を高速化
-- ============================================================================

-- pg_trgm: trigram (3 文字組) 類似度検索. ILIKE と組み合わせて使う.
create extension if not exists pg_trgm;

-- 文書メタ. id は path そのまま (ingest.ts の deriveDocId 参照).
-- summary は ingest 時に「先頭付近の地の文 800 文字」を入れる. 検索ヒント用途.
create table if not exists documents (
  id text primary key,
  path text not null unique,
  title text,
  doc_type text,
  summary text,
  created_at timestamptz not null default now()
);

-- 本文ブロック. parseMarkdown が出した順序を block_index に保持する.
-- heading_path は親見出し階層を文字列配列で持ち、SQL 側で array_to_string して検索する.
-- on delete cascade で documents の delete に追随 (ingest の upsert を簡略化するため).
create table if not exists blocks (
  id bigserial primary key,
  document_id text not null references documents(id) on delete cascade,
  block_index int not null,
  heading_path text[] not null default '{}',
  block_type text not null,
  text text not null
);

-- (document_id, block_index) で一意. ingest の upsert 時の重複防止 & readBlocks の検索最適化.
create unique index if not exists blocks_document_block_index_uidx
  on blocks(document_id, block_index);

-- trigram GIN インデックス: ILIKE '%foo%' と pg_trgm の `%` (類似度) を両方加速する.
-- documents.* は searchDocuments、blocks.text は grepBlocks の主力検索カラム.
create index if not exists documents_path_trgm_idx
  on documents using gin (path gin_trgm_ops);

create index if not exists documents_title_trgm_idx
  on documents using gin (title gin_trgm_ops);

create index if not exists documents_summary_trgm_idx
  on documents using gin (summary gin_trgm_ops);

create index if not exists blocks_text_trgm_idx
  on blocks using gin (text gin_trgm_ops);

-- readBlocks (`where document_id = ? and block_index >= ?`) を高速化.
create index if not exists blocks_document_index_idx
  on blocks(document_id, block_index);
