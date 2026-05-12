# 依頼: Vercel AI SDK + Gemini + PostgreSQL でナレッジ検索エージェントMVPを実装する

## 目的

Vercel AI SDK + Gemini + PostgreSQL で、ローカル文書群を探索するナレッジ検索エージェントのMVPを実装してください。

目的は、ベクトル検索ではなく、Claude Code風の `list/search/grep/read` 探索ループを PostgreSQL 上に作ることです。

このMVPでは、雑多なMarkdown化済み文書群から、質問に関係する根拠ブロックを探し、原文確認済みの evidence に基づいて回答できることを目指します。

---

## 前提

* Bunで動くCLIツールとして実装する
* Vercel AI SDK を使う
* モデルは gemini-3.1-flash-lite-preview を使う
* DB は PostgreSQL 18
* マイグレーションは手作業. sqlsディレクトリにマイグレーションSQLを数値月で配置する.
* 1ファイル = 1 document として扱う
* Markdown化済み文書を取り込む想定
* 文書本文は `blocks` にだけ保存する
* `documents.content` のような全文重複カラムは作らない
* 検索は PostgreSQL の文字列検索・正規表現検索・pg_trgm を使う

---

## 作りたい構成

2段構成にしてください。

```
Chat Agent
  - ユーザーと会話する
  - 低レベル検索ツールは直接持たない
  - searchKnowledge tool だけを持つ

Search Agent
  - searchKnowledge の内部で呼ばれる
  - listDocuments / searchDocuments / grepBlocks / readBlocks を使う
  - 原文確認済み evidence を JSON で返す
```

つまり、チャットエージェントには `grepBlocks` や `readBlocks` を直接出さず、`searchKnowledge` だけを tool として渡してください。

---

# DB設計

まずこの2テーブルだけで実装してください。

## documents

```
create table documents (
  id text primary key,
  path text not null unique,
  title text,
  doc_type text,
  summary text,
  created_at timestamptz not null default now()
);
```

### カラム意味

* `id`

  * 文書ID
  * `blocks.document_id` から参照される

* `path`

  * ローカル上のMarkdownファイルパス
  * ファイル一覧・パス検索に使う
  * 例: `docs/specs/2025/example.md`

* `title`

  * 文書タイトル
  * 文書候補検索や回答時の出典表示に使う

* `doc_type`

  * 文書種別
  * 例: `spec`, `report`, `minutes`, `proposal`, `faq`, `contract`, `unknown`

* `summary`

  * 文書全体の探索用要約
  * 回答根拠には使わない
  * `searchDocuments` で候補文書を探すために使う

* `created_at`

  * 取り込み日時

---

## blocks

```
create table blocks (
  id bigserial primary key,
  document_id text not null references documents(id),
  block_index int not null,
  heading_path text[] not null default '{}',
  block_type text not null,
  text text not null
);

create unique index blocks_document_block_index_uidx
on blocks(document_id, block_index);
```

### カラム意味

* `id`

  * ブロックID

* `document_id`

  * 親文書ID

* `block_index`

  * 文書内の順序
  * `readBlocks` で周辺を読むために必須

* `heading_path`

  * そのブロックが属するMarkdown見出し階層
  * 例: `{仕様書,"3. 成果物"}`

* `block_type`

  * ブロック種別
  * 例: `heading`, `paragraph`, `list`, `table`, `code`, `unknown`

* `text`

  * 原文ブロック本文
  * grep対象
  * 最終回答の根拠

---

## インデックス

`pg_trgm` を使ってください。

```
create extension if not exists pg_trgm;

create index documents_path_trgm_idx
on documents using gin (path gin_trgm_ops);

create index documents_title_trgm_idx
on documents using gin (title gin_trgm_ops);

create index documents_summary_trgm_idx
on documents using gin (summary gin_trgm_ops);

create index blocks_text_trgm_idx
on blocks using gin (text gin_trgm_ops);

create index blocks_document_index_idx
on blocks(document_id, block_index);
```

---

# Search Agent用ツール

Search Agent には以下4つの低レベルツールを実装してください。

---

## 1. listDocuments

文書一覧を見るツールです。

Claude Code の「まずファイル構成を見る」に相当します。

### Input

```
type ListDocumentsInput = {
  pathPrefix?: string
  docType?: string[]
  limit?: number
}
```

### Output

```
type ListDocumentsOutput = {
  documents: {
    documentId: string
    path: string
    title?: string
    docType?: string
    summary?: string
  }[]
}
```

### 用途

* まず文書群の全体像を見る
* 特定ディレクトリ配下を見る
* `spec`, `report`, `minutes` などで絞る

### SQLイメージ

```
select
  id as "documentId",
  path,
  title,
  doc_type as "docType",
  summary
from documents
where
  ($1::text is null or path like $1 || '%')
  and ($2::text[] is null or doc_type = any($2))
order by path
limit coalesce($3, 50);
```

---

## 2. searchDocuments

`documents.path`, `documents.title`, `documents.summary` から文書候補を探すツールです。

### Input

```
type SearchDocumentsInput = {
  query: string
  docType?: string[]
  limit?: number
}
```

### Output

```
type SearchDocumentsOutput = {
  documents: {
    documentId: string
    path: string
    title?: string
    docType?: string
    summary?: string
    score: number
    matchedFields: ("path" | "title" | "summary")[]
  }[]
}
```

### 注意

* `summary` は探索用
* `summary` だけを最終回答の根拠にしてはいけない
* 本文根拠は必ず `grepBlocks` → `readBlocks` で確認する

### SQLイメージ

```
select
  id as "documentId",
  path,
  title,
  doc_type as "docType",
  summary,
  greatest(
    similarity(coalesce(path, ''), $1),
    similarity(coalesce(title, ''), $1),
    similarity(coalesce(summary, ''), $1)
  ) as score
from documents
where
  ($2::text[] is null or doc_type = any($2))
  and (
    path ilike '%' || $1 || '%'
    or title ilike '%' || $1 || '%'
    or summary ilike '%' || $1 || '%'
    or path % $1
    or title % $1
    or summary % $1
  )
order by score desc
limit coalesce($3, 20);
```

---

## 3. grepBlocks

本文ブロックを検索するツールです。

Claude Code の Grep 相当です。

Postgres内で検索してください。

正規表現検索は Postgres の `~` / `~*` を使ってください。

### Input

```
type GrepBlocksInput = {
  pattern: string
  mode?: "literal" | "regex"
  documentIds?: string[]
  docType?: string[]
  target?: ("heading" | "body")[]
  caseSensitive?: boolean
  contextBlocks?: number
  limit?: number
}
```

### Output

```
type GrepBlocksOutput = {
  hits: {
    documentId: string
    path: string
    title?: string
    docType?: string
    blockIndex: number
    blockType: string
    headingPath: string[]
    snippet: string
    score: number
    matchedFields: ("heading" | "body")[]
  }[]
}
```

### 仕様

* `mode = "literal"` の場合は `ILIKE` / trigram を使う
* `mode = "regex"` の場合は Postgres regex `~` / `~*` を使う
* `caseSensitive = true` の場合は `~`
* `caseSensitive = false` の場合は `~*`
* `target` が `heading` の場合は `array_to_string(heading_path, ' ')` を検索対象にする
* `target` が `body` の場合は `blocks.text` を検索対象にする
* `target` 未指定なら heading と body の両方を見る
* `grepBlocks` の結果は候補であり、最終回答の根拠ではない
* 最終回答前に必ず `readBlocks` で周辺原文を読む
* `snippet` は長すぎないようにする。500文字程度でよい

### SQLイメージ: regex

```
select
  d.id as "documentId",
  d.path,
  d.title,
  d.doc_type as "docType",
  b.block_index as "blockIndex",
  b.block_type as "blockType",
  b.heading_path as "headingPath",
  left(b.text, 500) as snippet,
  case
    when array_to_string(b.heading_path, ' ') ~* $1 then 2.0
    when b.text ~* $1 then 1.0
    else 0.0
  end as score
from blocks b
join documents d on d.id = b.document_id
where
  ($2::text[] is null or d.id = any($2))
  and ($3::text[] is null or d.doc_type = any($3))
  and (
    array_to_string(b.heading_path, ' ') ~* $1
    or b.text ~* $1
  )
order by score desc, d.path, b.block_index
limit coalesce($4, 30);
```

### SQLイメージ: literal

```
select
  d.id as "documentId",
  d.path,
  d.title,
  d.doc_type as "docType",
  b.block_index as "blockIndex",
  b.block_type as "blockType",
  b.heading_path as "headingPath",
  left(b.text, 500) as snippet,
  greatest(
    similarity(array_to_string(b.heading_path, ' '), $1),
    similarity(b.text, $1)
  ) as score
from blocks b
join documents d on d.id = b.document_id
where
  ($2::text[] is null or d.id = any($2))
  and ($3::text[] is null or d.doc_type = any($3))
  and (
    array_to_string(b.heading_path, ' ') ilike '%' || $1 || '%'
    or b.text ilike '%' || $1 || '%'
    or array_to_string(b.heading_path, ' ') % $1
    or b.text % $1
  )
order by score desc, d.path, b.block_index
limit coalesce($4, 30);
```

---

## 4. readBlocks

指定文書の指定位置から原文ブロックを読むツールです。

Claude Code の Read 相当です。

### Input

```
type ReadBlocksInput = {
  documentId: string
  startBlockIndex: number
  limitBlocks?: number
}
```

### Output

```
type ReadBlocksOutput = {
  documentId: string
  path: string
  title?: string
  docType?: string
  blocks: {
    blockIndex: number
    blockType: string
    headingPath: string[]
    text: string
  }[]
}
```

### 仕様

* `grepBlocks` でヒットした `blockIndex` の前後を読むために使う
* 例: hit.blockIndex が 40 なら startBlockIndex は 35、limitBlocks は 15 など
* 最終回答の根拠は `readBlocks` で読んだ原文だけにする

### SQLイメージ

```
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
where b.document_id = $1
  and b.block_index >= $2
order by b.block_index
limit coalesce($3, 20);
```

---

# Chat Agent用ツール

Chat Agent には低レベル検索ツールを渡さず、以下の `searchKnowledge` だけを渡してください。

## searchKnowledge

### Input

```
type SearchKnowledgeInput = {
  question: string
  preferredDocType?: string[]
}
```

### Output

```
type SearchKnowledgeOutput = {
  status: "found" | "partial" | "not_found"
  searchedQueries: string[]
  evidences: {
    path: string
    title?: string
    docType?: string
    headingPath: string[]
    blockStartIndex: number
    blockEndIndex: number
    quote: string
    relevance: "high" | "medium" | "low"
    reason: string
  }[]
  notes?: string
}
```

`searchKnowledge.execute()` の内部で Search Agent を起動してください。

---

# Search Agent の役割

Search Agent は最終回答を書かず、evidence JSON を返すだけにしてください。

## Search Agent system prompt

適宜改善してよい。ラウンドを増やすとか、blockのindexで前後検索を導入するとか

```
あなたはローカル文書群を探索する検索エージェントです。

目的:
- ユーザー質問に関係する根拠ブロックを探す
- searchDocuments / grepBlocks の結果だけで判断しない
- 必ず readBlocks で原文確認する
- 最終回答文は作らず、構造化された evidence を返す

使えるツール:
- listDocuments
- searchDocuments
- grepBlocks
- readBlocks

ルール:
- 最大3ラウンドまで検索してよい
- 検索語は同義語・別表記に展開する
- grepBlocks のヒット箇所は readBlocks で前後文脈を確認する
- readBlocks で確認した原文だけを evidence に含める
- summary は探索用。evidenceには含めない
- 根拠がない場合は status="not_found" を返す
- 関連しそうだが直接回答できない場合は status="partial" を返す
- searchedQueries に実際に試した検索語を入れる
- regex は Postgres の正規表現として解釈される。ripgrep完全互換ではない。
- regex が複雑すぎる場合は、単純な literal 検索を複数回行う。
```

## 検索語展開の例

```
成果物:
- 成果物
- 納入物
- 提出物
- 報告書
- 納品
- 検収

業務内容:
- 業務内容
- 委託業務
- 実施内容
- 作業内容

課題:
- 課題
- 問題
- 論点
- ボトルネック
- 懸念

決定事項:
- 決定
- 合意
- 対応方針
- TODO
- 次回まで
```

## grepBlocks の regex 例

```
成果物|納入物|提出物|報告書|納品|検収
課題|問題|論点|ボトルネック|懸念
決定|合意|対応方針|TODO|次回まで
責任分界|責任の所在|利用条件
```

---

# Chat Agent の役割

Chat Agent はユーザー向けに回答します。

## Chat Agent system prompt

```
あなたは文書根拠に基づいて回答するチャットエージェントです。

利用できるツール:
- searchKnowledge

ルール:
- 文書根拠が必要な質問では searchKnowledge を使う
- searchKnowledge の evidence だけを根拠に回答する
- status="not_found" の場合は、文書中には確認できないと答える
- status="partial" の場合は、確認できたことと確認できないことを分けて答える
- 回答には根拠として path と headingPath を含める
- 推測する場合は「推測」と明記する
- searchKnowledge の notes がある場合は必要に応じて補足する
```

---

# Vercel AI SDK実装方針

* Chat Agent は `streamText` で実装
* Chat Agent の tools は `searchKnowledge` のみ
* `searchKnowledge.execute()` 内で Search Agent を呼ぶ
* Search Agent は `generateObject` か `generateText + structured output` で実装
* Search Agent には `listDocuments`, `searchDocuments`, `grepBlocks`, `readBlocks` を tools として渡す
* Tool calling は複数ステップ許可する
* `stopWhen: stepCountIs(...)` を使う

---

## Chat Agent 実装イメージ

```
const result = streamText({
  model: google("gemini-2.5-flash"),
  system: chatAgentSystemPrompt,
  messages,
  tools: {
    searchKnowledge: tool({
      description: "ローカル文書群から質問に関係する原文確認済みの根拠を探します。",
      inputSchema: z.object({
        question: z.string(),
        preferredDocType: z.array(z.string()).optional(),
      }),
      execute: async ({ question, preferredDocType }) => {
        return await runSearchAgent({ question, preferredDocType });
      },
    }),
  },
  stopWhen: stepCountIs(4),
});
```

---

## Search Agent 実装イメージ

```
async function runSearchAgent(input: {
  question: string
  preferredDocType?: string[]
}): Promise<SearchKnowledgeOutput> {
  // Search Agent を起動する
  // tools: listDocuments, searchDocuments, grepBlocks, readBlocks
  // 最終的に SearchKnowledgeOutput の JSON を返す
}
```

---

# 型定義案

```
export type DocType =
  | "spec"
  | "report"
  | "minutes"
  | "proposal"
  | "faq"
  | "contract"
  | "unknown";

export type SearchKnowledgeInput = {
  question: string;
  preferredDocType?: string[];
};

export type SearchKnowledgeOutput = {
  status: "found" | "partial" | "not_found";
  searchedQueries: string[];
  evidences: Evidence[];
  notes?: string;
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

export type ListDocumentsInput = {
  pathPrefix?: string;
  docType?: string[];
  limit?: number;
};

export type SearchDocumentsInput = {
  query: string;
  docType?: string[];
  limit?: number;
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

export type ReadBlocksInput = {
  documentId: string;
  startBlockIndex: number;
  limitBlocks?: number;
};
```

---

# 実装してほしいファイル構成案

既存構成に合わせてよいですが、なければ以下で作ってください。

```
app/api/chat/route.ts
  Chat Agent の streamText

lib/knowledge/db.ts
  PostgreSQL接続・SQL実行

lib/knowledge/schema.sql
  documents / blocks のDDL

lib/knowledge/tools.ts
  listDocuments / searchDocuments / grepBlocks / readBlocks

lib/knowledge/search-agent.ts
  runSearchAgent

lib/knowledge/prompts.ts
  chatAgentSystemPrompt
  searchAgentSystemPrompt

lib/knowledge/types.ts
  SearchKnowledgeInput / SearchKnowledgeOutput 等
```

---

# 実装上の注意

* `grepBlocks` の結果では全文を返しすぎない
* `snippet` は500文字程度でよい
* 原文の全文確認は `readBlocks` で行う
* `readBlocks` は `document_id + block_index` で範囲取得する
* `summary` は探索用であり、回答根拠には使わない
* `documents` に `content` カラムを作らない
* まずはMVPなので embeddings / vector search は実装しない
* SQLインジェクション対策として必ずパラメータバインドを使う
* regex pattern はユーザー入力由来なので、長さ制限やエラーハンドリングを入れる
* Postgres regex と ripgrep は完全互換ではないので、tool description にその旨を書く
* regexエラーが起きた場合は、ツール結果としてエラーを返すか、literal検索へのフォールバックを検討する
* `readBlocks` の `limitBlocks` には上限を設ける
* Search Agent の探索回数には上限を設ける
* Search Agent は最終回答文を書かず、evidence JSONを返す

---

# 完了条件

以下が動くこと。

1. 文書一覧を取得できる
2. 文書候補を検索できる
3. literal / regex で blocks を検索できる
4. 検索ヒット周辺の blocks を読める
5. Chat Agent が `searchKnowledge` を呼ぶ
6. Search Agent が低レベルツールを使って evidence を返す
7. Chat Agent が evidence に基づいて path / headingPath 付きで回答する
8. 根拠がない場合に捏造せず「文書中には確認できません」と答える

まずは最小でよいので、実装を作ってください。

