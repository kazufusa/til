# 実験記録 (Experiment Log)

## ★ 完成・最終まとめ(2026-06-25)

**達成**: 「精度イマイチ」の真因を特定し、回答精度を有意に改善。
- **真因**: 検索エージェントが合成を不完全な文脈で飢えさせていた(ツール選択ミス＋select_sources の過少選抜)。トレース調査で発見。
- **効いた改善(default 採用)**: 生の網羅 hybridSearch を合成に渡す(wide) + 日本語 keyword/heading 復活(BUG-2/3) + ツール名(BUG-1) + 見出し除外(#4)。

**確定スコア(clean N=100 / paired / retry付でerrors=0)**:
| | 完全正答(=2) | mean(0-2) |
|---|---|---|
| 改善前(narrow+keephead) | 55.5% | 1.345 |
| wide+#4 | 64.0% | 1.485 |
| **最終 wide+#4+section** | **67.0%** | **1.515** |
| paired(wide vs 原型) | — | **+0.140 ± 0.102 (有意✅)** |
| paired(section 上乗せ) | — | +0.030 ± 0.059 (正方向・非有意) |
- **累積 完全正答 55.5%→67.0%(+11.5pt)**。部品: 日本語 keyword 0%→96.6%。英語 ~82%。
- 採用(全default): wide(網羅文脈)+#4(見出し除外)+section(同heading_path兄弟展開=放棄ケース対策, EXP-014)。
- ベンチ教訓: 並列大量ランは rate-limit→ job単位 retry(指数backoff)で並列のまま errors=0。

**全部ハズレだったもの(取消)**: #2見出し埋込(ノイズ) / P1-3 chunk_id抽出(けち) / DECOMP(ノイズ) / **ON忠実版(有意に最下位 -0.313)** / direct=単一検索(同等だがagent撤去は最終手段) / wide-k20(改善なし)。
**Open Notebook は反証**: 忠実実装で有意に悪い。ONは出典を持たず精密QAに不向き。効いたwideはONの正反対。

**残課題(設計済・先送り; 理由=再ingest/要設計でコスト高・利得不透明)**:
- 放棄ケース(検索ロス: 答えblockが意味的に薄くtop-k外, "12%"型)→ チャンク床併合(P2-6, 再ingest要)。
- 英語 cross-lingual の弱keyword → クエリEN翻訳(要設計)。

**手法の教訓**: ①集計でなくトレースを見る ②file≠block ③エージェントe2eは非決定的→runs複数+95%CI ④比較はmean-vs-mvでなくpaired(compare.ts) ⑤検索proxy改善≠回答改善 ⑥並列大量ランはVertexレート制限でエラー多発(N=100並列は~50%失敗・汚染)→単独/低concで。

---


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

## EXP-006 P1-3 クエリ分解+根拠抽出(map-reduce) → 【不採用・フラグoff維持】
- 実装: `runDecomposedSearch`(`agents.ts`, `EVAL_P13=1` ゲート)。分解→各サブクエリ hybridSearch→
  map で chunk_id 抽出([F5]id のみ)→getChunksByIds→既存 streamAnswer。
- **結果 (N=50×3, vs EXP-005)**: mean **1.277 ± 0.123** (baseline 1.385±0.118) / correct 46.6%(−6.8) /
  partial+ 81.1%(−4) / cited 85.8%(−5.4)。
- **verdict: 当たりでない(悪化方向)。** CI は重なるが中心＋全副指標が揃って低下。cited 低下=抽出段が良チャンクを落とす兆候。
  **フラグ off のまま不採用**(コードは EVAL_P13 で温存)。

## 大結論(EXP-001〜006)
- **検索(ファイル単位)は終始飽和(97-99%)=ボトルネックでない**。retrieval proxy 改善は e2e に伝わらない/逆効果(2回)。
- e2e に効く**構造的レバーを3つ試し全てハズレ**: #2(ノイズ) / #4(悪化) / P1-3(悪化方向)。**e2e は ~mean1.38 / ~53% から動かない**。
- → 残りギャップは検索・選抜の構造でなく**下流(合成モデルの能力 or タスク難度: 部分回答・図表・複数事実)**の可能性大。
- **次の最有力**: 合成(chat)モデルを上位に差し替えて測る(`is it the model?` を1発判定)。効けば原因確定、効かねばタスク/データ側。
- 副次の残: P2-6 チャンク床併合(断片対策・再ingest要)、英語 eval セット(cross-lingual・必須だが未着手)。
- **確定して残る成果**: keyword 日本語復活(0→96.6%)、heading 復活、ツール名、評価ハーネス(並列/CI/トレース)、実験記録。

## EXP-007 英語コーパス baseline(cross-lingual: 日本語Q × 英語markdowns / queries.en.json N=20)
- gen-cases.ts で生成(品質ゲート全通過20件, list 多め, 11/16ファイル)。
- **検索3モード(決定的・生クエリ)**:
  | mode | H@1 | H@10 | MRR |
  |---|---|---|---|
  | vector | 70 | **90** | 0.754 |
  | keyword | 45 | 45 | 0.450 |
  | hybrid | 75 | 80 | 0.756 |
- **JP との決定的な違い**:
  - 日本語docs は検索飽和(97-99%)=合成がボトルネック。**英語(cross-lingual)は検索が未飽和(vector90/hybrid80)=検索自体がボトルネック・伸びしろあり**。
  - keyword は cross-lingual で弱い(45%、生の日本語Q×英語本文は trigram 当たらず)。
  - **弱い keyword が hybrid を引下げ**(H@10 80 < vector 90): RRF が 45% のノイズを混入。
  - ただし**agent 経由は別**: トレースで agent は英語語に翻訳して keyword 発行→機能(「agent が穴を埋める」)。決定的(生クエリ) vs agent で挙動差。
- **含意(改善方向が JP/EN で逆)**: 日本語=合成を直す / **英語=検索を直す**(クエリ EN 翻訳 or hybrid で keyword down-weight)。
- **留保**: N=20 で誤差大(±20%級)。方向性として読む。トレース: 5問とも正解ファイル命中、step 3-7、select_sources 毎回(健全)。
- result: `retrieval-{vector,keyword,hybrid}-queries_en_json-*.json`

## EXP-008 EVAL_WIDE 網羅検索を合成に渡す(検索エージェントの取りこぼし対策) → 【有望・採用候補】
- **発見の経緯(トレース駆動)**: 「合成ロス」と思っていた部分回答は、(1)正解ブロックが top-10 に無い(検索ロス) か、
  (2)候補にはあるが検索エージェントが select_sources で取りこぼす、さらに (3)**エージェントがツール選択を誤り
  (keyword だけ呼ぶ等)候補プール自体に必要チャンクが入らない**、が真因。**合成(チャットエージェント)は悪くない**。
- **修正**: `runSearchAgent` の返却を選抜だけに縛らず、**直接 `hybridSearch(question,12)` を足して**網羅的文脈を渡す(`EVAL_WIDE=1` ゲート)。
  検証: 取りこぼしていた6事実(時系列)が **3回とも 6/6** 揃うように。
- **結果 (N=50×3, vs EXP-005)**: mean **1.520 ± 0.104** (baseline 1.385±0.118, **+0.135**) /
  correct 53.4→**60.7%** / partial+ 85.1→**91.3%** / cited 83.1→**95.3%**。**全指標が一貫して上昇**。
- **有意性**: mean +0.135 ≈ 1.7σ(95%にわずか届かず、CI 微重複)だが副指標が全部上 → 実効ほぼ確実。要追試で確定。
- **教訓(大)**: **Open Notebook の本質は map-reduce の“形”でなく「網羅検索した文脈を全部 合成に渡す(合成を飢えさせない)」**。
  P1-3 は抽出を chunk_id だけにして“けちな選抜”を再導入し ON と逆をやっていた(=EXP-006 が悪化した理由)。
  IMPROVEMENT.md は retrieval 部品いじりに偏り、この「検索エージェント→合成の文脈受け渡し」を欠いていた。
- **次**: (1)追試で有意確定 (2)採用方法の設計判断: フラグoff→default化 / そもそも agentic 検索を hybridSearch 直叩きに簡素化
  (agentのツール選択が取りこぼしの元) (3)P2-6 チャンク床併合は放棄(score0=検索ロス)向けに別途。
- result: `e2e-...-158b851-1782408555318.json`

## EXP-009 検索エージェント撤去アブレーション(EVAL_DIRECT: 単一 hybridSearch top-k 直結)
- 目的: 真因がエージェントの取りこぼしなら、エージェントを外して網羅検索直結で同等以上になるはず、の検証。
- **結果 (N=50×3, vs wide 1.520±0.104 / narrow 1.385±0.118)**:
  | k | mean ± CI | correct |
  |---|---|---|
  | 10 | 1.372 ± 0.127 | 55.9% |
  | 15 | 1.475 ± 0.117 | 60.3% |
  | 20 | **1.514 ± 0.115** | 63.4% |
  - (注: 3並列実行でレート制限 errors 8 程度・少しノイジー)
- **判明**: **エージェント無し・単一 hybridSearch top20 が wide(エージェント有り)とほぼ互角**(1.514≈1.520)。
  = **エージェントは精度には寄与していない**。文脈量(k)が効く(k20>k15>k10)。
- **ただし採用しない**: ユーザ方針「**検索エージェント撤去は最終手段**」。スキル自動実行・深掘りセッション・柔軟性を残す。
  → EVAL_DIRECT/DECOMP は**天井の参考値**であって採用経路ではない。

## EXP-010 ON 流 分解+全チャンク合成(EVAL_DECOMP: 抽出せず候補18を全部渡す) → 【不採用】
- P1-3 の“けちな抽出”を外した正しい ON 形。分解→各サブで hybridSearch→候補を全部 合成へ。
- **結果**: mean **1.413 ± 0.114** / correct 54.7% / partial+ 86.7% / cited 93.3% (N=50×3, scored150)。
- **判定**: wide(1.520)/direct-k20(1.514) より**下**、narrow(1.385)並み。分解はこのコーパスで効かない
  (サブクエリが的を外し、和集合にノイズ → 文脈が薄まる。単一の網羅検索の方が的確)。**不採用**。
- → **現行 default(wide=エージェント+単一網羅 hybridSearch)が全構成中ベスト**。

## EXP-011 wide 文脈量 k=20 → 改善なし
- `EVAL_WIDE_K=20`。mean 1.493±0.117 / correct 63.3% (vs wide k12: 1.520±0.104)。**k 増やしても改善なし**(ノイズ内)。
  → 現行 default k=12 維持。

## EXP-012 #4 見出し除外を“修正後ベースライン”で再評価(EVAL_NOHEAD × wide)
- 経緯: EXP-003 の「#4 悪化」は**バグ修正前・narrow ベース**で測ったもの＝無効、という指摘を受け再評価。
- **paired vs wide: delta +0.040 ± 0.080**(改善9/悪化6)。**旧 −0.135 → 今 +0.040**。有意ではないが**もう害ではなく微プラス**。
- 判定: 「修正前の評価は stale」が正しかった。#4 は無害＋概念的に妥当 → 採用可レベル(有意化は要追試)。

## EXP-013 ON 忠実版(EVAL_ON: 分解→各サブで検索+“テキスト抽出”→テキスト統合) → 【有意に悪い・最下位】
- P1-3(chunk_id 抽出=けち)も DECOMP(抽出なし=ノイズ)も ON 本体でない。ON の核心=**各サブを焦点テキストに脱ノイズしてから統合**を初めて忠実実装(`runOnAnswer`)。出典は ON 同様持たない。
- **結果**: mean **1.191 ± 0.121** / correct 38.3%。**paired vs wide: -0.313 ± 0.193 → 有意に悪い**(改善6/悪化18)。narrow(1.385)より下、全構成中最下位。
- **理由**: テキスト抽出が lossy(数値・詳細が落ち「該当情報なし」量産)。合成が**生チャンクに触れず digest 済み薄い要約だけ**→詳細を回復できない。分解+抽出+合成の誤差が積層。
- **最終結論(ON スレッド)**: **ON のアーキは忠実実装+paired 測定でこのタスクに有意に劣る**。効いた wide(生の網羅チャンク→出典付き合成)は ON の“圧縮してから統合”の**正反対**。
  「Open Notebook から借りる」前提は**反証**。ON は広い要約/ポッドキャスト向き、精密事実QA+出典には不向き。勝因は自前トレース診断(合成を飢えさせない)。

### 【重要】ON は出典(citation)を持たない — ask.py 精読で判明
ON の `provide_answer` は各サブの取得 id を集めるが `ThreadState.answers` には**テキストのみ**蓄積、最終回答へ id は流れない。
→ **ON のアーキは出典機能と非互換**。うちの看板(chunk_id→ハイライト)を保つには ON をそのまま使えない。
P1-3 が chunk_id 抽出にして失敗したのは「出典付きで ON を真似ようとした」ため。wide は出典を保つ正しい翻案。

---

## EXP-015 検索手法 A/B/C(vector / keyword=similar / hybrid)を e2e 全ケースで比較 + トークン計測
- **日時/sha**: 2026-06-26 / 9f9d037。回答生成パイプラインを手法切替可能にして比較(従来 e2e は hybrid 固定)。
- **実装**: `retrieve(q,k,mode)` を retrieval.ts に昇格。`runSearchAgent(q,sid,mode)` / tools の本文検索3ツール(vector_search/keyword_search/search_knowledge)+ step② 網羅検索を**全て mode に統一**(エージェント挙動は一定・ランキング関数だけ差替=統制比較)。`e2e.ts --mode`。
  - **トークン計測**: `usage.ts`(AsyncLocalStorage)で1ケース単位に LLM(検索エージェント+合成、judge除外)と embedding を按分。embedding adapter が `usageMetadata.totalTokenCount` を返すよう改修。本番は withUsage 外=no-op。
- **対象**: JP(queries.json N=234)+ EN(queries.en.json N=20)× 3手法 = 762 ラン、runs=1、conc=6、errors=0。
- **指標(JP N=234)**:
  | mode | mean | correct(=2) | partial+ | cited | retrieved | LLMin/件 | embed/件 |
  |---|---|---|---|---|---|---|---|
  | vector | 1.500 | 64.1% | 85.9% | 95.3% | 98.7% | 22,178 | 55(2.5回) |
  | keyword(similar) | 1.436 | 62.8% | 80.8% | 93.2% | 98.3% | **25,417** | 0 |
  | **hybrid** | **1.568** | **69.7%** | **87.2%** | **97.0%** | **99.1%** | 23,246 | 53(2.4回) |
- **paired(delta=B-A, N=234)**: hybrid vs keyword **+0.132±0.072 ✅** / hybrid vs vector **+0.068±0.060 ✅** / vector vs keyword +0.064±0.077(有意差なし)。
- **質問単位の差分(割れた64問)**: vector>keyword 30 / keyword>vector 19 / hybrid単独最良 10 / hybrid単独最低 7。
  - type偏り: **V>K は image/paragraph(意味マッチ・言い換え)、K>V は paragraph/table(固有名詞・数値・識別子の逐語一致)**。相補関係。
  - hybrid単独最良10件=両単独が「結論は当てるが数値/理由の一部を欠く」→ 融合で事実集合が揃う。
  - **hybrid単独最低7件は全件 retr=1 cited=1 → 検索でなく合成段の数値誤り(e2e非決定ノイズ)**。手法起因でない。
- **検索ロス vs 回答ロス**: retr=0(真の検索ミス)は全手法2-4件のみ。差の大半は**「引けても使えない」回答段**。keyword は retrieved-but-not-cited が最多12件(語彙一致でファイルは引くが逐語表現が無く LLM が放棄)→ hybrid は5件に圧縮=検索→引用の変換効率が最高。
- **コスト**: embedding(53-55tok=LLM入力の~0.2%)は誤差。**keyword は LLM入力最大(vector比+14.6%)なのに最低スコア=厳密劣後(dominated)**。hybrid は vector比+~5%で +0.068。効率順 hybrid>vector>>keyword。
- **EN(cross-lingual N=20, 誤差大)**: vector 1.600/75% | keyword 1.650/80% | hybrid 1.650/80%。検索段が逆転:**keyword の retrieved が 80% に低下**(日本語Q×英語本文で概念クエリが逐語一致せず取りこぼし)が、識別子・ハッシュ・型番の照会は言語非依存トークンで keyword が vector を圧倒。hybrid が両取りで net 最良。JP の機序と整合。
- **verdict**: **既定手法は hybrid を採用すべき**(現状の本番 default と一致)。JP は「引けても使えない」回答ロス最小化、EN は keyword の完全一致+vector の recall 両取りで、別々の理由から最良。コスト増は vector 比 ~5%。**keyword 単独は cross-lingual の識別子照会以外で非推奨(高コスト・低品質)**。確信度: JP 高(paired CI が0を除外)/ EN は N=20 で方向性のみ。
- **result**: `e2e-{vector,keyword,hybrid}-queries_json-9f9d037-*.json` / `e2e-{...}-queries_en_json-9f9d037-*.json`

## EXP-016 head-to-head 判定(模範解答を捨て、実ソース照合で3手法を採点)
- **動機**: EXP-015 の正答率は gold(`target_answer`)基準。gold が不完全だと、ソース的に正しい回答を「gold と不一致」で減点する。→ **gold を捨て、実ソース文書(docs/markdowns)だけを正解基準**に、3手法の回答を Claude サブエージェントが head-to-head 採点。
- **手順**: `headtohead.ts` で各質問×3手法の**回答全文**を生成保存(judge無し・254req×3=762回答, gen費 **$5.31**, 並列3手法×質問8→429頻発のため質問3並列=9パイプラインで errors=0)。回答をファイル単位16バッチに分け、16サブエージェントが各質問のソース該当箇所を Grep/Read して 0/1/2 採点(gold は見せない)。
- **結果(ソース基準, n=254)**:
  | 指標 | vector | keyword | hybrid |
  |---|---|---|---|
  | mean ALL | 1.827 | 1.720 | **1.866** |
  | mean JP(234) | 1.842 | 1.748 | **1.876** |
  | mean EN(20) | 1.650 | 1.400 | **1.750** |
  | =2率 JP | 88.0% | 80.8% | **89.7%** |
  | =0率 JP | 3.8% | 6.0% | **2.1%** |
  | 単独勝ち | 12 | 8 | **13**(tie 221) |
- **gold比**: gold judge の JP mean(vector1.500/keyword1.436/hybrid1.568)より**ソース基準は +0.3 以上高い**。「JP が低い」のは gold の不備が主因と確認(ユーザ指摘が正しかった)。**ランキングは gold と同一(hybrid≥vector>keyword)** で、結論は頑健。
- **type別(JP)**: paragraph(108) h1.94最高 / table(66) h1.88最高 / **image図表(60) v1.87 > h1.77(vector勝ち)**。hybrid は図表で**ソースに無い表を捏造**する事故(日米がん原性比較表, SHA512別版混入)。
- **手法の性格(回答精読)**: keyword=「ソースに答えがあるのに放棄(コンテキストから確認できない)」が一貫した失敗、当たれば満点・外すと0の両極端、EN で致命的(=0 25%)。hybrid=致命的失敗最少で総合最安定だが図表で捏造リスク。vector=図表で堅実、稀に出典外混入。共通弱点=長大表/リストのチャンク境界跨ぎ取りこぼし・他ファイル混入(k8s SHA512 クロス汚染)。
- **verdict**: **既定は hybrid。**ただし図表特化なら vector も可。**keyword 単独は非推奨**(放棄癖・cross-lingual 脆弱)。gold-free 判定でも EXP-015 の結論を追認。
- **教訓**: gold が不確かなコーパスでは、retrieval 手法比較は**ソース照合 head-to-head が gold judge より公正**(絶対値の天井が +0.3 上がる)。ランキングは両者一致したので手法選択の結論は安全。
- **result**: `h2h-queries_{json,en_json}-9f9d037-*.json`(回答全文+per-method/per-requestトークン)、判定 verdict は scratch。

## EXP-017 chat モデル比較(gemini-3.1-flash-lite vs gemini-2.5-flash-lite)× 3手法
- **方法**: `GEMINI_CHAT_MODEL` を差し替えて headtohead 生成を再実行(2.5)、16サブエージェントで実ソース照合・再採点(EXP-016 と同手順・gold不使用)。比較JSON+HTMLレポートを `build_report.py` で生成。
- **品質(ソース基準 mean, 全254)**:
  | model | vector | keyword | hybrid |
  |---|---|---|---|
  | gemini-3.1-flash-lite | 1.827 | 1.720 | **1.866** |
  | gemini-2.5-flash-lite | 1.720 | 1.492 | **1.760** |
  - **3.1 が全手法で上**。手法内は両モデルとも hybrid>vector>keyword で一貫。**2.5 は keyword が大きく劣化(放棄癖・他文書混入・捏造が顕著、出力トークン約2倍で冗長)**。
- **コスト(762回答生成)**: 3.1 = **$5.31**(per-req $0.0209/per-ans $0.0070, 単価 in$0.25/out$1.50) / 2.5 = **$1.81**(per-req $0.0071/per-ans $0.0024, 単価 in$0.10/out$0.40)。**2.5 が約3倍安い**。
- **トレードオフ**: 2.5-hybrid(1.760)は 3.1-keyword(1.720)を上回りコスト1/3 → 「3.1-hybrid=最高品質」か「2.5-hybrid=品質-0.1で1/3コスト」。
- **成果物**: `h2h-report.html`(両モデルのサマリ/トークン・金額/質問別回答横並び), `h2h-comparison.json`, `build_report.py`(再生成), `h2h-g25-*.json`。

---

## 決定と次の手(最新)

**最終確定(EXP-013 時点・全部 paired で検証)**:
- ✅ **唯一の有意改善 = wide**(エージェント+生の網羅 hybridSearch を出典付き合成へ)。paired vs narrow **+0.127±0.099**。default 化済。
- ❌ **Open Notebook は反証**: 忠実版 EVAL_ON は paired -0.313(有意に悪い・最下位)。ON は出典も持たず本タスクに不向き。
- ◯ **#4(見出し除外)**: 修正後 baseline では無害化(+0.040, 非有意)。採用可だが効果は小。
- ⊘ 無寄与/不発: narrow / direct(agent撤去=最終手段) / decompose / P1-3 / wide-k20。
- agent は精度に無寄与だが**機能(スキル/セッション)のため残す**。

**確定方針**:
- **検索エージェントは残す**(撤去は最終手段)。精度の本命レバーは「**合成を網羅文脈で飢えさせない**」。
- **採用済(default)**: EVAL_WIDE = エージェント + 直接 hybridSearch(12) を足して合成へ(EXP-008, mean 1.520)。`EVAL_NARROW=1` で旧挙動。
- **不採用/取消**: #2(ノイズ)・#4(悪化)・P1-3(けちな抽出で悪化)。詳細は本ログ上方 + ACCURACY_IMPROVEMENT.md。

**次の手(優先順)**:
1. EXP-010(分解+全渡し)の結果待ち → wide 超なら「エージェント+分解augmentation」を実装(エージェント温存)。≈なら現行維持。
2. EVAL_WIDE の有意性を N拡大/runs増で確定(現状 ~1.7σ)。
3. 放棄ケース(score0=検索ロス: 答えのblockがtop-kに無い)対策: チャンク粒度/床併合/ranking。
4. 英語(cross-lingual)は検索が未飽和 → クエリEN翻訳/弱keyword down-weight。

**評価フラグ一覧(`agents.ts`)**:
- (default) = エージェント + 網羅augmentation(EVAL_WIDE 相当)
- `EVAL_NARROW=1` = 旧・選抜だけ / `EVAL_DIRECT=1`(+`EVAL_DIRECT_K`) = エージェント撤去・単一検索 /
  `EVAL_DECOMP=1` = 分解+全渡し / `EVAL_P13=1` = 分解+chunk_id抽出(不採用) / `EVAL_TRACE=1` = ツール呼出トレース

---

## 次の実験(予定)
- EXP-003 候補: #2 を N=234 or N=100 で追試(有意性確認) / 悪化5問のトレース精査
- EXP-004 候補: P1-3 (クエリ分解 + 根拠抽出 map-reduce) — 合成段=実ボトルネックを叩く
