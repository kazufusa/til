# RAG Chat with References

`markdowns/` 配下の巨大 markdown を知識ベースにした、出典参照つきエージェンティック RAG チャット。

- **二段エージェント**: Search Agent(エージェンティック検索) → Chat Agent(ブロック単位 + 引用)
- **検索**: file / 見出し / キーワード(trigram) / ベクトル(pgvector) / ハイブリッド(RRF) / 前後展開 をツールとして持つ。設計詳細 → **[DESIGN_SEARCH.md](DESIGN_SEARCH.md)**
- **出典**: 回答はブロックに分かれ、各ブロックに根拠チャンクを対応付け。番号をクリックすると右ペインで **元 markdown の該当箇所(char offset)をハイライト**表示
- **スキル**: `skills/*.md` を投入すると実行可能スキルになる。AI が依頼内容から自動実行(`run_skill`)し、通常のソース参照に **加えて** スキルファイルへの参照を記録(`skill_invocations`)+UI 表示。スキル自身も検索可能ドキュメント
- **深掘り**: 検索セッション(UUID v7 / Postgres / 約1時間TTL)を持ち、`sessionId` を渡すと既出を除いて追加検索
- **回答の保存**: 回答を保存すると ① markdown としてDL ② 出典を保持・再現 ③ 他の md と同様に検索対象化。表示は **DBの構造化データ(`block_data`)から直接描画**(markdown は DL/検索用の派生物)
- **URL**: プレビューは URL ハッシュ(`#source-<id>` 等)に反映。戻る/進む/リロード/共有が可能
- **モデル**: チャット/検索 = `gemini-3.1-flash-lite`、埋め込み = `gemini-embedding-2`(3072次元)。すべて Vertex AI / location=global
- **スタック**: bun + Next.js(App Router) + Vercel AI SDK / PostgreSQL 18 + pgvector(`halfvec(3072)` + HNSW)/ docker compose

## セットアップ

```bash
cp .env.example .env   # 値を記入(GOOGLE_VERTEX_PROJECT など)
bun install
bun run db:up          # Postgres 18 + pgvector を起動(db/init で自動スキーマ適用)
bun run ingest         # markdowns/ と skills/ を取込(チャンク化→埋め込み→投入)
bun run dev            # http://localhost:3000
```

認証は ADC(`gcloud auth application-default login`)か、`GOOGLE_APPLICATION_CREDENTIALS` にサービスアカウント鍵。

### 環境変数

| 変数 | 説明 |
|---|---|
| `DATABASE_URL` | Postgres 接続文字列 |
| `GOOGLE_VERTEX_PROJECT` | GCP プロジェクト |
| `GOOGLE_VERTEX_LOCATION` | location(`global`) |
| `GEMINI_CHAT_MODEL` | チャット/検索モデル(`gemini-3.1-flash-lite`) |
| `GEMINI_EMBEDDING_MODEL` | 埋め込みモデル(`gemini-embedding-2`) |
| `EMBEDDING_DIM` | 埋め込み次元(`3072`、DB の `halfvec` と一致) |

不足があれば `assertEnv()`(zod)が起動時に落とす。

## アーキテクチャ

```
markdowns/*.md ─ chunk.ts(構造認識: 見出し→ブロック, char offset 保持)
              └ embed.ts ─ embedding-model.ts(:embedContent アダプタ)─ Vertex
                 → chunks(content, char_start/end, heading_path, embedding halfvec(3072), tsv※legacy)

質問 ─ /api/chat (+ 任意 sessionId で深掘り)
   1) runSearchAgent: tools[search_files, search_headings, keyword_search,
                            vector_search, search_knowledge, expand_chunk,
                            list_skills, run_skill, select_sources] をループ実行
                            → 採用チャンク + 実行スキル + sessionId 確定
   2) streamAnswer(streamObject + zod): { blocks:[{ text, citations:[chunkId] }] } を stream
   → lookup(chunks + skills + sessionId)を先に、続けて answer を NDJSON で配信
   → 「保存して」なら saveAnswerDocument(block_data=構造化 + 派生md を取込)

UI(page.tsx): 左=チャット(ブロック+引用番号), 右=ファイル一覧+プレビュー
   引用番号/出典 → /api/sources/:id を char_start..end でハイライト(URLハッシュに反映)
   保存doc → block_data から AnswerView で構造化描画(出典クリックで元ソースへジャンプ)
   skill 参照 → /api/skills/:id を表示
```

### DB スキーマ(`db/init/01_schema.sql`)

- `sources`: markdown 全文(プレビュー基準) + メタ。保存回答は `block_data jsonb`(構造化データ=表示の正)を持つ
- `chunks`: ブロック単位。`char_start/end`、`heading_path[]`、`embedding halfvec(3072)`、`tsv`(legacy・未使用 ※)
  - index: HNSW(`halfvec_cosine_ops`)、GIN(`heading_path`)、trigram(`heading_text`)、GIN(`tsv` ※legacy)
  - ※ `tsv` 生成列と `chunks_tsv_idx` は FTS 時代の名残。keyword 検索は trigram に移行済み(BUG-2)で**未使用**
- `skills`: 投入された skill.md(name/description/content)
- `skill_invocations`: スキル実行ログ(= ファイル参照の記録)
- `search_sessions`: 深掘り用の検索セッション。`id uuid DEFAULT uuidv7()`、`seen_chunk_ids`、`queries`、`expires_at`(約1時間TTL)

## アルゴリズム

### 1. データ構造

#### チャンク化(`src/lib/chunk.ts` `chunkMarkdown`)

構造認識チャンク化。markdown を remark(`remark-parse` + `remark-gfm`)で mdast に変換し、
**トップレベルブロック単位**でチャンク化する。各ノードの `position.start/end.offset`(生文字列へのオフセット)を使う。

1. 見出しスタックを保持。`heading`(深さ d)に出会うたび、深さ ≥ d の要素を pop してから push。
   → 各チャンクの `heading_path`(祖先見出し列)と `heading_text`(直近見出し)を決定。
2. 見出し以外のブロック(paragraph / list / table / code / blockquote / …)は1チャンク。
   `char_start = position.start.offset`、`char_end = position.end.offset`、`content = raw.slice(start, end)`。
   → **content は生 markdown の部分文字列そのもの**。これがプレビューの正確なハイライトを保証する。
3. 大きすぎるブロック(> 2000 文字)は char offset を保ったまま分割:
   - `list` は **リスト項目境界**でまとめて分割(項目を ≤2000 文字単位でグルーピング)。
   - それ以外/巨大な単一項目は **改行境界**で窓分割(`lineWindows`)。
4. `ordinal`(ソース内の出現順)を採番 → `expand_chunk` の前後取得に使う。
5. `token_estimate ≒ len/4`。

不変条件: 任意のチャンクで `raw.slice(char_start, char_end) === content`(`scripts/chunk-test.ts` で検証)。

#### スキーマ(`db/init/01_schema.sql`)

| テーブル | 役割 | 主なカラム |
|---|---|---|
| `sources` | markdown 全文(プレビュー基準)+メタ | `filename`(unique), `title`, `content`, `content_hash` |
| `chunks` | チャンク本体 | `source_id`, `ordinal`, `block_type`, `heading_path text[]`, `heading_text`, `char_start/end`, `content`, `embedding halfvec(3072)`, `tsv tsvector`(生成列・legacy/未使用) |
| `skills` | 投入された skill.md | `name`(unique), `description`, `content` |
| `skill_invocations` | スキル実行ログ(= ファイル参照記録) | `skill_id`, `skill_name`, `rel_path`, `query` |

インデックス: `chunks` に HNSW(`halfvec_cosine_ops`)/ GIN(`heading_path`)/ trigram(`heading_text`)/ `(source_id, ordinal)` btree。`GIN(tsv)` は legacy(未使用)。
DB 接続(`db.ts`)は `statement_timeout=5s` を設定し、暴走クエリで DB が占有されないようにする。

### 2. 検索(エージェンティック・ハイブリッド)

1段目 `runSearchAgent`(`src/lib/agents.ts`)が `generateText` + tools を `stopWhen: stepCountIs(12)` でループ実行する。
ツール(`src/lib/tools.ts` → `src/lib/retrieval.ts`):

| tool | 実装 | 用途 |
|---|---|---|
| `search_files` | `sources` を全件/タイトル trigram 類似 | まずファイルを絞る |
| `search_headings` | `chunks(block_type='heading')` を `heading_text` の trigram 類似 | 章を特定 |
| `keyword_search` | `word_similarity(q, content)` 降順(pg_trgm)。**FTS ではない**(英語アナライザが日本語を1トークン化した BUG-2 で trigram へ移行) | 固有名詞・語句の部分一致 |
| `vector_search` | クエリを埋め込み → `embedding <=> $q::halfvec`(コサイン)昇順、HNSW | 言い換え・概念の意味検索 |
| `search_knowledge` | vector + keyword を **固定 RRF(C=60)** 融合(`hybridSearch`)。検索セッションの既出を除外 | ハイブリッド検索 / 深掘り |
| `expand_chunk` | `(source_id, ordinal)` の前後 ±N | 引用文脈の補完 |
| `list_skills` / `run_skill` | `skills` 参照/実行 | スキル発火 |
| `select_sources` | 採用 `chunk_id` を確定 | 検索終了の合図 |

- エージェントは「ファイル→見出し→本文(keyword と vector の併用)」と段階的に絞り込み、必要なら言い換えて複数回検索する(= **ハイブリッド検索をエージェントが調停**)。
- `keyword_search` / `vector_search` / `search_headings` / `expand_chunk` の結果は全て `AgentSession.candidates`(`Map<id, ChunkHit>`)に蓄積される。
- 最後に `select_sources(chunk_ids)` を呼ばせて **採用集合**を確定。呼ばれなかった場合は candidates を score 降順で上位8件にフォールバック。
- 2つの融合が別レイヤで効く: `search_knowledge` 内部は **固定 RRF(C=60)**、どのツールを何回呼ぶかは **エージェントの逐次判断**。
- 採用集合に **直接 `hybridSearch(question,12)` を合流** し、さらに **同セクション兄弟ブロックを展開(`expandSection`)** してから合成へ渡す(取りこぼし対策)。詳細は [DESIGN_SEARCH.md](DESIGN_SEARCH.md)、実測経緯は `ACCURACY_IMPROVEMENT.md`。

### 3. リファレンス保持

検索〜回答〜配信を通じて参照を 1 リクエスト分の `AgentSession`(`src/lib/tools.ts`)に保持する。

- `candidates: Map<id, ChunkHit>` … 検索で出会った全チャンク
- `selected: Set<id>` … `select_sources` で確定した採用チャンク
- `skillRefs: Map<id, {name, rel_path, content}>` … 実行されたスキル

`run_skill` 実行時に2つの記録を行う(= 通常のソース参照に **加えて** スキル参照を保持):
1. `session.skillRefs` に追加(回答エージェントへ手順を注入＋UI 表示用)
2. `skill_invocations` テーブルへ INSERT(`recordSkillInvocation`)= **ファイル参照の永続記録**

2段目 `streamAnswer`(`streamObject` + zod)が **回答自体に参照を埋め込む**:

```ts
AnswerSchema = z.object({ blocks: z.array(z.object({
  text: z.string(),
  citations: z.array(z.number())   // この block を裏付ける chunk_id
})) })
```

回答は意味のまとまり(block)に分割され、各 block が根拠 `chunk_id` を持つ。
裏付けの無い block(「確認できない」等)は `citations: []`(= 出典を付けない)。

配信(`/api/chat/route.ts`)は NDJSON:
1. `{type:"lookup", chunks:[…検索で拾った全件…], skills:[…実行スキル…]}`(チップ解決/プレビュー用の参照テーブル)
2. `{type:"answer", value:{blocks}}` を逐次
3. `{type:"done"}`

### 4. リファレンス参照(クリック→該当箇所表示)

UI(`src/app/page.tsx`)は **「実際に引用されたチャンク」だけ**を出典として扱う:

1. block の `citations` を全 block 横断で重複排除し、`lookup` に存在する id だけを **出典リスト**(`citedRefs`)として導出。
   → 検索で拾っただけ/未引用のチャンクは出典に出ない。
2. 本文中は通し番号(`numById`)の小さな上付きで表示。ホバーで `data-label`(`filename › heading`)をツールチップ表示。
3. 番号 or 出典行クリック → `Preview{ kind:'source', id:source_id, charStart, charEnd }` をセット。
4. `PreviewPanel` が `/api/sources/:id` で生 markdown を取得し、
   `content.slice(0,start) + <mark>content.slice(start,end)</mark> + content.slice(end)` で
   **char offset 範囲を厳密にハイライト**し、`<mark>` を `scrollIntoView`。
5. 同時に `FilesPanel` が当該ファイルを選択状態(ハイライト＋自動スクロール)にする。
6. スキル参照は `/api/skills/:id` で skill.md を同じプレビュー機構で開く。

### 5. スキル自動実行

スキルの実行は **AI(検索エージェント)が依頼内容から推論**して `run_skill` を呼ぶ(トグルではない)。
発火を安定させるため、利用可能スキル(name/description)を最初からプロンプトに提示している。
「猫っぽく」→ neko-mane、「比較表で」→ compare-table のように発火し、`skill_invocations` に記録 + UI の「実行されたスキル」に表示。
スキル自体も検索可能ドキュメントなので「〜スキルとは?」は通常検索で説明・引用できる。

### 6. 深掘り検索(セッション)

`search_sessions`(UUID v7 / Postgres / 約1時間TTL)を検索エージェントにバインド。

- 回答時に `sessionId` を返し、クライアントが保持。次の「もっと深掘り」で同じ `sessionId` を送る。
- `runSearchAgent(question, priorSessionId)` がセッションを復元し、`search_knowledge` が **既出チャンク(`seen_chunk_ids`)を除外**して未取得分を返す。
- セッションの過去クエリを話題ヒントとして渡すので、「もっと深掘り」のような話題省略でも元トピックで追加検索できる。

### 7. 回答の保存・URL・ダウンロード

- **保存**: チャットで「…保存して」or「この回答を保存」→ `saveAnswerDocument`。
  - **表示の正 = `block_data`(構造化: question/blocks/refs)**。プレビューは markdown を介さず `AnswerView` で直接描画(各ブロックに出典・クリックで元ソースへジャンプ)。
  - markdown(`content`)は **DL と検索インデックスのための派生物**。`sources/chunks` に取込むので他の md と同様に検索される。
- **ダウンロード**: 任意の markdown を `GET /api/sources/:id?download=1`(skill は `/api/skills/:id?download=1`)。UI はプレビュー見出しの「⬇ md」。
- **URL**: プレビューは URL ハッシュ(`#source-<id>` / `#source-<id>-<cs>-<ce>` / `#skill-<id>`)を正とし、開くと履歴に積まれる → 戻る/進む/リロード/共有が可能。

## 設計上の注意

- **埋め込み次元 3072 と pgvector**: 通常の `vector` の HNSW は 2000次元まで。3072 は `halfvec(3072)`(HNSW 4000次元対応)を使用。
- **gemini-embedding-2 の呼び出し**: 同梱 `@ai-sdk/google-vertex` の `embeddingModel()` は `:predict` 固定で gemini-embedding 系は `FAILED_PRECONDITION` になる。本実装は AI SDK の `EmbeddingModelV3` を自作(`embedding-model.ts`)し、`v1beta1` の `:embedContent` を呼ぶ。`embed`/`embedMany` 経由なのでバッチ/リトライは AI SDK が担当。
  - location は `global`、モデル ID は GA 名 `gemini-embedding-2`(`-preview` 無し)。

## 動作確認(任意)

```bash
bun run scripts/chunk-test.ts            # チャンク化と char offset の整合(creds 不要)
bun run scripts/ingest.ts <file.md> ...  # 指定ファイルのみ取込
```
