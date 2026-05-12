-- 01_init.sql: documents / blocks スキーマ + pg_trgm インデックス
-- plan.md の DB 設計に対応

create extension if not exists pg_trgm;

create table if not exists documents (
  id text primary key,
  path text not null unique,
  title text,
  doc_type text,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists blocks (
  id bigserial primary key,
  document_id text not null references documents(id) on delete cascade,
  block_index int not null,
  heading_path text[] not null default '{}',
  block_type text not null,
  text text not null
);

create unique index if not exists blocks_document_block_index_uidx
  on blocks(document_id, block_index);

create index if not exists documents_path_trgm_idx
  on documents using gin (path gin_trgm_ops);

create index if not exists documents_title_trgm_idx
  on documents using gin (title gin_trgm_ops);

create index if not exists documents_summary_trgm_idx
  on documents using gin (summary gin_trgm_ops);

create index if not exists blocks_text_trgm_idx
  on blocks using gin (text gin_trgm_ops);

create index if not exists blocks_document_index_idx
  on blocks(document_id, block_index);
