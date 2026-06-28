# DESIGN — 検索サブシステム(再実装仕様)

**前提ゼロの実装者がこの文書だけで、同等の検索エンジンを再実装できる**ことを目標にした仕様書。
アルゴリズム・データ構造・プロンプトを、特定のスタックやファイル構成に依らず記す(製品・言語・ファイル名は読者が自由に選ぶ)。

## スコープ

- **含む**: 取込(チャンク化 → 埋め込み)→ DB → 検索プリミティブ → 検索エージェント → **出典つきチャンクの返却(`SearchResult`)まで** → 深掘り(提案)。回答文の合成(2段目)は**契約だけ示し、生成器本体はスコープ外**(§6)。
- **含まない**: フロント UI / 回答の保存・プレビュー / 2段目チャットの文面以外の細部 / スキル**実行**機構(`run_skill` 等。別機能)。ただしスキル `.md` は通常文書として取り込まれ検索可能。
- **§1–§6・§8 は現行実装**。**§7「深掘り」だけは未実装・未検証の提案**。
- 定数の妥当性の実測経緯は `ACCURACY_IMPROVEMENT.md`。

## 用語

- **ソース(source)**: 取り込んだ markdown ファイル1件(`sources` 行)。
- **チャンク(chunk)**: ソースをブロック単位で切った断片(`chunks` 行)。検索の最小単位。
- **候補 / 採用**: 検索で出会ったチャンク / `select_sources` で「回答に使う」と確定したチャンク。
- **trigram(pg_trgm)**: 文字列を3文字ずつに割り類似度を測る Postgres 拡張。`similarity()`・`word_similarity()` を提供。
- **RRF**: Reciprocal Rank Fusion。複数検索の結果を順位だけで混ぜる手法。
- **mdast**: markdown を解析した構文木(Markdown AST)。各ノードが元文中の文字オフセットを持つ。

---

## 1. 必要な構成要素(プロダクト非依存)

再実装に必要な「能力」。何で実現してもよい(括弧は本実装の選択)。**設計の本質は以下の能力とアルゴリズムであって、製品選択ではない**。

- **文書ストア**: ソースの生テキスト全文を保持(char offset でスライスして引用するため)。(Postgres)
- **チャンクストア + 2系統の索引**:
  - ベクトル + **近似最近傍(ANN)索引**(意味検索)。(pgvector + HNSW, コサイン, 3072次元)
  - **部分文字列の類似度**(キーワード検索)。(pg_trgm の `word_similarity`)
  - 見出しパス(配列)でのグルーピング(セクション展開)。
- **埋め込みモデル**: **非対称 task type**(document / query)に対応し、次元を固定できるもの。
- **tool-calling 対応 LLM**: 検索エージェント用。

接続・認証・env・依存バージョン・Web 層(API/UI)は各スタック任意で、本書の関心外。参考実装は bun + TypeScript / PostgreSQL 18 / Vercel AI SDK / Vertex AI(Gemini)。

---

## 2. データモデル(DDL)

参考の DDL(PostgreSQL)。**埋め込みは 3072 次元**。pgvector の通常 `vector` は HNSW が 2000 次元までなので **`halfvec(3072)`**(半精度、HNSW 4000 次元対応)を使う。

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE sources (
  id serial PRIMARY KEY,
  filename text NOT NULL UNIQUE,
  title text NOT NULL,
  rel_path text NOT NULL,
  byte_size integer NOT NULL,
  content text NOT NULL,        -- 生 markdown 全文(char offset の基準)
  content_hash text NOT NULL,   -- sha256。再取込の差分判定
  block_data jsonb,             -- 保存回答の構造化(検索エンジンでは未使用)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  id serial PRIMARY KEY,
  source_id integer NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,                  -- ソース内の出現順 0..n-1
  block_type text NOT NULL,                  -- §3.1 の mapType
  heading_depth integer,
  heading_path text[] NOT NULL DEFAULT '{}', -- 祖先見出し列
  heading_text text,                         -- 直近見出し
  char_start integer NOT NULL,               -- 生 content への開始オフセット
  char_end integer NOT NULL,
  content text NOT NULL,                      -- = sources.content.slice(char_start, char_end)
  token_estimate integer NOT NULL,
  embedding halfvec(3072)
);

CREATE INDEX chunks_source_ord_idx ON chunks (source_id, ordinal);
CREATE INDEX chunks_heading_idx   ON chunks USING GIN (heading_path);
CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding halfvec_cosine_ops);

-- 検索セッション(§8)
CREATE TABLE search_sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  queries text[] NOT NULL DEFAULT '{}',
  seen_chunk_ids integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);
CREATE INDEX search_sessions_expires_idx ON search_sessions (expires_at);
```

> 実物の schema には他に `skills` / `skill_invocations` テーブルと、未使用の `tsv` 生成列＋`heading_text` の trigram 索引があるが、**検索エンジンの再実装には不要**(前者はスキル実行機能、後者は使われていない死蔵)。
> **索引が実際に効くのは HNSW(`embedding`)・GIN(`heading_path`)・btree(`source_id, ordinal`)の3つだけ**。`search_headings`/`keyword_search`/`search_files` は `ORDER BY similarity()` 形なので trigram 索引が効かず **seq scan**(コーパス小なので許容)。HNSW のビルドパラメータは既定。検索の決定性が要るときだけ接続で `SET hnsw.ef_search = 200`。

---

## 3. 取込パイプライン

**入力**: markdown ファイル群。各ファイルから `filename`、相対パス、`title`(生 markdown 最初の見出し `^#{1,6}\s+(.+)$` or なければ filename)を得る。

ファイルごとに: ① `sha256(raw)` で差分判定(`content_hash` 一致なら skip / 変化ありは該当 source を delete→再投入。`ON DELETE CASCADE` で chunks も消える)→ ② `title` を算出 → ③ **チャンク化**(§3.1)→ ④ **埋め込み**(§3.2、数十件ずつバッチ)→ ⑤ `chunks` に INSERT(`embedding` は `'[...]'::halfvec`)。

### 3.1 チャンク化アルゴリズム

remark(`remark-parse` + `remark-gfm` + `remark-frontmatter(["yaml"])`)で mdast 化し、**トップレベルの子ノードだけ**を走査。各ノードの `position.start/end.offset`(生文字列のオフセット)を使う。

```
headingStack = []          # {depth, text} のスタック
ordinal = 0
for node in tree.children:        # トップレベルのみ。ネストは展開しない
  start, end = node.position.*.offset
  if node.type == "heading":
    depth = node.depth
    while headingStack 非空 and top.depth >= depth: pop   # 同/浅い見出しを畳む
    text = raw[start:end] から先頭 "#...#" と末尾 "#" を除去・trim
    headingStack.push({depth, text})
    emit("heading", start, end, headingDepth=depth)
  else:
    for (s, e) in splitBlock(node, raw, start, end):       # 2000字超だけ分割
      emit(mapType(node.type), s, e)

emit(blockType, s, e):
  content = raw[s:e]; if content.trim() 空 then skip
  chunk = {
    ordinal: ordinal++, blockType,
    headingPath: headingStack の text 列,                  # 祖先見出し
    headingText: headingStack 末尾.text or null,
    charStart: s, charEnd: e, content,
    tokenEstimate: ceil(content.length / 4),
  }
```

- **`mapType`**: `list`/`table`/`code`/`paragraph`/`blockquote` はそのまま、`heading`→`heading`、`yaml`→`frontmatter`、その他→`other`。**この8種が `block_type` の全値**。
- **`splitBlock`**(`MAX_CHARS = 2000`): `end-start ≤ 2000` なら分割なし。`list` は**項目(`children`)境界**で連続項目を**貪欲に詰めて** ≤2000 ずつにまとめ(累積が2000超になる項目の手前で切る)、巨大単一項目はさらに `lineWindows`。それ以外の巨大ブロックは `lineWindows`。**いずれも char offset を保持**。
  - `lineWindows`: `split(/(?<=\n)/)` で**改行を各行末尾に残して**分割 → 累積が2000超になる行の手前で窓を切る。よって**改行は前のチャンクの末尾に属する**。**単一行が2000字超なら分割せず、その行のまま1チャンク**(超過を許容)。
- 不変条件: 任意のチャンクで **`sources.content.slice(char_start, char_end) === chunks.content`**。これが出典ハイライトの根拠。

### 3.2 埋め込み戦略

- **非対称 task type**(検索品質に直結): 取込時は **document** 用、クエリ時は **query** 用の task type で埋める(Vertex なら `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`)。次元 3072、距離はコサイン。
- **見出しパスを前置き**(取込時のみ): `headingPath.length>0` なら、埋め込む入力テキストを `headingPath.join(" > ") + "\n\n" + content` にする(短いブロックの検索精度向上)。**DB に保存する `content`/`char_start/end` は生のまま**(ハイライト不変条件を壊さない)。**クエリ側は前置きしない**(生クエリを埋める)。
- 取込は50件ずつバッチで埋め込む。

> 実装注意(Vertex 固有・設計の本質ではない): `gemini-embedding` 系は `:embedContent` エンドポイントで叩く(`:predict` だと失敗)。`@ai-sdk/google-vertex` 同梱の埋め込みが `:predict` 固定なので、薄い自作アダプタ(ADC Bearer + `fetch` で `content.parts[].text` を送る、1件ずつ)で `:embedContent` を呼ぶ。

---

## 4. 検索プリミティブ(実 SQL)

全関数の戻り値型 `ChunkHit = { id, source_id, filename, title, ordinal, block_type, heading_path, heading_text, char_start, char_end, content, score }`。共通 SELECT 列:
```sql
c.id, c.source_id, s.filename, s.title, c.ordinal, c.block_type,
c.heading_path, c.heading_text, c.char_start, c.char_end, c.content
```

```sql
-- vectorSearch(query, k):  embedQuery(query) で 3072 次元に → コサイン距離 <=> の昇順
SELECT <cols>, 1 - (c.embedding <=> $emb::halfvec) AS score
FROM chunks c JOIN sources s ON s.id = c.source_id
WHERE c.embedding IS NOT NULL AND c.block_type <> 'heading'
ORDER BY c.embedding <=> $emb::halfvec
LIMIT $k;

-- keywordSearch(query, k):  pg_trgm の word_similarity 降順(FTS でもリテラルでもない)
SELECT <cols>, word_similarity($query, c.content) AS score
FROM chunks c JOIN sources s ON s.id = c.source_id
WHERE c.block_type <> 'heading'
ORDER BY score DESC LIMIT $k;

-- searchHeadings(query, k=12):  見出しチャンクの heading_text 類似
SELECT <cols>, similarity(coalesce(c.heading_text,''), $query) AS score
FROM chunks c JOIN sources s ON s.id = c.source_id
WHERE c.block_type = 'heading'
ORDER BY score DESC LIMIT $k;

-- searchFiles(query?):  query 有ならファイル候補、無ければ全件
SELECT s.id, s.filename, s.title, s.byte_size,
  (SELECT count(*)::int FROM chunks c WHERE c.source_id = s.id) AS chunk_count
FROM sources s WHERE s.rel_path NOT LIKE 'skills/%'
ORDER BY similarity(s.title || ' ' || s.filename, $query) DESC LIMIT 20;  -- query 有
-- query 無: 同 WHERE で ORDER BY s.filename(LIMIT なし)

-- expandChunk(chunkId, before=1, after=1):  まず chunkId の (source_id, ordinal) を引き、
SELECT <cols>, 0::float AS score
FROM chunks c JOIN sources s ON s.id = c.source_id
WHERE c.source_id = $source_id AND c.ordinal BETWEEN $ordinal-$before AND $ordinal+$after
ORDER BY c.ordinal;

-- expandSection(chunkIds, cap=24):  採用チャンクと同じ (source_id, heading_path) の兄弟ブロック
WITH seeds AS (
  SELECT DISTINCT source_id, heading_path FROM chunks
  WHERE id = ANY($chunkIds) AND array_length(heading_path,1) >= 1
)
SELECT <cols>, 0::float AS score
FROM chunks c JOIN sources s ON s.id = c.source_id
JOIN seeds ON seeds.source_id = c.source_id AND seeds.heading_path = c.heading_path
WHERE c.block_type <> 'heading'
ORDER BY c.source_id, c.ordinal LIMIT $cap;

-- getChunksByIds(ids):  最終 ids の実チャンクを取得
SELECT <cols>, 0::float AS score FROM chunks c JOIN sources s ON s.id = c.source_id
WHERE c.id = ANY($ids) ORDER BY c.source_id, c.ordinal;
```

> SQL の `$query` 等は全てパラメータバインド。ユーザ/LLM 入力を文字列連結で SQL に組み込まない。

### 4.1 ハイブリッド融合 — `hybridSearch(query, k)`

```
vec = vectorSearch(query, 2k)      # 各アームは 2k 件取る
kw  = keywordSearch(query, 2k)
score = {}                          # chunk_id -> 合算スコア
for arr in [vec, kw]:
  for i, hit in enumerate(arr):     # i は 0 始まり
    score[hit.id] += 1 / (60 + i + 1)   # RRF, C=60。順位だけで合算
return 全 hit を score 降順、上位 k
```

順位だけで足すので、コサイン距離と trigram 類似度のスケール差を気にせず混ぜられる。

---

## 5. 検索エージェント

検索エージェントは **ただの関数**(LLM ではない)。`searchAgent(question, priorSessionId)` の中で、①LLM がツールで検索 → ②③④をコードが必ず後段で足す、の順。

### 5.1 system prompt(全文・そのまま使う)

```
あなたは RAG の検索エージェントです。markdown 知識ベースから、ユーザの質問に答えるのに必要な根拠チャンクを集めます。

使えるツール:
- list_skills / run_skill: 実行可能スキルの確認・実行
- search_files: ソース(markdownファイル)一覧/絞り込み
- search_headings: 見出しから章を特定
- keyword_search: 全文検索(固有名詞・コマンド名に強い)
- vector_search: 意味検索(言い換え・概念に強い)
- search_knowledge: ハイブリッド検索。検索セッションに紐づき既出を除外。「もっと深掘り」「続き」には未取得分を追加取得できる
- expand_chunk: 前後ブロックで文脈を補う

進め方:
1. 下記「利用可能なスキル」を見て、ユーザがそのスキルの挙動を回答に適用してほしいと意図していれば run_skill で実行する(例:「猫っぽく」→ neko-mane、「比較表で」→ compare-table)。スキルについて尋ねているだけなら実行しない。
2. ファイル→見出し→本文(keyword と vector を併用)の順に段階的に絞り込む。言い換えて複数回検索してよい。深掘り依頼なら search_knowledge を使う。
3. 取りこぼしが無いか確認し、必要なら expand_chunk で文脈を広げる。
4. 最後に必ず select_sources を呼び、回答の根拠になる chunk_id を確定する(無関係なものは含めない)。

ツールだけで作業し、散文の回答は不要です。
```

プロンプトの末尾に、セッションの過去クエリ(あれば)と「利用可能なスキル(name: description の一覧)」を追記して `prompt` に入れる。LLM 呼び出しは tool-calling で「最大12ステップのループ」を回す(AI SDK 例: `generateText({ model, system, prompt, tools, toolChoice:"auto", stopWhen: stepCountIs(12) })`)。

> **スキルを実装しない純検索版**なら、上の system prompt から `list_skills`/`run_skill` の行・手順1・「利用可能なスキル」追記、および `search_knowledge` の「既出を除外」の文言を削ること(存在しないツールを指示しない)。

### 5.2 ツール定義(zod スキーマ)

各ツールは検索プリミティブを呼び、結果を**スリム化**して LLM に返す(`{ chunk_id, file, section=heading_path.join(" > "), type, score, preview=content[:240] }`)。同時に全 hit を `session.candidates`(Map<id, ChunkHit>)へ蓄積する。

| tool | input(zod) | 動作 |
|---|---|---|
| `search_files` | `{ query?: string }` | `searchFiles(query)` |
| `search_headings` | `{ query: string }` | `searchHeadings(query, 12)` |
| `keyword_search` | `{ query: string, k?: int 1..20 }` | `keywordSearch(query, k ?? 8)` |
| `vector_search` | `{ query: string, k?: int 1..20 }` | `vectorSearch(query, k ?? 8)` |
| `search_knowledge` | `{ query: string, k?: int 1..20 }` | `hybridSearch(query, k ?? 8)`(現状は既出除外も内包。§7 で再設計) |
| `expand_chunk` | `{ chunk_id: int, before?: 0..3, after?: 0..3 }` | `expandChunk(...)` |
| `select_sources` | `{ chunk_ids: int[], rationale?: string }` | `chunk_ids` を `session.selected` に確定 |

(`list_skills`/`run_skill` はスキル実行機構。検索エンジンには不要。)

### 5.3 フロー(LLM の後にコードが必ず実行)

```
ks = resolveSearchSession(priorSessionId)        # §7。単一ターンなら seen=[]
session = newSession(question)
LLM がツールを最大12ステップ呼ぶ(§5.1)→ session.selected / candidates が埋まる

ids = [...session.selected]
# ② 広域 hybrid を必ず合流(LLM の取りこぼし対策)
direct = hybridSearch(question, 12)
ids = (ids ∪ direct.id) を先頭から 15 件
# ③ 同セクション兄弟を合流
sec = expandSection(ids, 24)
ids = (ids ∪ sec.id) を先頭から 28 件
# フォールバック: ids が空なら candidates を score 降順で上位 8
return { chunks: getChunksByIds(ids), sessionId: ks.id }
```

定数 12/15/24/28/8 は実装値(根拠は §8)。②③が最終文脈を支配するので、LLM がツールを呼ばなくても候補は確保される。

---

## 6. 出力と出典契約

戻り値 `SearchResult { chunks: ChunkHit[], sessionId }`。各チャンクが `id` と `char_start/end` を持ち、これが回答の引用ハイライトの土台。

2段目(回答合成)は本書のスコープ外だが、検索→回答の契約だけ示す:
- チャンク群を `<context><chunk id=… file=… section=… type=…>content</chunk>…</context>` として LLM に渡す。
- 出力スキーマ `AnswerSchema = { blocks: [{ text: string, citations: number[] }] }`(`citations` = その block を裏付ける `chunk_id`)。裏付けの無い block は `citations: []`。
- UI は引用された `chunk_id` の `char_start/end` で元ソースを `<mark>` ハイライトする。**テキスト抽出を挟まない**(チャンク本文=生 markdown の部分文字列なので offset がそのまま使える)。

---

## 7. 深掘りセッション(追加機能・**未実装/未検証の提案**)

§5 の単一ターン検索に**任意で上乗せ**する案。`sessionId` 無し = §5 のまま。「もっと/続き」で**同じ話題のまだ見ていないチャンク**を返す。

> ⚠️ **確定仕様ではなく提案**。下記は推測なしにコードへ落とせる水準だが、**良い「もっと」体験になるかは未測定**(深掘りは e2e ハーネスが単一ターンしか叩かず未計測)。採用前に multi-turn eval が要る(末尾「要検証」)。

**実体** = `search_sessions` の1行(§2)。`id`(uuidv7)=`sessionId`、`seen_chunk_ids[]`(既出)、`queries[]`(話題ヒント)、`expires_at`(約1時間TTL、アクセスで延長、失効はアクセス時に削除)。
セッション操作 = `resolveSearchSession(sessionId)`(失効を削除し、有効なら seen/queries を返す。無効/未指定なら新規発行)/ `touchSearchSession(id, query, ids)`(seen を union 追記、queries 追記、TTL 延長)。

**提案する意味論**:
1. `sessionId` を送る = 「同じ話題で、まだ返していないチャンクをくれ」の明示(= クライアント送信規律。サーバ/lib 変更不要)。
2. seen 除外は**1箇所**:検索エージェント(§5)が最終 ids を組んだ後にまとめて除外(②の広域検索・空時フォールバックも漏れなくカバー)。
3. soft 除外: 除外後**0件のときだけ**除外前 ids をそのまま返す(補充なし)。
4. seen 更新: ターン末に1回だけ、**実際に返した ids すべて**を保存。今回の検索クエリも追記。

**設計(アルゴリズム)**: §5 フローの**フォールバック解決後・実チャンク取得の直前**に、既出を一括除外する。

```
if seen 非空:
  fresh = ids.filter(id ∉ seen)
  ids = fresh if fresh else ids       # soft 閾値=0: 0件のときだけ元 ids
# 実チャンク取得の後、ターン末に1回:
seen ∪= ids ;  queries.append(question) ;  TTL 延長
```

- 除外は**キャップ(15/28件)の後**に掛ける。同じ質問の「もっと」で新規が少なければ少ないまま返るのは仕様。
- 使う seen は**前ターンまでのスナップショット**(今ターンのヒットは含めない=自分の結果を消さない)。
- **なぜ個々の検索ツールでなく1箇所か**: 除外をツール内に閉じ込めると、ツールを経由しない経路(②の広域検索・フォールバック)が seen を無視し、既出が最終結果に戻る。中央集約でこれを塞ぐ。

**要検証(未測定)**: ①キャップ後除外で「もっと」が薄くなる懸念、②深掘りの multi-turn eval が無い(新規性＋回答品質を測り A/B してから確定)、③意味論①が UI 操作と噛み合うか。

---

## 8. チューニング定数と根拠

| 定数 | 値 | 根拠 |
|---|---|---|
| 埋め込み次元 | 3072(半精度ベクトル) | ANN 索引(HNSW)が通常ベクトルだと2000次元まで → 半精度に |
| 埋め込み taskType | document / query | 非対称埋め込み。検索品質に直結 |
| 埋め込み入力 | heading_path 前置き | 短ブロックの検索精度 |
| ブロック分割上限 | 2000字 | 埋め込みモデルの入力上限(~2048 token)に収める |
| 取込バッチ | 50 | 取込スループット |
| RRF 定数 C | 60 | RRF 定番の平滑化定数 |
| エージェント step 上限 | 12 | ツール呼び出しループの暴走防止 |
| 広域検索 件数 / ids上限 | 12 / 15 | 取りこぼし対策。**実測で全体回答スコア 1.385→1.520 に改善** |
| section 取得 / ids上限 | 24 / 28 | 情報の薄いチャンクの文脈補完 |
| fallback 件数 | 8 | 採用も②も空のときの保険 |
| クエリタイムアウト | 5s | 暴走クエリの中断 |

定数の A/B・取消の経緯(日本語 FTS→trigram への変更、リテラル検索が効かなかった件、評価が gold の質で頭打ちな件 等)は別紙 `ACCURACY_IMPROVEMENT.md`。
