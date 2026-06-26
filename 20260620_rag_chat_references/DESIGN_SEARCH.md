# DESIGN — 検索サブシステム

出典つき RAG チャットの**検索(retrieval)**の設計。チャンク化 → 検索プリミティブ → エージェント検索ループ → 出典契約までを扱う。
実測の経緯と取消は `ACCURACY_IMPROVEMENT.md`、実装は `src/lib/{retrieval,tools,agents,chunk}.ts`。

---

## 0. 設計思想

- **出典は char offset で厳密に**。チャンクは生 markdown の部分文字列そのもの(`raw.slice(start,end) === content`)。これがハイライトの正確さを保証する。
- **チャンクは小さく保つ**。薄いチャンク(表の数値等)は検索時に同セクションへ展開して文脈を補う。再 ingest 不要。
- **計測できないものは改善しない**。検索 proxy(Hit@k)ではなく e2e(judge)で判定。1変数ずつ A/B。
- **出典契約 = `chunk_id` のみを流す**。検索層が何をしても、合成へ渡るのは `chunk_id`。テキスト抽出で出典を壊さない。

---

## 1. 全体像

```
                    ┌──────────────── 1段目: Search Agent ────────────────┐
質問 ──▶ /api/chat ─▶│ runSearchAgent: tools をループ(最大12step)        │
                    │   → 採用 chunk_id 集合 + 実行スキル + sessionId      │
                    └──────────────────────┬─────────────────────────────┘
                                           │ SearchResult { chunks, skills, sessionId }
                    ┌──────────────────────▼─────────────────────────────┐
                    │ 2段目: Chat Agent (streamAnswer)                    │
                    │   chunks を <context> に入れ、blocks[{text,cites}] 生成│
                    └──────────────────────┬─────────────────────────────┘
                                           ▼
                          NDJSON 配信 → UI(引用クリックで元 md をハイライト)
```

検索↔合成の**境界は `SearchResult` 型だけ**。検索ロジックをどう変えてもこの形は不変。

---

## 2. データ構造 — 構造認識チャンク

`chunk.ts` が markdown を remark で mdast 化し、**トップレベルブロック単位**で切る。

```
# 見出しA                heading_path=[A]
本文1                    ┐ block(paragraph)  char_start..end, ordinal=k
| 表 | … |               ┤ block(table)
## 見出しB               heading_path=[A,B]
本文2                    ┘ block(paragraph)
```

- 見出しスタックで `heading_path[]` / `heading_text` を決定。
- `char_start/end` = mdast の `position.*.offset`。`content = raw.slice(start,end)`。
- 2000字超ブロックは offset を保ったまま分割(list は項目境界、他は改行窓)。
- `ordinal` = ソース内出現順(`expand_chunk` の前後取得に使う)。

```
chunks(id, source_id, ordinal, block_type, heading_path[], heading_text,
       char_start, char_end, content, embedding halfvec(3072), tsv※legacy)
```

---

## 3. 検索プリミティブ(`retrieval.ts`)

| 関数 | SQL の要点 | 性質 | 強い問い |
|---|---|---|---|
| `vectorSearch` | `embedding <=> $q::halfvec` 昇順、HNSW | 意味(コサイン) | 言い換え・概念 |
| `keywordSearch` | **`word_similarity($q, content)` 降順**(pg_trgm) | **あいまいランキング**(リテラルではない) | 固有名詞・語句の部分一致 |
| `searchHeadings` | `similarity(heading_text,$q)` 降順 | 見出しの trigram 類似 | 章の当たりをつける |
| `hybridSearch` | vector + keyword を **RRF(C=60)** 融合 | 固定式の融合 | 汎用 |
| `expandChunk` | `(source_id, ordinal±N)` | 前後ブロック | 引用の文脈補完 |
| `expandSection` | 同 `(source_id, heading_path)` の兄弟 | 同セクション展開 | 薄いチャンクの文脈 |

> ⚠️ **keyword は「全文検索(FTS)」でも「リテラル検索」でもない。** trigram の類似度ランキング。
> `tsv`/FTS は英語アナライザが日本語を1トークン化し Hit 0% だったため撤回(BUG-2)。`tsv` 列は死蔵。

### ハイブリッド融合(RRF)

```
vectorSearch(q, 2k):  v1 v2 v3 ...   ┐
                                     ├─ score(id) = Σ 1/(60 + rank)  → 降順 top-k
keywordSearch(q, 2k): k1 k2 k3 ...   ┘
```
順位だけで合算するので、スコアのスケール差(コサイン vs trigram)を気にせず混ぜられる。

---

## 4. 検索ループ(`runSearchAgent`)

LLM がツールを選ぶ**エージェント検索**だが、取りこぼし対策として**確定後に網羅検索を合流**させるのが要。

```
runSearchAgent(question, priorSessionId)
│
├─① セッション解決(深掘りなら seen_chunk_ids / 過去クエリを復元)
│
├─② generateText ループ(tools, stopWhen=step12)
│     search_files → search_headings → vector_search / search_knowledge → expand_chunk
│     ツール結果は session.candidates(Map<id,ChunkHit>)に蓄積
│     最後に select_sources(chunk_ids) で「採用」を確定
│        ids = selected(無ければ candidates 上位8件にフォールバック)
│
├─③ EVAL_WIDE(既定): ids に hybridSearch(question, 12) を直接合流          ★効いた改善
│     理由: エージェントのツール選択は網羅性を欠き、合成を不完全な文脈で飢えさせていた
│     (EXP-008: e2e mean 1.385→1.520)。citation は各 block が chunk_id を引くので広く渡してよい
│
├─④ expandSection(ids, 24): 採用チャンクと同セクションの兄弟ブロックを足す  ★放棄ケース対策
│     薄いチャンク(表の数値等)を説明文ごと文脈に入れる(EXP-014)
│
└─⑤ getChunksByIds(ids) → SearchResult
```

**ポイント**: 最終コンテキストは②のツール選択より**③④が支配的**。`search_knowledge` を主軸に、③が網羅を保証する二重構造。
(代替経路: `EVAL_DIRECT` でループを外し ③直結、`EVAL_DECOMP`/`EVAL_P13` で分解検索 — いずれも実験フラグ)

---

## 5. 出典契約(クリック → 該当箇所)

合成へ渡るのは **`chunk_id` だけ**。回答は block に分割し、各 block が根拠 `chunk_id` を持つ。

```
streamAnswer: blocks[{ text, citations:[chunk_id] }]
        │
        ▼  UI は「実際に引用された」chunk_id だけを出典化
出典クリック ─▶ sources/:id の生 markdown
              content.slice(0,cs) + <mark>slice(cs,ce)</mark> + slice(ce)
              → char offset 範囲を厳密ハイライト + scrollIntoView
```

裏付けの無い block(「確認できない」)は `citations:[]`。**テキスト抽出を挟まない**ので offset ハイライトが壊れない。

---

## 6. 深掘りセッション

`search_sessions`(UUID v7 / Postgres / ~1h TTL)を検索エージェントにバインド。

```
1回目: sessionId 発行、seen_chunk_ids 記録
2回目「もっと深掘り」: 同 sessionId → search_knowledge が seen を除外して未取得分だけ返す
                       過去クエリを話題ヒントに渡すので、話題省略でも元トピックで追える
```

---

## 7. 設計判断と実測の教訓

| 決定 | 理由 / 実測 |
|---|---|
| FTS → trigram(BUG-2) | 英語アナライザで日本語が1トークン化、keyword Hit 0% → `word_similarity` へ |
| 閾値を使わず top-k | 日本語は trigram 類似度が低く出る。閾値チューニングを避け順位で取る |
| **EVAL_WIDE(網羅合流)を既定化** | 真因は「検索→合成の文脈受け渡しの穴」。直接 hybrid 合流で e2e +0.135(全指標↑) |
| **expandSection を既定化** | 放棄ケース(答えの数値が top-k 外)対策。同セクションごと文脈に入れる |
| ~~リテラル検索(ILIKE)~~ | ブロックでは確実に改善(`12%` top10内 0→7)だが **e2e フラット**。日本語 literal には形態素解析が要る → 取消 |
| `statement_timeout=5s` | LLM 駆動で任意語が検索に渡る。暴走クエリの保険(採用) |

### 評価の天井 = gold の質(最重要)

検索層は既に飽和(JP の file Hit@10 97-99%)。**残る差は検索ではなく `queries.json` の gold(target_answer)の精度**。
gold は自動生成で、アプリ回答より不正確なことがある(例: 年総額と単一イベント額の混同)。judge は gold 基準で採点するため、
**gold ノイズ(±0.1級)未満の改善は原理的に検出不能**。検索チューニングが軒並み e2e フラットだった真因はこれ。
→ 次の伸びしろは検索ロジックではなく**評価系**(gold の是正 / judge を原資料に照らす事実性採点へ)。

---

## 8. 既知の負債

- **`tsv` 生成列 + `chunks_tsv_idx`**: FTS 撤回(BUG-2)の死蔵。全行で生成・索引されるが未使用 → 撤去候補。
- **keyword = fuzzy**: 「リテラル検索」ではない。正確語に強くしたいなら ILIKE/正規表現 or 形態素解析が要る(費用対効果は実測で薄い)。
- **`image` 型が弱い**(e2e 1.14/2.0): グラフ・図の質問。検索ではなく **ingest 時の図表の構造化**の問題の可能性が高い。
