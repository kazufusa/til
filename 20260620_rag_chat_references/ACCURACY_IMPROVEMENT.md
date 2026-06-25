# 精度改善提案 ＆ 精度検証フロー設計

本アプリ（出典参照つきエージェンティック RAG チャット）の検索精度を、
**Open Notebook の実装知見**と**コード調査で見つけた構造的弱点**の両面から改善する。
原則: **計測できないものは改善しない**。先に検証フローを立て、各変更を1変数ずつ A/B する。

---

## 0. 前提（調査で判明した事実）

### 0.1 評価セットは既に存在する — `queries.json`(234件)

```json
{
  "question": "火災保険の収益悪化に対し…具体的な例を挙げて説明してください。",
  "target_answer": "火災保険の収益悪化には長期契約が赤字…",
  "target_file": "01.pdf", "target_md": "docs/01.pdf.md",
  "target_page_no": "4", "domain": "finance", "type": "paragraph"
}
```

- ゴールド: `target_md`(根拠ファイル) / `target_answer`(模範解答) / `domain` / `type`(paragraph|table|…)。
- **食い違い注意**: `queries.json` は `docs/*.pdf.md`(日本語 PDF 群)を指すが、
  現在 ingest 済みは `markdowns/`(awesome-* 等、英語寄り)。
  → **評価を回す前に `docs/` を ingest する**。日本語主体なので #1 の影響が最大化する。

### 0.2 Open Notebook(lfnovo/open-notebook)の実装

DeepWiki + `open_notebook/graphs/ask.py` を確認。

- **Ask = クエリ分解 map-reduce(LangGraph)**
  1. **Strategy ノード**: 質問を最大5個の `Search{term, extraction指示}` に分解(`ask/entry`)。
  2. **trigger_queries**: `Send` で各 term を並列ブランチへファンアウト。
  3. **provide_answer(map)**: term ごとに `vector_search(term, 10, …)` → `ask/query_process` で
     **取得10件から根拠を抽出した小回答**を生成。
  4. **write_final_answer(reduce)**: 全小回答を `ask/final_answer` で統合。
- **検索そのものは素朴**: 純ベクトル検索のみ。text/vector はユーザがトグル(自動融合なし)、
  RRF なし、リランクなし、`minimum_score=0.2` 足切りのみ。
- **チャンク化**: トークンベース既定 **400 token / オーバーラップ 15%**、
  content-type 別スプリッタ(Markdown 構造保持)＋超過分は recursive 分割。
- **見出し前置きは無し**、**日本語全文検索の工夫も無し**。

**結論**: 検索の融合・絞り込みは **本アプリの方が高度**(RRF + agentic hybrid)。
Open Notebook から借りるべきは検索ではなく **回答アーキテクチャ(分解→抽出→統合)**。
逆に #1/#2 は ON も解いていない＝**自前の勝ち筋**。

---

## A. 改善提案(インパクト順)

> P0 = 体感に直結・再 ingest 必要 / P1 = 構造改善 / P2 = 追い込み

### P0-1. 日本語全文検索を効かせる 〔自前 / ON 参考外〕〔★実測確認済〕
- **[実測] keyword_search は日本語で Hit@10 = 0.0%(234件)**。`websearch_to_tsquery('english','火災保険の収益悪化')`
  は `'火災保険の収益悪化'` という**フレーズ丸ごと1トークン**を生成し、永遠に一致しない。英語語("Kubernetes")は正常にヒット。
  → hybrid と vector のスコアが**完全一致**(下表)＝現状の hybrid は keyword 無寄与の「ベクトル単独の着ぐるみ」。
- **問題**: `tsv GENERATED ALWAYS AS (to_tsvector('english', content))`(`01_schema.sql:39`)、
  検索も `websearch_to_tsquery('english', q)`(`retrieval.ts:43-45`)。
  日本語は空白区切りが無く `'english'` ではトークン化されず、和語がほぼマッチしない。
  → `keyword_search` が英単語にしか効かず、RRF が実質ベクトル単独に退化。
- **対策**: `pg_bigm`(バイグラム)または `pgroonga` を導入し日本語全文検索へ。
  - 最小: `docker-compose` のイメージを pgroonga/pg_bigm 同梱に変更 → `tsv`/index 張替 → 再 ingest。
  - `retrieval.ts` の全文クエリを拡張に合わせて差替(pgroonga なら `&@~`, pg_bigm なら `LIKE`+gin)。

### P0-2. 埋め込みに見出しパスを前置き 〔自前 / 既知ベストプラクティス〕
- **問題**: `embedDocuments(batch.map(c => c.content))`(`documents.ts:115`/`ingest.ts:71`)。
  ブロック本文のみ埋め込み。短いブロックが章脈(`セットアップ > Docker`)を失う。
- **対策**: **埋め込み入力テキストだけ** `heading_path.join(" > ") + "\n\n" + content` にする。
  DB の `content` と `char_start/end` は不変 → ハイライト不変条件を壊さない。数行・効果大・再 ingest。
  - 発展(任意): Anthropic 流 *contextual retrieval*(LLM で 1-2 文の文脈要約を前置き)。コスト増。

### P1-3. クエリ分解 + 根拠抽出(map-reduce) 〔Open Notebook 由来〕
- **狙い**: 本アプリは選抜チャンクを **1回の合成**にそのまま流す(`streamAnswer`)。
  ON のように **term 分解 → 各 term で検索 → 根拠抽出(map) → 統合(reduce)** を挟むと、
  抽出段が **LLM ベースのリランカ/圧縮器**として効き、無関係チャンクを落として precision が上がる(#3/#5 に直接効く)。
- **対策(本アプリの強い検索を活かす折衷案)**:
  1. Strategy: 質問を 2-4 サブクエリに分解(既存の「言い換え複数回検索」を**明示ステップ化**)。
  2. 各サブクエリで既存 `searchKnowledge`(RRF+セッション除外)を実行。
  3. map: サブクエリごとに「このサブクエリに答える根拠 chunk_id + 抜粋」を抽出。
  4. reduce: `streamAnswer` は抽出済み根拠だけを受け取り block 化(出典機構はそのまま)。
- 注意: レイテンシ・コスト増。サブクエリ並列化＋ `gemini-3.1-flash-lite` で吸収。
- **[F5] 出典契約の維持(必須制約)**: map 段の出力は **`chunk_id` 限定**(言い換え・部分抜粋テキストを返さない)。
  抽出が抜粋テキストを返すと既存の char-offset ハイライトが切れる。`A` の不変条件を map 段にも課す。

### P1-4. 取りこぼし2点(再 ingest 不要・即修正)
- **#3 フォールバックのスコア比較が無意味**(`agents.ts:75-78`):
  `select_sources` 未呼出時、RRF/コサイン/ts_rank/trigram/expand(=0) を**混在スケールで降順**。
  → 各ツールで取得時に `source`(由来)と**正規化済み rank** を付与し、フォールバックは
  「ツール内 rank の RRF」で統一するか、最低でもベクトル類似で再採点する。
- **#4 見出し単体チャンクの混入**(`retrieval.ts:25-37`):
  `block_type='heading'` の中身ゼロ見出しが `vector_search` のヒット枠を消費。
  → `vector_search`/`hybridSearch` に `AND c.block_type <> 'heading'` を追加(見出しは `search_headings` 専任)。

### P2-5. 明示的リランク段
- 候補プール(`AgentSession.candidates`)を `select_sources` 前に
  **クロスエンコーダ or LLM 一括採点**で top-k に絞る。P1-3 を入れるなら抽出段が代役になるので優先度は下がる。

### P2-6. チャンク粒度の見直し
- 現状は構造のみ(トップレベルブロック)で大小のばらつき大。ON の 400token/15%overlap が参考。
- ただし **char offset ハイライト不変条件**が制約。最小サイズの隣接ブロック結合 / 軽いオーバーラップに留める。

---

## A2. チャンク戦略の比較: block(自作) vs token(Open Notebook)

**「どっちが優秀か」は機能観点で決まる。** 本アプリの看板(char-offset ハイライト＋出典表示)を
前提にすると **block が明確に優秀**。ただし検索精度の軸では token に分があり、そこは block を
捨てずに埋められる。

| 観点 | block(自作) | token(ON: 400tok/15%overlap) |
|---|---|---|
| char-offset ハイライト | ◎ `slice==content` 不変条件で一発 | ✕ overlap で所属が曖昧 / 非verbatim で offset 崩壊 |
| 出典表示の可読性 | ◎ 段落/表/コード単位で自然 | △ 任意位置で切れて汚い |
| 出典の粒度 | △ 大小バラつき | ○ 均一 |
| 埋め込み・検索精度 | △ 不均一・overlap無 | ○ 均一・overlap有 |
| 境界跨ぎ取りこぼし | △ (expand_chunk で事後回収) | ○ overlap で予防 |

**致命傷の所在**: token+overlap は (1) 引用スパンが2チャンクに属し highlight の所属が決まらない、
(2) 再トークン化で原文の部分文字列でなくなり char offset が計算不能、になる。
→ **ハイライト不変条件と token+overlap は両立しない。** ON の方式は本アプリの看板を壊す。

**本質: チャンクは3役を兼ねている** — ①ハイライト/出典の単位(=正確なスパン) ②検索/埋め込みの単位
(=文脈豊かなテキスト) ③保存。block も ON も「1チャンク3役」。**勝ち筋は3役の分離 = small-to-big
(parent-document retrieval)**:

> 表示・引用は正確なスパン(block offset)。検索は「見出しパス＋必要なら近傍を足した拡張テキスト」を
> 埋め込み、その埋め込みは元スパンを指す。

→ ON の検索ロバストさを**ハイライト不変条件を壊さずに**取り込める。実装は「**埋め込む文字列**」と
「**保存するスパン**」を別物にするだけ(P0-2 の自然な拡張。`expand_chunk` は既に手動 parent-fetch
なのを ingest 時に formalize する形)。**結論: block を土台に、token 側の良さ(文脈付与・overlap・
近傍)を埋め込みレイヤにだけ足す。**

## A3. チャンク粒度の実測(現行 chunkMarkdown)

| | markdowns/ | docs/ |
|---|---|---|
| ファイル / 総チャンク | 17 → **12,441** | 51 → **7,109** |
| 文字数 中央値 | **58** | **41** |
| ≤50字 | 34.2% | 53.1% |
| ≤200字 | 71.3% | 81.5% |
| heading 型 | 28% | 37% |

`rust-releases.md` 単独で 5,223 チャンク(markdowns の 42%)。

**読み取り**:
- **チャンク「数」(12k/7k)は HNSW には無問題**。悪化要因は数ではなく中身。
- **中央値 41-58字 = 大半が断片**。単体では答えにならない → `expand_chunk` 頼みの受動的補完しか無い
  (= 「前後を取らないと意味がない」懸念は実データで正しい)。
- **全チャンクの 28-37% が「見出しだけ」**でベクトル索引に入り top-k 枠を消費(= #4。索引の 1/3 がノイズ)。

**設計の穴: 上限はあるが下限が無い。** 現行は「>2000字は分割」の**天井**のみ(2000字超は0件=機能している)。
だが**最小サイズの床が無い**ため 41字の断片が量産される。これが非対称の欠陥。

**→ データが要求する打ち手**(block 単位は維持。下限併合＋埋め込み文脈付与を足す):
1. 見出しパスを**埋め込みテキストに前置き**(P0-2) — 断片・見出しに文脈を与える。
2. **隣接小ブロックを床(~300-500字)まで併合**(懸念Bの能動的解決) — 同一見出し下で併合。
   併合スパンも連続(先頭.start〜末尾.end)なので **char-offset 不変条件・ハイライトは不変**。
   `expand_chunk` 頼みを ingest 時の構造に格上げ。
3. 見出し単体チャンクを**ベクトル検索から除外**(#4) — 索引の 1/3 のノイズを即除去。
4. (任意) 軽い overlap を**埋め込み入力にだけ**付け、境界跨ぎの取りこぼしを予防(保存スパンは非overlap維持)。

> 注: これらは検証フローで**効果を測ってから**入れる。特に「Hit@k が低い質問の target が
> 小ブロックに偏っていないか」を `eval:retrieval` で相関分析し、床併合の閾値を決める。

## B. 精度検証フロー設計(厳密 A/B)

### B.1 ゴール
1. **回帰防止**: 各変更で精度が落ちていないことを数値で保証。
2. **1変数 A/B**: 変更を1つずつ、**同一質問セット**で baseline と比較し delta を出す。
3. **層別診断**: 「検索が悪い」のか「合成が悪い」のかを切り分ける。

### B.2 二層メトリクス(検索と回答を分離)

| 層 | 指標 | 算出 | LLM | 目的 |
|---|---|---|---|---|
| **検索(retrieval)** | File Hit@k / MRR / Recall | 採用チャンクの `source.filename` に `target_md` が含まれるか | 不要(決定的) | 検索単体の質。安く高速 |
| **出典(citation)** | Citation Precision | 各 block の `citations` のうち `target_md` 由来の割合 | 不要 | 出典の正しさ |
| **回答(answer)** | Faithfulness / Answer Correctness | block 主張が引用 chunk で裏付くか / `target_answer` との一致度(1-5) | LLM-judge | 体感品質 |

- まず**検索層(LLM 不要)で全件**回す → 安く高速に回帰検知。
- **回答層(judge)**は検索 Hit したサブセット or サンプル N=50 に限定してコスト抑制。
- `domain`(finance 等)/ `type`(paragraph/table)で**層別集計** → 弱点箇所を特定(例: table が弱い)。
- **[F4 確定] JP はファイル単位 Hit が天井**。`docs/*.pdf.md` に**ページ境界マーカーが無い**
  (改ページ制御文字0、`---` は節区切りで PDF ページと無関係)ため `target_page_no` を md 上に
  マップできない。→ JP 検索指標はファイル単位 Hit のまま(直せない制約)。
  英語側は生成時に `target_heading_path`/`target_snippet` を持たせて細かく測る。粒度の非対称は許容する。

### B.2.1 検索モード・アブレーション(ハイブリッド vs ベクトルのみ)

「キーワード+ベクトルのハイブリッド」と「ベクトルのみ」のどちらが precise かを定量比較する。
**#1(日本語FTS)と交差する**ため、独立した質問ではなくアブレーション軸として組む。

- **重要な交絡**: 現状(英語 tsv で日本語)では docs/ で hybrid が vector_only に勝てない公算が高い
  (keyword 側が空振りし RRF が無寄与/ノイズ)。**#1 修正後**は固有名詞・コマンド名で hybrid が効くはず。
  → この比較を **#1 の前後で両方**回すと「hybrid の有効性」と「#1 の効果」を**同時に証明**できる。
- **想定結論は質問タイプ依存**(単一スコアではなく層別で見る):
  - `type: list`・固有名詞・コマンド名 → hybrid(keyword)勝ち
  - 言い換え・概念質問 → vector 勝ち

**比較は2平面ある。問いが違うので両方やる。**

| 平面 | 問い | 方法 | 性質 |
|---|---|---|---|
| **A. エージェンティック** | 出荷システムに**どの検索ツールを持たせる**と良いか | `createTools(session,{mode})` でツール実装を差替 | **製品実態**。非決定的 |
| **B. 決定的(プリミティブ単体)** | 検索アルゴリズム単体として hybrid は vector より precise か | 検索関数を固定 k で直接 | **科学的分離**。安い・揺れない |

- A は「エージェントにこのツールを持たせるべきか」(=出荷判断)、B は「アルゴリズム自体が優れているか」を測る。

**A の実装(最小差分)**: `retrieval.ts` にディスパッチャを足し、`createTools` を mode 化する。
```ts
// retrieval.ts
export type Mode = "vector" | "keyword" | "hybrid";
export function retrieve(q: string, k: number, mode: Mode) {
  return mode === "vector"  ? vectorSearch(q, k)
       : mode === "keyword" ? keywordSearch(q, k)
       : hybridSearch(q, k);
}
```
`createTools(session, { mode })` で 3つのリトリーバルツール
(`keyword_search`/`vector_search`/`searchKnowledge`)を全部 `retrieve(q,k,mode)` 経由にする。
ツール名(=エージェントから見える面)はそのまま、中身だけ mode で差替。`mode="hybrid"` が現状。

**A の落とし穴(厳密性のため明記)**:
1. 非決定的 → 温度0 ＋ 各質問 **k=3 回**で平均。B より必ずノイジー。
2. エージェントが穴を埋める: vector_only でも言い換えを増やして keyword 欠如を補う。
   → 「vector_only エージェント」≠「vector_only 検索」。これは欠点でなく**測定対象**(ツールを削った時の踏ん張り)。
   純アルゴリズム比較をしたいなら B が要る。
3. `score` は混在スケール(#3) → 比較は raw score でなく **rank/Hit@k** で。

**評価エントリ**:

| エントリ | 測るもの | 呼ぶもの | LLM |
|---|---|---|---|
| **`eval:retrieval`** (平面B) | 検索プリミティブのアブレーション | `vectorSearch`/`keywordSearch`/`hybridSearch` を直接 | 不要・決定的 |
| **`eval:agentic`** (平面A) | ツール mode 別のエージェント検索品質 | `runSearchAgent` + `createTools(_,{mode})` | 検索のみ・k回平均 |
| **`eval:e2e`** | 回答まで含めた体感品質 | フル agent + `streamAnswer` | judge |

**アブレーション・マトリクス**:
```
retrieval_mode    ∈ { vector_only, keyword_only, hybrid_rrf }
  × tsv_config    ∈ { english(baseline), japanese_fts(#1) }    ← #1 の効果も同時検証
  × heading_prepend ∈ { off, on(#2) }                          ← 余力があれば
  × chunk_strategy  ∈ { 現行block, block_v2(床併合+見出し前置き) }
                      ← 固定長との比較は不要(highlight のため block 強制=固定長は使えない選択肢)。
                         同じ block 系統内の改善効果だけ測る(循環しない)。
同一質問セット・同一 k で総当たり → Hit@k / MRR / nDCG を domain・type 別に集計
```

**「precise」の測り方(2段階)**:
1. 決定的(安い・全件): gold アンカー(`target_md`+`target_heading_path`+`target_snippet`)に対する
   **Hit@k / MRR / nDCG@k**。
2. 真の Precision@k(厳密・サブセット): 単一 gold では precision を過小評価するため、
   **judge が top-k の各チャンクを質問に対し relevant/not でラベル付け** → 実 Precision@k。
   ここで「hybrid の方が無関係を掴みにくいか」が正しく出る。

### B.2.2 どの指標を主役にするか(厳密性 vs 解釈性の解決)

「決定的(B)は厳密だが解釈しにくい / e2e は解釈しやすいが切り分けられない」は**対立ではなく階層**。

- **主役 = e2e 回答正答率**(judge・固定サブセット・温度0・k回)。最適化対象でありレポートする数字。
- **retrieval Hit@k は judge 不要でほぼタダ → 毎回・全件 必ず併走**(診断＋天井のため)。
- **決定的(平面B)は常用しない**。検索アルゴリズムを触る時 / e2e が僅差の時の**精密測定器**としてだけ出す。

**天井分解(厳密層を e2e の言葉に翻訳)**:
```
retrieval Hit@k = 80%   ← 根拠を出せた割合(正答率の天井)
e2e 正答率      = 65%   ← 実際に正しく答えた割合
  gap = 15%   → 「取れてたのに外した」= 合成ロス → P1-3(抽出 map-reduce)を直す
  1-80% = 20% → 「そもそも取れない」  = 検索ロス → P0-1/P0-2/検索モードを直す
```
- hybrid vs vector も **まず平面A を e2e で**測る(「hybrid 78% / vector 71%」で意思決定できる)。
  delta がノイズに埋もれる僅差の時だけ平面B に降りる。

### B.2.3 労力・健全性メトリクス(平面A のモード優劣の決着)

精度が僅差/同等のとき、**精度 × 労力**の2軸で優劣がつく。良い検索プリミティブほど
エージェントは少ない step で `select_sources` に到達する(`stopWhen: stepCountIs(12)`, `agents.ts:69`)。

```
mode     Hit@k   median steps   cap到達%   fallback%
hybrid    80%        3            2%         3%
vector    78%        7           18%        15%   ← 同精度を「倍の労力」で買っている=実運用で劣る
```
→ step数は落とし穴②(エージェントが言い換えを増やして穴を埋める)を**定量化**する。

**読み方**: step は**精度と同時に読む二次指標**。「step が少ない」だけでは良くない(早々に諦めた可能性)。
**精度が同等以上で step が少ない方が勝ち**(Pareto)。cap到達/fallback はフォールバック(#3 でスケール破綻)落ちの危険信号。

| 群 | 指標 | 意味 |
|---|---|---|
| 精度 | Hit@k / MRR / nDCG / e2e正答率 / Precision@k | 当たるか |
| 労力 | median steps / tool_calls / distinct queries | どれだけ働いて当てたか(平面A限定) |
| 健全性 | cap到達% / fallback% / tokens / latency | 破綻せず・安く到達したか |

### B.3 ハーネス構成

```
scripts/eval/
  gen-cases.ts  # markdowns/ から英語コーパス用ゴールド生成(chunk→LLM生成→品質ゲート)→ queries.en.json
                #   確定方針: 質問=日本語(cross-lingual) / 対象=散文+リンク列挙 両方(type で区別)
                #            / 各ファイル 3〜5問 × 17 ≈ 60〜85件
  run.ts        # 質問セットをループ。--entry retrieval|agentic|e2e / --mode vector|keyword|hybrid
                #   retrieval: 検索関数を直接(決定的) / agentic: runSearchAgent+createTools(_,{mode})
                #   e2e: フル agent + streamAnswer。結果を results/<runId>.json
  score.ts      # 採点。精度=Hit@k/MRR/nDCG(決定的) + 正答率/Precision@k(judge)。労力/健全性も集計
  report.ts     # baseline と比較し delta 表(全体＋domain/type 別＋天井分解)を出力
```

- 各 run に **メタ情報**を刻む: `git rev-parse HEAD` / 設定(entry・mode・tsv_config・heading_prepend・k)/ 日時(引数で注入)/ 質問サンプル ID。
- 結果は JSON(or 専用 `eval_runs` テーブル)に保存し、run 間 diff を可能に。
- **非決定性対策**(平面A/e2e): 温度0 ＋ 各質問 **k=3 回**で平均。judge もルーブリック固定プロンプト・温度0。

### B.4 手順(フェーズ順)

> 原則: **評価基盤を先に作り、baseline を固め、改善は1変数ずつ同一セットで delta を取る**。

**Phase 0 — 評価基盤(これ無しに改善は測れない)**
```
0a  英語ゴールド生成 gen-cases.ts → queries.en.json   ※3方針 確定済(日本語Q / 散文+リンク両方 / 60〜85件)
0b  ハーネス run/score/report 実装(3 entry × mode 対応)
0c  docs/ を ingest(日本語コーパスを queries.json に揃える。英語=markdowns は ingest 済)
```
**Phase 1 — baseline 確定(現状を測る。git SHA+config を刻む)**
```
1a  eval:retrieval 全件(日本語234 + 英語) → Hit@k/MRR(決定的・安い)
1b  eval:agentic 現行hybrid → Hit@k + step/cap/fallback
1c  eval:e2e judgeサブセット → 正答率 + 天井分解(retrieval Hit@k と並べる)
```
**Phase 1.5 — 検索モード・アブレーション(hybrid vs vector vs keyword)**
```
平面A(mode-swap)を e2e/Hit@k で3モード比較。僅差なら平面B(決定的)で精密測定。
※ tsv が英語のままなので keyword/hybrid は日本語で不利 → #1 の前後で2回回す
```
**Phase 2 — 改善を1変数ずつ(各ステップ Phase1 と同一セットで再計測 → delta)**
```
P0-1 日本語FTS    → 再ingest → 再計測 + モード・アブレーション再走(hybrid が効くようになったか)
P0-2 見出し前置き → 再ingest → 再計測
P1-4 (#3/#4)      → 再計測(再ingest不要)
P1-3 分解map-reduce → 再計測(gap=合成ロスが縮むか / レイテンシ・コスト併記)
各ステップ: domain/type 別 delta を確認、退行あれば revert
```

### B.5 厳密性の担保 / 落とし穴

- **1変更=1計測**: 複数同時適用は禁止(原因が切れない)。
- **同一セット固定**: サンプリングするなら seed 固定の同一 ID 集合を使い回す。
- **target_md は単一ファイル前提**: 実際は複数ファルにまたがる回答もある → File Hit は**下限の代理指標**と理解する(Recall を過小評価しうる)。
- **judge リーク**: `target_answer` は元文書由来 → 正解性判定には妥当。ただし judge に検索チャンクを見せない(独立採点)。
- **n の明示**: 234件は Hit 率の delta 検知には十分。サブセット judge は n を必ず報告。
- **コスト**: 検索層は埋め込み+ツールループのみで安い。judge は別モデル少数で。
- **[必須] トレースを見る(集計値だけで判断しない)**。実例: #2 の A/B で当初「変化なし」と誤断したが、
  原因は **baseline でなく #2 同士を比較していた**こと。真の baseline と chunk_id を差分したら Jaccard=0.002
  (ほぼ総入替)だった。block-recall も「59%→59%」と一致したが中身は総入替で、数だけ偶然一致。
  → 各 A/B で必ず: (1) **chunk_id 差分**(baseline vs 新; Jaccard が ~1 なら変化が起きていない=バグ疑い)、
     (2) **問題ごとの score 差分**(改善/悪化の内訳、悪化例の中身)、(3) 比較する result ファイルの**素性確認**。
- **[F1] 「決定的」の担保**: HNSW は近似探索。eval 時は `SET hnsw.ef_search` を固定し、
  クエリ埋め込みをキャッシュして bit 安定にする(でないと A/B の delta が ANN ノイズと混ざる)。
- **[F2] マトリクスのコスト境界**: `mode×tsv×heading×chunk` の全網羅は**決定的 retrieval 層だけ**。
  agentic/e2e は「勝った 2-3 config」のみ小サブセット(N=50)で回す(全網羅は agent 実行が数万回になり破綻)。
- **[F6] eval は prod と同じ関数を通す**: `eval:retrieval` も `searchKnowledge` 等 prod と同経路を呼ぶ
  (セッション除外を無効化したモードを関数側に持たせる)。別コードを叩くと別物を測る。

---

## C. 推奨アクション

1. **Phase 0(評価基盤)を先に作る** — これ無しに提案の効果は測れない。
   - ブロッカー: 英語ゴールド生成(0a)は **3方針(質問言語/対象ファイル/件数)の決定**が前提。
2. **Phase 1 baseline 取得済(E節)。結果で優先順位を組み替え**:
   検索は飽和(retrieval 損=0)、精度ロスは合成/パッセージ。よって **P1-3(最優先) → #2 → modality調査 → #1(降格)**。
3. Open Notebook 由来は **P1-3(分解 map-reduce)** のみ採用。検索融合は本アプリ優位なので踏襲しない。
4. ~~P0-1(日本語FTS)を最優先~~ → **降格**。keyword=0% は実バグだが e2e への影響は corpus 上ほぼ無い(検索損0)。

## D. 未決事項

**確定済:**
- 英語 eval セット: **必須**。質問=日本語(cross-lingual) / 散文+リンク列挙 両方 / 60〜85件 / `queries.en.json`。

**残(着手をブロックしない・走らせながら決めて可):**
- [F4] `docs/*.pdf.md` にページ境界マーカーがあるか(あればページ単位 Hit に格上げ。無ければファイル単位)。確認するだけ。
- judge に使うモデル(チャットと同一 `gemini-3.1-flash-lite` か、別系統で独立性確保か)。
- 結果の保存先(JSON ファイル or `eval_runs` テーブル)。

> **cross-lingual の帰結(結果の読み方)**: `queries.en.json` は日本語質問 × 英語資料。
> 日本語クエリは英語本文の全文検索にヒットしない(bigram も日本語本文向け)ので、
> **英語セットでは keyword 側が死に、hybrid ≈ vector になる**。よって
> (a) #1(日本語FTS)の効果は **docs/(JP)コーパス限定**、(b) 英語セットの検索は
> **cross-lingual 埋め込みが主役**。モード・アブレーションを英語/日本語コーパスで分けて読むこと。

## E. Phase 1 baseline 実測結果(JP queries.json 234件 / ファイル単位 Hit / sha b251787)

`scripts/eval/{run,score}.ts` で計測。クエリ埋め込みのみ(チャンクは ingest 済)。

```
mode      H@1     H@3     H@5     H@10    MRR
hybrid    97.0%   98.7%   99.6%   99.6%   0.980
vector    97.0%   98.7%   99.6%   99.6%   0.980   ← hybrid と完全一致
keyword    0.0%    0.0%    0.0%    0.0%   0.000   ← 日本語FTS 全滅(#1 実証)
```

**2つの確定事項**:
1. **#1 確定**: keyword は日本語で 0%。`websearch_to_tsquery('english', 日本語)` がフレーズ丸ごと1トークンを生成し不一致。
2. **hybrid ≡ vector**: keyword 無寄与のため RRF は実質ベクトル単独。

**重大な含意 — ファイル単位 Hit は飽和して測定器にならない**:
- vector が既に H@1=97% / H@10=99.6%。**伸びしろが無い** → #1/#2 を入れても**この指標では delta≈0**。
- 原因: docs は 51 ファイルだけで質問が1文書に紐づくため「正しいファイルを引く」のは自明。
  測るべきは「正しい**パッセージ**を引けたか」。
- **メトリクスの軸足を移す(plan 修正)**:
  - **(a) パッセージ単位 Hit**: `target_answer` を `target_md` 内でマッチ → char-span アンカーを導出し、
    取得チャンクとの**重なり**で採点(ページマーカー不要・F3 の戦略非依存アンカーを JP に適用)。
  - **(b) e2e 正答率**が実質の主役に繰り上がる(ファイル Hit 飽和なのでパッセージ選択＝合成段の質が効く)。
- ファイル単位 Hit は**サニティ床**として残すが、改善の判定からは外す。

> 次の実装: `score.ts` にパッセージ単位採点(char-span 重なり)を追加 → これが #1/#2/P1-3 を測る本命の指標になる。

### E.2 e2e baseline + 天井分解(N=50・judge=同一chatModel・sha b251787)

`scripts/eval/e2e.ts`。本番 `runSearchAgent → streamAnswer` を駆動し judge で target_answer と照合。

```
mean score(0-2)=1.320   correct(=2)=48.0%   partial+(>=1)=84.0%   cited target=86.0%
score 分布: 0→8 / 1→18 / 2→24
type別 正答率(=2): paragraph 54% / table 43% / image 42%
```

**天井分解(B.2.2 を実データで)**:
```
検索で正解ファイル取得 = 50/50 (100%)
検索損(取得できず外した) = 0 件
合成/パッセージ損(取得OKなのに不正答) = 26 件   ← 精度ロスの 100% がここ
空欄/放棄 = 2 件のみ(=パイプラインのバグや thoughtSignature の影響は軽微)
```

**【訂正】当初「精度ロスの100%が合成」と書いたのは誤り**(ファイル単位 Hit だけ見ていた)。
「ファイルを探す」と「ブロック(答えの段落)を探す」は別レイヤ。後者を測ると差が出た。

**E.3 ブロック単位リコール実測(数値含む27問・vector top-10・数値存在の proxy)**:
```
模範解答の数値が 取得チャンクに 全部入ってた=16(59%) / 一部=5 / 皆無=6
→ ファイル単位 Hit 97-99% に対し、ブロック単位リコール ≈ 59%(約4割は答えの根拠が top-10 に無い)
```
- 検証で md に数値は 80%+ 実在(E節 modality 調査)＝**変換で落ちている説は否定**。modality を別トラックにする必要は無い。

**確定した診断(修正版)**: 失敗は2つの混合。
- **(B) ブロック検索ミス(答えの段落が top-10 に無い)≈ 4割** → **#2(見出し前置き)・チャンク床併合**が直撃。
- **(A) 合成ミス(取れてたのに書けてない)** → P1-3。
- 空欄/放棄は2件のみ(thoughtSignature 等の影響は軽微)。

**→ 優先順位(修正版)**:
1. **#2(見出し前置き＋チャンク床併合)を昇格**。ブロック単位リコール 59% を直接押し上げる。安く再 ingest で test。
2. **P1-3(分解 map-reduce)**。取れた後の合成・被覆を改善。
3. **#1(日本語FTS)**: 答えは数値が多く、数値は ASCII トークン → keyword が数値ブロックをピンポイントで拾える
   可能性があり**再浮上しうる**(file 単位の0%とは別の効き方)。要 test。

**留保**: (1)上記は**数値存在 proxy**(カンマ表記等で false-negative あり、59% は下振れ)。
(2)N=50・judge 同一モデル系 → 48% は**相対 baseline**。(3)proxy 検索は vector 単独で、agent の実選択とは異なる。

## E.4 #2(P0-2 見出し前置き)A/B 結果(docs 再ingest後 / N=50 e2e・同一質問)

| 指標 | baseline | #2 | delta |
|---|---|---|---|
| e2e 正答(=2) | 48.0% | 56.0% | **+8pt** |
| e2e mean(0-2) | 1.320 | 1.400 | +0.08 |
| 問題ごと | — | 改善8 / 悪化5 / 同37 | 正味 +3 |
| 検索 top-10(vs baseline) | — | Jaccard 0.002 | ほぼ総入替 |
| ファイル Hit@10(vector) | 99.6% | 99.1% | ~同(飽和) |
| block-recall proxy | 59% | 59% | 数は同(中身は総入替) |

- **#2 は効果あり(小・ノイジー)**。検索結果は激変し、e2e は +8pt。ただし**5問は悪化**、n=50。
- **要追試**: net +3 がノイズか実効か確証するには n を増やす(N=234 e2e or N=100)＋悪化5問の中身精査。
- 教訓: 当初「効果なし」と誤断 → 原因は #2 同士の比較バグ(B.5 [必須]トレース参照)。**集計値だけ信じない**。

## 参考
- [lfnovo/open-notebook](https://github.com/lfnovo/open-notebook) — `open_notebook/graphs/ask.py`(分解 map-reduce)
- [DeepWiki: Search & Retrieval](https://deepwiki.com/lfnovo/open-notebook/6.5-search-and-retrieval)
- [DeepWiki: Chunking & Vectorization](https://deepwiki.com/lfnovo/open-notebook/6.2-content-extraction-and-vectorization)
