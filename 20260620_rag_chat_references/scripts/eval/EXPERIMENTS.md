# 実験記録 (Experiment Log)

精度改善の A/B を1実験=1エントリで記録する。生トレースは `scripts/eval/results/*.json`、
本ファイルは curated な要約。設計・方針は `../../ACCURACY_IMPROVEMENT.md`。

**記録ルール (毎回)**:
- config: git sha / 変更点 / 対象コーパス / N / judge
- 指標: e2e(正答=2, mean) / 検索(file Hit) / 該当する補助指標
- **トレース**: baseline との chunk_id 差分(Jaccard) / 問題ごとの score 改善・悪化の内訳 / 悪化例の中身
- verdict と 次アクション。比較した result ファイル名を明記(素性の取り違え防止)。

---

## EXP-001 baseline (改善なし・現状把握)
- **日時/sha**: 2026-06-25 / b251787  (アプリ未改変)
- **コーパス/DB**: docs/ (51 files, 7,109 chunks) 本文のみ埋め込み
- **指標**:
  - 検索ファイル単位(JP 234): hybrid = vector = H@1 97.0% / H@10 99.6% / MRR 0.980。**keyword = 0.0%(日本語FTS全滅)**
  - e2e (N=50): 正答(=2) **48.0%** / mean **1.320** / partial+ 84.0%
  - block-recall proxy (数値27問): full 59% (16/5/6)
- **トレース天井分解**: 正解ファイル取得 50/50、検索損0、合成/パッセージ損26。空欄/放棄2のみ。
- **所見**: ファイル検索は飽和(改善余地なし)。精度ロスは下流(ブロック選択+合成)。
- **result**: `retrieval-{hybrid,vector,keyword}-...-1782396*.json`, `e2e-...-1782397702378.json`

## EXP-002 #2 / P0-2 見出しパスを埋め込みに前置き
- **変更**: `embedText()` で埋め込み入力を `heading_path + 本文` に。保存 content/offset は不変(ハイライト維持)。
  実装 sonnet → opus レビュー APPROVE。docs/ 強制再ingest(reset-docs.ts → MARKDOWN_DIR=docs ingest)。
- **検証**: 保存ベクトルが見出し付きテキストと cos=1.00000 一致 = #2 適用済を確認。
- **指標 (N=50・同一質問・vs EXP-001)**:
  - e2e 正答(=2): 48.0% → **56.0%** (+8pt) / mean 1.320 → **1.400**
  - ファイル Hit@10(vector): 99.6% → 99.1% (~同・飽和)
  - block-recall proxy: 59% → 59% (数は同、中身は総入替)
- **トレース**:
  - chunk_id 差分(vs 真の baseline): top-10 完全一致 **0/234**, 平均 **Jaccard 0.002** = ほぼ総入替。
  - 問題ごと score: **改善8 / 悪化5 / 同37** (正味 +3)。
  - 悪化例: 「面積/デザインは正確だが枠線・書体の指定が欠落(2→1)」「世帯数でなく個人数を回答(1→0)」等。
- **落とし穴(記録)**: 当初「変化なし」と誤断 → **#2 同士を比較していた**バグ。真 baseline と差分し直して発覚。
  block-recall の 59%一致も中身は総入替。**集計値だけで判断しない / chunk_id 差分を必ず取る**。
- **verdict**: **効果あり(小・ノイジー)**。検索は激変、e2e +8pt。ただし悪化5問・n=50で**未確定**。
- **次**: (a) N を増やして +3 がノイズか確認 (b) 悪化5問を精査 (c) 本命 P1-3(合成段)へ。
- **result**: `retrieval-vector-...-1782400404159.json`, `e2e-...-1782400957502.json`

## EXP-003 #4 見出しチャンクをベクトル/全文検索から除外 → 【不採用・revert】
- **変更**: `vectorSearch`/`keywordSearch` に `block_type <> 'heading'`(retrieval.ts)。再ingest不要。#2 の上に積む。
- **指標 (N=50・vs EXP-002 #2)**:
  - ブロック・リコール proxy: 59% → **67%** (+8、検索は改善)
  - 検索 chunk_id 差分 vs #2: Jaccard 0.477 (224/234問で変化)
  - ファイル Hit@1: 96.6% → 97.9% (飽和域)
  - **e2e 正答(=2): 56.0% → 48.0% (−8pt)** / mean 1.400 → 1.220 / **partial+ 84%→74%**
  - 問題ごと: 改善4 / 悪化10 / 同36 (**正味 −6**)
- **所見**: **検索リコールは上がったが e2e は下がった**。見出しチャンクは中身ゼロでも合成段に
  構造・文脈の手掛かりを与えており、除外したらエージェントが章を見失い**回答放棄が増えた**。
- **留保**: e2e エージェントは非決定的・N=50単発 → −6 の一部はノイズの可能性。ただし改善/悪化の非対称
  (4 vs 10)＋partial+低下＋「放棄」増は実害を示唆。
- **verdict**: **不採用。retrieval.ts を revert。** 一次指標(e2e)で回帰。
- **教訓(重要)**: **「検索 proxy の改善 ≠ 回答の改善」がこれで2回目**(#2 でも recall proxy は動かないのに e2e は+)。
  → retrieval 層の proxy を最適化しても無意味なことがある。**判断は必ず e2e で**。
- **result**: `retrieval-vector-...-1782401628515.json`, `e2e-...-1782402129685.json`

### ハーネス改善(この回で実施)
- e2e を**並列化**(`--concurrency` 既定6・順序保持)＝今後の実行が数倍速。
- 進捗を `results/.e2e-progress` に**即時flush**書き込み → `tail -f` で live 監視可(stdoutパイプのバッファ問題回避)。

## TRACE-001 エージェント挙動調査(EVAL_TRACE) → 既存バグ発覚【baseline以前】
- **方法**: `agents.ts` に `onStepFinish` トレース(env `EVAL_TRACE=1`)を追加し、代表5問でツール呼び出しを記録。
- **判明した欠陥(改善でなくバグ。直してから再baseline)**:
  1. **keyword_search が日本語で毎回 0件**。エージェントは毎問これに1ステップ無駄打ち(#1 の実害)。
  2. **search_headings も日本語で 0件**(trigram `%` 閾値)。→ keyword+heading の2モダリティが死亡、実質 vector 単独。
  3. **ツール名バグ**: 定義は `searchKnowledge`(キャメル)だけ、他は snake_case。モデルが `search_knowledge` と
     誤呼出し→空振り→1ステップ無駄(EXP トレース Q2 で観測)。
  4. **flail(迷走)**: step 6/7/5/11/9。死んだツールに当たり続け vector を言い換え連打。Q4 は cap(12)寸前。
     `search_files` は毎回20件で絞れず。
- **含意**: #4 が e2e を下げた理由が判明(heading 検索が既に死亡 → vector が章脈源 → 見出し除外で文脈喪失)。
  retrieval 微調整が e2e を動かさない理由も(エージェントが言い換えで穴埋め)。**#1 は降格でなく最優先のバグ**。
- **教訓**: **エージェント系はトレースを最初に見る**。挙動を見ずに集計だけで baseline/改善を語ると、
  壊れた土台の上で測ることになる。

## 修正タスク(Phase −1 / baseline以前)
- [x] **BUG-1** ツール名 `searchKnowledge`→`search_knowledge`(snake_case 統一)。commit bf63328。
- [x] **BUG-3** 日本語 search_headings。**閾値廃止・top-k**(trigram 既定0.3が日本語に高すぎ)。検証OK。
- [x] **BUG-2** 日本語 keyword。pgroonga不要、**pg_trgm `word_similarity` の top-k**で実装(イメージ入替・再ingest不要)。
      設計方針: 閾値チューニングを避け **類似度で並べて上位k**。検証: 正解ファイルがトップに来た(01.pdf 0.31 / itaku 0.63)。
      perf: seq scan で ~1.2s/クエリ。要なら GiST trigram(`<->>` KNN)で高速化(別途・試作番号)。
- [ ] **re-baseline**(keyword 0%→? / hybrid が真にhybridに / e2e) ← 次。その後 P1-3 等の改善実験。

> 設計ルール追記: 検索の絞り込みは**閾値でなく top-k**(マジックナンバー回避)。変種は試作番号で記録し A/B 可能に。

## EXP-004 re-baseline(BUG-1/2/3 修正後)
- **検索(決定的・信頼できる)**:
  | mode | 修正前 | 修正後 H@1/H@10/MRR |
  |---|---|---|
  | vector | 97/99.6 | 97.9 / 98.7 / 0.983 |
  | **keyword** | **0/0** | **78.6 / 96.6 / 0.839** |
  | hybrid | =vector | 96.6 / 99.6 / 0.977 |
  - **keyword 0%→96.6%(H@10)= BUG-2 の実効を決定的に確認**。hybrid が真の融合に。
  - ただしファイル単位は飽和(97-99%)で頭打ち → retrieval 指標では bug 修正の差が出にくい。
- **e2e(N=50)**: 48.0%(mean 1.340)。これまで 48/56/48/48 → **56 は外れ値(ノイズ)**。
  - **重大: e2e は N=50 単発で ±8pt のノイズ**(エージェント非決定)。#2 の「+8pt」はノイズの公算。
    **±8pt のノイズで ±8pt の delta を見ていた = ノイズ追従。**
- **結論/教訓**:
  - 検索(ファイル単位)はボトルネックでない(終始飽和)。bug は実在し修正済(keyword 実証)。
  - **e2e の delta を測るには N=234 か k回平均でノイズ帯を狭めるのが前提**。これ無しに合成改善(P1-3)を測っても無意味。
- **next**: (1) e2e のノイズ低減(N拡大 or k=3平均を harness に) (2) その上で P1-3。
  併せて step数(労力)で bug 修正の flail 減を測ると、決定的に効果が見える可能性。

## EXP-005 低ノイズ baseline(N=50 × runs=3 / バグ修正後 sha d732d04)
- 目的: e2e の ±8pt ノイズ(EXP-004)を潰し、改善判定の基準帯を作る。`--runs 3`(各問3回)+ 95%CI を実装。
- **結果: mean 1.385 ± 0.118 (95%CI)** / correct 53.4% / partial+ 85.1% / cited 91.2% (148/150 scored, err 2)
- これまでの単発 mean 1.32/1.40/1.34 は**全てこの帯(±0.118)の中** = やはりノイズ。真の中心 ~1.385。
- **判定基準**: 改善は mean を **+0.12 超**動かせば有意(or 同 runs=3 で CI 非重複)。
- result: `e2e-...-d732d04-1782405911701.json`

## EXP-006 P1-3 クエリ分解+根拠抽出(map-reduce) 〔実行中〕
- 実装: `runDecomposedSearch`(`agents.ts`, `EVAL_P13=1` ゲート)。分解→各サブクエリ hybridSearch→
  map で chunk_id 抽出([F5]id のみ)→getChunksByIds→既存 streamAnswer。フラグoffは従来不変。
- 測定: `EVAL_P13=1 ... --n 50 --runs 3`、baseline(EXP-005 1.385±0.118)と比較。→ 結果待ち。

---

## 次の実験(予定)
- EXP-003 候補: #2 を N=234 or N=100 で追試(有意性確認) / 悪化5問のトレース精査
- EXP-004 候補: P1-3 (クエリ分解 + 根拠抽出 map-reduce) — 合成段=実ボトルネックを叩く
