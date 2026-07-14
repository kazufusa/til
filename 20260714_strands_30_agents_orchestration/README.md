# Strands Swarm で 30 functional role の組織をオーケストレーション

実ビジネス組織をモデルにした 30 の職能(functional role, job function)エージェントを、
Strands Agents SDK の Swarm パターンでオーケストレーションする。
部長・課長のような階層ロールではなく、職能ベース。
組織はリクエストを受けると、関係する職能が自律的に handoff しながら稼働し、アウトプットを返す。

モデルはローカル LLM(ollama)。選定の経緯は `local_llm.md` を参照。

## 構成

- `main.py` — 組織定義と実行 CLI
- `local_llm.md` — ローカルモデル選定の引継ぎメモ(前提)
- `pyproject.toml` — 依存は `strands-agents[ollama]` のみ。uv の `exclude-newer` で公開 7 日未満のパッケージを除外

### 30 の職能

| 系統 | 職能 |
| --- | --- |
| 受付 | intake_coordinator |
| 商流 | sales, account_management, customer_success, customer_support |
| マーケティング | marketing_strategy, content_marketing, seo_specialist, pr_communications, brand_designer |
| プロダクト・開発 | product_management, ux_research, ui_design, backend_engineering, frontend_engineering, mobile_engineering, qa_engineering, devops_sre, security_engineering, technical_writing |
| データ | data_analytics, data_engineering, machine_learning |
| コーポレート | finance_accounting, financial_planning, legal_counsel, compliance_officer, hr_recruiting, procurement, it_support |

### Swarm パターンの仕組み(Strands)

- 中央のオーケストレータは存在せず、各エージェントが対等。Strands が各エージェントに
  `handoff_to_agent` ツールと他 29 職能の一覧(name + description)を注入する
- エージェントは自職能の成果物を出し、他職能の作業が必要なら handoff、
  不要なら handoff せずに回答して全体が完了する
- 共有コンテキスト(それまでの各職能の作業内容)は handoff 時に引き継がれる
- 入口は intake_coordinator に固定(`entry_point`)。トリアージ判断が要なので
  ここだけオーケストレータ級モデルを割り当てる

### モデル割当

| 役割 | 既定 | 環境変数 |
| --- | --- | --- |
| intake_coordinator | qwen3:4b-instruct | ORCH_MODEL |
| 他 29 職能 | qwen3:4b-instruct | SUB_MODEL |

qwen3 の thinking ハイブリッド系(タグに instruct が付かないもの)には
system prompt に `/no_think` を自動で付ける。

local_llm.md の本命だった qwen3:8b を intake に試した結果、この環境
(CPU実行, Ryzen 7 4750U)では 1 ターンが node_timeout (900s) に収まらず失敗した。
handoff ツール呼び出し自体は即座に出たが、strands はツール結果後の後続生成まで
エージェントのターンとして完走させるため、8B の生成速度では時間切れになる。
8B をオーケストレータに使うのは GPU か RAM 増設後
(local_llm.md の Qwen3-30B-A3B 案)の課題。この環境の実用ラインは全役 4B。

## 実行

```sh
ollama pull qwen3:8b
ollama pull qwen3:4b-instruct
uv sync
uv run python main.py "自社SaaSの解約率がこの四半期で3%から5%に上がった。原因の調べ方と改善アクションをまとめてほしい"
```

全部 4B で軽く回す場合:

```sh
ORCH_MODEL=qwen3:4b-instruct uv run python main.py "..."
```

実行ログとして「どの職能が発話中か」「handoff ツール呼び出し」を逐次表示し、
最後に handoff trail・トークン量・最終アウトプットを出す。

## 実行レポート(後からオーケストレーションを追う)

実行ごとに `runs/<日時>/` へレポートを残す。

- `report.md` — 依頼内容、handoff の流れの mermaid 図(誰が誰に何を頼んだか)、
  各職能の発話タイムライン(経過秒・成果物・handoff 理由・引き継ぎ context)
- `events.jsonl` — 生イベント(時刻、職能、発話テキスト、handoff 引数)。機械可読

記録は各エージェントの callback で assistant メッセージを拾う方式。
handoff は `handoff_to_agent` ツール呼び出しの引数
(`agent_name` / `message` / `context`)をそのまま保存するので、
「なぜその職能に渡ったのか」がモデルの言葉で残る。

## 実行結果

リクエスト「新機能『利用状況レポートの自動配信』をリリースしたい。仕様の要点、実装方針、告知文のドラフトまで用意して」での実績。

| ラン | 結果 | 経路 | 時間 / トークン |
| --- | --- | --- | --- |
| [runs/20260715_000303](runs/20260715_000303/report.md) | COMPLETED | intake_coordinator → product_management → devops_sre → product_management → ux_research | 1022s / 31,608 tok |
| [runs/20260714_233502](runs/20260714_233502/report.md) | FAILED(失敗例として保存) | ux_research が自己 handoff を 4 回繰り返し max_iterations 到達 | 1511s / 65,568 tok |

失敗例に自己 handoff 遮断 hook(`BlockSelfHandoff`)を入れたのが成功ラン。
経路・handoff 理由・各職能の成果物は各 report.md を参照。

## 設計メモ(local_llm.md の原則の適用)

- temperature 0。ツール駆動の小型モデルは劣化に弱い
- handoff 先の解決・ループ検知・タイムアウトはハーネス側(Strands Swarm)が決定的に処理し、
  LLM は「どの職能が必要か」の意図解釈だけを行う
- `num_ctx=16384` を明示。Swarm が注入する 30 職能一覧 + handoff ツール定義 + 共有コンテキストで
  ollama 既定の 4096 では溢れる
- `repetitive_handoff_detection_window` で職能間の往復ループを検知して打ち切る
- CPU 実行(Ryzen 7 4750U, RAM 15GB)前提のため `max_handoffs=8`、`keep_alive=30m` で
  モデルを常駐させて handoff ごとのリロードを避ける

## 実測からの学び

- 4B 級は直前の handoff 文面を模倣し、自分宛てに handoff することがある。
  Swarm は自己 handoff を有効な遷移として受理するため無限に同じ職能が再実行される
  (runs/20260714_233502 が失敗例。ux_research が 4 回自己 handoff して max_iterations 到達)。
  対策として `BeforeToolCallEvent` hook で自己 handoff を `cancel_tool` で遮断した
  (`BlockSelfHandoff`)。プロンプトではなくハーネス側で決定的に防ぐ
- 8B を intake に使う案は CPU では時間切れ (モデル割当の節を参照)
- 職能エージェントは放っておくと長大な成果物を書き続けて 1 ターン数分かかる。
  system prompt の「簡潔に」1 語と max_handoffs の絞りが実用上効く
