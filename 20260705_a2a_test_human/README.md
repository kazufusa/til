# A2A サーバーと人間が会話する CLI

ローカルLLMを背後に持つ A2A (Agent2Agent Protocol) サーバーを立て、人間が CLI からそのエージェントと会話する実験。

## 構成

```
人間 --(CLI / readline)--> A2AClient --(JSON-RPC over HTTP)--> A2Aサーバー --(OpenAI互換API)--> llamafile (Qwen3-4B)
```

CLI は2種類ある。

- `bun run cli` 人間が直接 A2Aエージェントと会話する (1ホップ)
- `bun run agent` 人間が LLM に自然言語で依頼し、LLM がツール経由で A2Aエージェントと会話する (2ホップ)

| 役割 | 実装 |
|---|---|
| ランタイム | Bun + TypeScript |
| A2A サーバー/クライアント | @a2a-js/sdk 0.3.13 (公式 JS SDK。server は express バインディング) |
| LLM 呼び出し | Vercel AI SDK (ai 7.0.4 + @ai-sdk/openai-compatible) |
| ローカルLLM | llamafile 0.10.3 (ollama 以外という縛り) |
| モデル | Qwen3-4B-Instruct-2507 Q4_K_M (下記「ハマりどころ」参照) |

## セットアップ

```sh
bun install

# llamafile と ape ローダー (WSL2 では ape 経由の起動が必要、後述)
curl -L -o ~/.local/bin/llamafile https://github.com/Mozilla-Ocho/llamafile/releases/download/0.10.3/llamafile-0.10.3-thin
curl -L -o ~/.local/bin/ape https://cosmo.zip/pub/cosmos/bin/ape-x86_64.elf
chmod +x ~/.local/bin/llamafile ~/.local/bin/ape

# モデル (約2.4GB)
mkdir -p ~/.cache/llama-models
curl -L -o ~/.cache/llama-models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf \
  "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf?download=true"
```

## 実行

ターミナルを3つ使う。

```sh
bun run llm      # 1. llamafile (OpenAI互換API, :8080)
bun run server   # 2. A2Aサーバー (:41241)
bun run cli      # 3a. 会話CLI (人間が直接A2Aエージェントと話す)
bun run agent    # 3b. オーケストレータCLI (人間→LLM→A2Aエージェント)
```

## 停止 (shutdown)

CLI (`cli` / `agent`) は `/exit` か Ctrl-C で抜ける。バックグラウンドで起動した llamafile と A2Aサーバーは別途止める。

```sh
# フォアグラウンドで起動した場合は各ターミナルで Ctrl-C

# バックグラウンドで起動した場合はプロセスを止める
pkill -f "src/server.ts"     # A2Aサーバー
pkill -f llamafile           # llamafile (ape 経由でも -f で一致する)
```

停止後に残るもの: 会話台帳 `.a2a-sessions.json` はファイルなので残る。ただしサーバー側の会話履歴は InMemoryTaskStore でプロセス内メモリのため、llamafile/A2Aサーバーを止めた時点で消える。再起動後は台帳から会話を選べても中身は空 (新規会話と同じ) になる。台帳を白紙に戻したいときは `rm .a2a-sessions.json`。

CLI の使い方:

- そのまま入力するとエージェントに送信される
- `/new` 会話リセット (contextId を捨てて新しい会話を始める)
- `/debug` HTTPデバッグ出力の on/off
- `/exit` 終了
- `bun run cli --quiet` でデバッグ出力を最初から off にできる
- `bun run cli --new` で履歴選択をスキップして新しい会話を始める

## 会話継続の仕組み

A2A では会話の単位が contextId。初回送信のレスポンス (Message) に含まれる contextId を CLI が保持し、以降の message/send に付与する。サーバー側は AgentExecutor 内で contextId ごとに会話履歴 (Map) を持ち、毎回全履歴を LLM に渡す。

CLI を終了しても会話は継続できる。会話ごとの contextId を最初の発言をタイトルにして .a2a-sessions.json に保存しておき (直近20件)、次回起動時に一覧から選んで再開する。サーバー側の履歴が contextId をキーに残っているため、同じ contextId で送れば続きから話せる。

```
you> 好きな食べ物は何?
agent> カレー
(CLI を /exit で終了)

$ bun run cli
会話履歴:
  1) 好きな食べ物は何? (2026-07-05 23:15)
  0) 新しい会話
再開する会話を選択 (Enter=1): 1
you> 何カレーが好きなの?
agent> 豚!
```

制約: サーバー側の履歴は InMemoryTaskStore と同様にプロセス内メモリなので、A2A サーバー自体を再起動すると contextId が残っていても履歴は消える (選んでも新規会話と同じ状態になる)。

## オーケストレータCLI (bun run agent)

人間 → LLM → A2Aサーバー の2ホップ構成。人間はLLMに自然言語で依頼し、LLMがツール経由でリモートA2Aエージェントと会話する。リモート側の contextId (どの会話か) を人間の指示で切替・リセット・復帰できる。

```
you> エージェントに「私はカズ。好きな食べ物はカレー。覚えて」と送って
  [tool] ask_remote_agent: ...
you> 新しい会話にして
  [tool] new_conversation: リセットしました
you> 会話一覧を見せて
  [tool] list_conversations: 2件
you> 2番の会話に戻して
  [tool] switch_conversation: 「私はカズ。...」
you> エージェントに私の好きな食べ物を聞いて
  [tool] ask_remote_agent: ... → カレー
```

設計は「意図の解釈だけLLM、contextId の解決は台帳で決定的に」:

- LLM に渡すツールは ask_remote_agent / list_conversations / switch_conversation / new_conversation の4つ
- LLM は contextId (UUID) を直接扱わない。一覧の番号で指定させ、番号→contextId の解決はコード側で行う (小型LLMにUUIDを復唱させると事故るため)
- 台帳は cli.ts と同じ .a2a-sessions.json を共有。どちらのCLIで作った会話にも戻れる

### これは「エージェントがエージェントを呼ぶ」ではない

構成は agent-to-agent に見えるが、実態は人間が操縦する自然言語スイッチボードで、自律性はほぼない。

- A2A接続・contextId解決・台帳は全部ハーネスコード (TypeScript) が握っている
- LLM がやるのは人間の発話を4つのツールに振り分ける意図解釈だけ
- いつ・誰に・どの会話で話すかの意思決定は全部人間 (「2番に戻して」)

本来の agent-to-agent は、エージェント自身がタスクを持ち、その遂行の途中で「いつ聞くか (自分で答えられるか)」「誰に聞くか (AgentCard のスキル記述から相手を選ぶ)」「どの会話でか (タスクと台帳の対応から機械的に導く)」を自律的に判断する。ここではその3つを全部人間がやっている。

なお「接続そのものはハーネスがやる」点は本物のエージェントでも同じ (ADK の RemoteA2aAgent も LangGraph も、LLM が決めるのは呼ぶ判断まで、HTTPを張るのはランタイム)。欠けているのは配管ではなく自律性の方。自律版にするなら、スキルの違う A2Aサーバーを複数立て、目標だけ渡して発見→選択→委譲をLLMにやらせる形になる。

## HTTP デバッグ出力

`@a2a-js/sdk/client` の `JsonRpcTransportFactory` と `DefaultAgentCardResolver` は `fetchImpl` を注入できるので、リクエスト/レスポンスのメソッド・URL・ヘッダ・ボディ・所要時間を stderr に出す fetch ラッパー (src/debug-fetch.ts) を差し込んでいる。SSE の場合はストリームを tee して逐次表示する。

出力例:

```
--- HTTP #2 request -------------------------
POST http://localhost:41241/
accept: application/json
content-type: application/json
  {
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": { "message": { ... } }
  }
--- HTTP #2 response (2100ms) --------------
200 OK
...
```

## ハマりどころ

- llama.cpp のプリビルド (ubuntu-x64) は glibc 2.32+ と libssl.so.3 を要求するため Ubuntu 20.04 (glibc 2.31) では動かない。llamafile は cosmopolitan libc 製なので glibc 非依存で動く
- ただし WSL2 では APE バイナリが Windows exe の binfmt_misc interop と衝突して起動できない。システム設定 (WSLInterop) を変えずに済む回避策として、ape ローダー (ape-x86_64.elf) 経由で起動する
- AI SDK v7 では system ロールを messages に入れるとエラーになる。`generateText({ instructions })` を使う
- CLI で `readline.question()` を使うと、応答待ち中に stdin が EOF になった場合 (パイプ入力) に ERR_USE_AFTER_CLOSE で落ちる。`for await (const line of rl)` なら安全
- Qwen3 (無印) は thinking モデルなので、システムプロンプトに `/no_think` を入れて思考ブロックを抑制 (念のため `<think>` タグの除去も実装)。Qwen3-4B-Instruct-2507 は非thinkingなので不要
- 小型LLMのツール呼び出しは揺れる。Qwen3-1.7B はツール4つのオーケストレーションで tool_calls が生JSONテキスト化する事故が頻発。4B に上げても「ツールを呼ばずに送ったふりをして返答を捏造する」ことがあり、temperature 0 と「送信は必ずツールで行う」の明示で安定した。ツール実行ログ ([tool] 行) を人間に見せるのは、この捏造を目視検出するためにも重要
- パッケージは 7 日クールダウン運用のため @a2a-js/sdk 0.3.13 / ai 7.0.4 / @ai-sdk/openai-compatible 3.0.1 に固定 (1.0.0-beta.0 はリリース 4 日で対象外)

## ファイル

- src/config.ts 接続先などの設定 (環境変数で上書き可)
- src/card.ts AgentCard 定義
- src/executor.ts AgentExecutor 実装。LLM 呼び出しと contextId ごとの履歴管理
- src/server.ts A2A サーバー起動 (DefaultRequestHandler + A2AExpressApp)
- src/debug-fetch.ts HTTP デバッグ用 fetch ラッパー
- src/session.ts 会話履歴 (contextId) の永続化と一覧
- src/cli.ts 会話 CLI (人間 → A2Aエージェント)
- src/agent-cli.ts オーケストレータ CLI (人間 → LLM → A2Aエージェント)
- scripts/llm-server.sh llamafile 起動スクリプト
