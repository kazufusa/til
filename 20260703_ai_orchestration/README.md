# AI Orchestration Patterns Demo (ローカルLLM / TypeScript / CLI)

Anthropic の [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) にある
オーケストレーションパターン 5 種 + 耐久性(durable execution / checkpoint&resume)1 種 +
エージェント suspend&resume(サブエージェント委譲 → 親停止 → 復活)1 種の計 7 パターンを、
**完全ローカル**(Ollama + qwen3:4b-instruct)で動かす CLI デモ。Web UI なし。

- Runtime: Bun + TypeScript
- LLM: Ollama の OpenAI 互換エンドポイント (`http://localhost:11434/v1`)
- SDK: Vercel AI SDK (`ai` v7 + `@ai-sdk/openai-compatible`) + `zod`(structured outputs)

## Setup

```sh
ollama pull qwen3:4b-instruct   # 非thinkingモデル(理由は下記)
ollama serve                    # 起動していなければ
bun install
```

## Usage

```sh
bun run demo <pattern>

# patterns:
#   chaining      1. prompt chaining      — 逐次ステップ + プログラム的ゲート
#   routing       2. routing              — 分類 → 専用ハンドラへ振り分け
#   parallel      3. parallelization      — 並列レビュー → 集約
#   orchestrator  4. orchestrator-workers — LLM が動的にタスク分解 → worker 並列実行 → 統合
#   evaluator     5. evaluator-optimizer  — 生成 ⇄ 批評ループ
#   durable       6. durable workflow     — checkpoint & resume (--crash / --reset)
#   suspend       7. suspend & resume     — サブエージェント委譲 → 親停止 → 復活
#   all           全パターン順次実行

# 例: 途中クラッシュ → 再開のデモ
bun run demo durable --crash   # step 2 の後で疑似クラッシュ(checkpoint はディスクに残る)
bun run demo durable           # step 1-2 は checkpoint から再生、step 3 から再開

# 例: エージェントの suspend → サブエージェント処理(数分)→ 復活のデモ
bun run demo suspend start    # 親: 計画 → 調査をサブエージェントに委譲 → セッション直列化 → プロセス終了
bun run demo suspend worker   # 別プロセス: サブエージェント実行(数分)→ 親セッション復元 + レポート注入 → 親がメモ完成
bun run demo suspend status   # ディスク上の状態確認
```

環境変数: `MODEL`(既定 `qwen3:4b-instruct`)、`OLLAMA_BASE_URL`。

全 LLM 呼び出しはステップ毎に 所要時間 / input・output トークン をログし、最後に合計を表示する。

## 非同期・並列・停止/復帰について

- **非同期・並列**: プロセス内なら `Promise.all` で自然にできる(パターン3, 4)。
  ただし Ollama は既定で 1 モデルにつきリクエストを直列処理するため、ローカルでは
  並列化の壁時計短縮は出ない(`OLLAMA_NUM_PARALLEL` を上げるかリモート API なら効く)。
- **長時間処理の停止 → 復帰**: AI SDK は非同期プリミティブだけで**永続化は何もしない**。
  プロセスが死ねば全部消える。復帰にはアプリ側で状態を checkpoint する必要がある
  (パターン6が最小実装: 各ステップ完了ごとに JSON へ保存 → 再実行時は完了済みステップをスキップ)。
  本番規模なら Temporal / Inngest / Prefect などの durable execution エンジンの領分。
- **プロセスを跨ぐ非同期(fire-and-forget)**: AI SDK / Ollama の呼び出しは HTTP 接続に
  縛られた同期リクエスト/レスポンスで、「投げて切断、後で結果取得」の API は無い
  (OpenAI Batch API のようなサーバー側非同期は Ollama に無い)。パターン7が最小実装:
  **エージェントのセッション = messages 配列**なので、それを JSON に直列化すれば
  親エージェントはプロセスごと停止でき、サブエージェント完了後に別プロセスで
  セッション復元 + レポート注入 → 続きから復活できる。エージェントフレームワークの
  session store / resume 機能の正体はこれ。

## 学び(ハマりどころ)

1. **thinking モデルは CPU ローカルでは実用外**: `qwen3:4b`(thinking-2507)は
   3語の挨拶に 60〜130 秒・数百トークンの思考を消費。`/no_think` ソフトスイッチも
   OpenAI 互換 API の `think:false` も無効(モデル自体が thinking 固定)。
   → 非 thinking の `qwen3:4b-instruct` に変更して 1 呼び出し 4〜15 秒に。
2. **structured outputs はフラグが必要**: `createOpenAICompatible` に
   `supportsStructuredOutputs: true` を渡さないと JSON Schema が送信されず、
   モデルが勝手なキー(`{"answer": ...}`)で返して schema validation で落ちる。
3. **4B モデルに数値スケールは無理**: evaluator に 0-10 スコアを出させると
   「brief を完全に満たす」と書きながら score=1 を返す。categorical
   (`pass`/`fail` の enum)に変えたら安定した。閾値判定はコード側で持つ。
4. **structured output にはリトライ必須**: 小型モデルは時々 schema 違反 JSON を
   出す。リトライなしだと 1 回の不正出力でワークフロー全体が死ぬ(askObject で3回まで再試行)。
5. **AI SDK v7 は `messages` 配列に system ロールを入れると例外**
   (`System messages are not allowed in the prompt or messages fields`)。
   セッションを直列化するときは system プロンプトを messages と別フィールドで持つこと。
   ちなみにこのバグを踏んだのが「サブエージェント完了直後・親復活前」だったが、
   レポートは保存済みだったので修正後の再実行は調査をやり直さず復活だけで済んだ
   (= 「LLM 呼び出しの直後に必ず永続化」の価値の実証)。
