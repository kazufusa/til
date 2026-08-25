# AgentCore + Strands + OTEL 実行記録収集

仕様は[SPEC.md](SPEC.md)を、要求は[TASK.md](TASK.md)を参照してください。

## アーキテクチャ

### 処理の構成

AWS Bedrock AgentCore Runtime上で、Strandsの3ノードのGraphを実行します。

```
ローカル (scripts/invoke.py)
  │ InvokeAgentRuntime (topic, prompt_payload, gate_min_length)
  ▼
AgentCore Runtime (ap-northeast-1, direct_code_deploy)
  └─ Strands Graph
       writer (Agent) → reviewer (Agent) → gate (Python検証)
```

writerが題材について文章を書き、reviewerが推敲します。
gateはLLMを使わないPython処理で、reviewer出力の文字数をしきい値と比較します。
しきい値はリクエストパラメータなので、呼び出し側が合否を制御できます。
gateは評価対象の全文としきい値、判定結果をスパン属性として記録します。

プロンプトには行番号マーカー付きのダミー資料（prompt_payload）を埋め込みます。
記録側に先頭行と末尾のPAYLOAD-ENDが残っているかを見ると、切り落としの有無と位置を特定できます。

### OTELの構成

計装はStrandsの組み込みテレメトリ（strands-agents[otel]）が行います。
Graphの実行が`invoke_graph`、各Agentの実行が`invoke_agent writer`などのスパンになり、モデル呼び出しの`chat`スパンにはトークン数（`gen_ai.usage.*`）とモデルIDが属性として付きます。
gateだけは自前でスパンを1本作り、評価対象の全文としきい値、判定結果を属性に載せます。

プロンプトと応答の本文は、OTELの2つの信号にまたがって存在します。

- トレース信号: スパンに付くイベントとして。プロセス内のスパンを見ると、`chat`スパンのイベントに本文の全文が入っている
- ログ信号: gen_aiイベントのログレコードとして。resourceとscope、timeUnixNano、bodyを持つOTLP LogRecordの形で流れる

送信部はADOT（AWS Distro for OpenTelemetry）です。
OTELのSDKと自動計装に、AWS宛ての送信設定を束ねたAWS公式の配布物で、AgentCore Runtimeがアプリ起動時に組み込みます。
ADOTはトレース信号を`aws/spans`ロググループへ、ログ信号をRuntimeロググループの`otel-rt-logs`ストリームへ送り分けます。
CloudWatch側のスパンは1本2KB前後のメタデータで、本文はログ信号の側だけが持ちます。
GenAI Observabilityコンソールの表示は、この2つのデータで描かれます。

なおスパンの親子は「呼び出し元と呼び出し先」を表すため、Graphの3ノードはすべて`invoke_graph`の直下に兄弟として並びます。
`writer → reviewer → gate`のエッジはツリーの形には現れず、タイムライン上の実行順として現れます。

課題: トレースからGraphのエッジを復元できません。
`invoke_graph`にもノードスパンにも、エッジ定義を表す属性はありません。
直列なら時間の隣接から実行順を推定できますが、並行分岐やfan-inでは兄弟スパンの時間が重なるため、構造の復元は不可能です。
しかもStrandsの実装（`_is_node_ready_with_conditions`）は、入エッジのどれか1本の条件が成立した時点でノードをreadyにして、どのエッジで発火したかを記録しません。
複数入エッジのケースでは、事後推定が原理的に成り立ちません。

Strandsの実行系自体は、エッジ定義（`Graph.edges`）も実行順（`GraphState.execution_order`）もエッジ通過イベント（`MultiAgentHandoffEvent`）も持っています。
スパンへ渡していないだけです。

動的fan-out（実行中に見つけた仕事の数だけWorkerを生やす形）まで含めると、復元対象は「事前のGraph定義」ではなく「実行時に展開されたexecution graph」になります。
その場合も、次の設計でOTELだけから復元できます。

解決方法案: スパンとスパンリンク、構造化ログの3点でexecution graphを記録します。

- 論理ノードと実行インスタンスを分ける。ノードスパンに`workflow.run.id`、`node.logical_id`（worker）、`node.instance_id`（worker-001）、実行回数カウンタを付ける
- fan-inを親子で表現しない。スパンの親は1つしか持てないため、Aggregatorを特定Workerの子にすると嘘のツリーになる。複数の先行スパンとの因果はスパンリンク（OTELがscatter/gather向けに推奨する複数参照）で張る
- トポロジの変化（グラフ定義、エッジ通過、`fanout.created`とその対象リスト)は、スパンに相関付けた構造化ログとして記録する。Span Events APIは廃止方向で、新規設計はLogs APIイベントが推奨のため（既存のspan eventsデータは有効のまま）
- 捕捉の継ぎ目には、Strandsの`MultiAgentHandoffEvent`（`from_node_ids`と`to_node_ids`を持つ）が使える

この3点が揃うと、事前に完全なGraph定義を吐かなくても、実行しながら成長するDAGを後から復元できます。
同じデータを逐次読めば、実行中のグラフが伸びていく進捗UIにもなります。
既存規約ではOpenInferenceの`graph.node.id`/`graph.node.parent_id`（fan-inは窮屈）と、策定中の`gen_ai.workflow.*`があり、将来はそちらへ寄せます。

### S3への保持の2パターン

FAIL時の証跡をS3へ保持する方法は2パターン実装しました。
以降の節では前者を「自作経路」、後者を「復元経路」と呼びます。
また、ADOTによるCloudWatchへの配送そのものは「標準経路」と呼びます。

```
Strands Graph
  ├─(標準経路) ADOT ─┬─ スパン ──▶ aws/spans ─▶ パターン2: Lambda ─▶ S3 (cw-dumps)
  │                  └─ 本文ログ ─▶ otel-rt-logs ─────┘
  └─ パターン1: InMemoryJsonlExporter ──FAIL時──▶ S3 (ng-dumps)
```

パターン1は、プロセス内で捕まえて直接書く方式です。
自作のSpanExporterをTracerProviderへ追加すると、終了した全スパンが（本文イベント込みで）手元に来ます。
これをメモリへ蓄積し、Graph完走後にgateがFAILなら、1行1スパンのjsonl（`ensure_ascii=False`）へ変換して`ng-dumps`バケットへ書きます。
PASSなら何も書きません。
配送を経ない生のスパンなので、切り落とし検証の正解データになります。

パターン2は、CloudWatchに届いたデータから事後に復元する方式です。
gate FAILのスパンが`aws/spans`へ届くと、サブスクリプションフィルタ（`"verification_gate" "FAIL"`）がLambdaを起動します。
Lambdaは75秒待ってから2つのロググループをtraceIdで検索し、由来ロググループのタグを付けた1行1レコードのjsonlを`cw-dumps`バケットへ書きます。
待ち時間が要るのは、トレースの全レコードが揃ったことを示す信号がなく、到着をヒューリスティックに待つしかないためです。

2パターンの使い分けは「結論」の節にまとめます。
要点だけ言えば、パターン2は標準経路に届いたものしか復元できず、パターン1は配送の欠損と無関係に完全ですが、メモリ蓄積のためinvocationをまたぐ構成では使えません。

## 検証の経過

### 仕様策定とローカル実験（2026-08-25）

SPEC.mdを策定し、terraform（S3とIAMロール）を`terraform validate`まで作成しました。
デプロイはcontainer方式をやめてdirect_code_deploy方式にしました。
ECRとdockerビルドが不要になります。

ローカル実験ではpassとfailの両ケースを確認しました。

- fail時のNGダンプは8スパンで、graphと両Agent、モデル呼び出し、gateを含む
- payloadの先頭と末尾のマーカーが無傷で残る
- 日本語がエスケープなしのUTF-8で出力される
- gateの評価対象としきい値、判定結果がスパン属性に残る

### クラウド検証と欠損の発見（2026-08-25）

デプロイ後、4件の検証を実行しました。

| # | gate | payload | 結果 |
|---|---|---|---|
| 1 | pass | 3行 | S3ダンプなし。Graph完走 |
| 2 | fail | 3行(182字) | S3ダンプあり。10スパン、全マーカー無傷 |
| 3 | fail | 800行(4.6万字) | S3ダンプあり。全記録箇所でPAYLOAD-END残存 |
| 4 | fail | 3200行(18.2万字) | S3ダンプあり。全記録箇所でPAYLOAD-END残存 |

自作経路は、18.2万字のプロンプトでも切り落としゼロでした。
writer入力とreviewer入力、graphタスクの全記録箇所で、末尾マーカーまで残りました。

一方、標準経路には2種類の欠損が見つかりました。

- スパン: Transaction SearchがPENDINGの間、OTLPエンドポイントが400で拒否し、全スパンが失われた。`aws/spans`は0件のまま
- 本文ログ: 検証3までは完全。検証4ではinput系レコード7件が丸ごと消えた。エクスポータのエラーログに原因が明記されていた: `Upload too large: 1264297 bytes exceeds limit of 1048576`

つまり欠損は「文字列が途中で切れる」形ではなく、「1MiBを超えたバッチが丸ごと拒否されてレコードごと消える」形で起こります。
拒否するのはCloudWatch LogsのOTLP受信側（1リクエスト1MiB制限）で、拒否されたバッチを分割再送せず捨てるのはADOTエクスポータです。
どちらの欠損も呼び出し側にエラーが返らず、microVM内のエクスポータのログにしか痕跡が残りません。
無音で欠けます。

Transaction SearchがACTIVEになった後の再実行では、スパン12本がすべて`aws/spans`へ届きました。
ACTIVE前に送った分は届かないままで、恒久的に失われました。
1MiBバッチ拒否は再実行でも同じ場所で再現し、決定論的な挙動と分かりました。

### 標準経路の修正（2026-08-25）

要件を「OTELは全量記録し、失敗ケースはS3にjsonlとしても保持する」と定め、欠損を2点とも塞ぎました。

- Transaction SearchをACTIVEにする（スパン対策。アカウントで1回だけの操作）
- `OTEL_BLRP_MAX_EXPORT_BATCH_SIZE=1`でログレコードを1件ずつ送る（バッチ拒否対策）

再デプロイ後、18.2万字のfail実行で、payload入りレコード9件がすべてPAYLOAD-ENDまで無傷で届きました。
エクスポータのエラーも出なくなりました。
残る制限は、1レコード単体で1MiBを超えるプロンプト（日本語で約30万字以上）は標準経路では失われることです。
その場合も自作経路のダンプには残ります。

### イベント駆動復元の実証（2026-08-26）

復元経路をterraformで追加し、fail実行1回で通しの動作を確認しました。

- gate FAILスパンの着弾（invokeから約2分）→ フィルタ発火 → Lambda（75秒待機）→ traceId検索 → 専用バケットへ保存。トータル約3分
- 同一実行の自作経路ダンプ（10スパン）と突き合わせると、復元側は38レコード（スパン13と本文ログ25）で欠けなし。payload 800行も完全
- 復元側にしかない情報もあった。`AgentCore.Runtime.Invoke`や`POST /invocations`、自作ダンプ書き込み自身の`S3.PutObject`など、プロセス内から見えない基盤側スパンを含む

この完全復元は、標準経路の修正が済んでいるから成立します。
CloudWatchに届いていない記録は、復元経路でも復元できません。

## 結論

### 経路別の記録結果

| 記録 | 自作経路 | 標準経路 |
|---|---|---|
| スパン構造 | 完全 | 完全（Transaction Search有効後のみ） |
| 本文（〜4.6万字） | 完全 | 完全 |
| 本文（18.2万字） | 完全 | 修正前はinput系レコードが欠落、修正後は完全 |
| gate判定の記録 | 完全 | 完全 |

### 推奨構成

最終形は「OTEL → CloudWatch → 失敗フラグ付きトレースをS3へ保持 → 後日検証」です。

```
OTEL計装(Strands、1本だけ)
  → CloudWatch(スパン=aws/spans、本文=otel-rt-logs)
      ├─ 平常時: GenAI Observability UIで人間が調査
      └─ gate FAILスパン検知 → Lambda → traceId単位のjsonl → S3(後日検証用)
```

記録の形は、人間が読む場合もプログラムが読む場合もOTELで統一します。
OTELは業界標準で、UI(CloudWatchやLangfuse)も後段のプログラムも同じデータを読めます。
自前スキーマの並行記録は作りません。
足りない情報(gateの判定、Graphのエッジ)は、スパンのカスタム属性としてOTELの内側に足します。
gateの`gate.*`属性がS3のjsonlとUIの両方へそのまま届いたことが、この方式の実証です。

成立条件は次の3つで、いずれも本検証で実証済みです。

- Transaction SearchがACTIVEであること
- `OTEL_BLRP_MAX_EXPORT_BATCH_SIZE=1`を設定すること
- 1レコードが1MiB以内であること（日本語プロンプトで約30万字まで）

この構成には3つの利点があります。

- NG時のS3保全は復元経路で足りるため、アプリからエクスポータとS3書き込みを消せる。実行の本流が観測と無関係になる
- CloudWatchへ逐次永続化されるため、非同期HITLやmicroVM再起動をまたぐ構成でも記録が残る。メモリバッファ方式の弱点が消える
- GenAI Observabilityコンソールで一次調査ができる。トレース一覧のInput/Output列や、ウォーターフォール、gate属性を画面で確認できる

自作経路は、30万字超の単一レコードと、観測配送そのものの無音異常に備える保険として位置づけます。

### コスト

本検証（クラウド実行8回、うち18万字級3回)の実費はおよそ0.3 USDでした。

- Bedrockトークン: 約0.28 USD（ダッシュボード実測0.273 USD）。全体の9割超
- CloudWatch Logs取り込み: 数セント。18万字級1実行で本文ログ約3.4MB、約0.76 USD/GBなので1実行約0.003 USD
- AgentCore RuntimeとLambda、S3: 合計1セント未満

規模が大きくなると、CloudWatch Logsの取り込み料が支配項になります。
標準経路は成否を問わず全実行の本文を取り込むためです。

- 18万字級で月10万実行なら、観測だけで約260 USD
- 自作経路だけならNG時のみの保存で、gzip（後述、37分の1）も効くため、同条件でも月1 USD未満
- gzipはCloudWatch取り込みには効かない（非圧縮換算で課金）。削減手段は、本文をスパンに載せずS3へ寄せる、保持期間の短縮、サンプリングの3つ

トレースの課金が独立項目として見えないのは、Transaction Search方式ではスパンが`aws/spans`へのログレコードだからです。
課金はLogs取り込み料に合流し、スパン本体は1実行約30KBなので本文ログの1%未満に沈みます。
検索用インデックスは既定の1%まで無料で、引き上げると追加課金になります。

### スパンJSONとコスト属性

スパンには`gen_ai.usage.input_tokens`や`output_tokens`、`cache_read_input_tokens`、`gen_ai.request.model`まで記録されますが、金額のフィールドはありません。

- OTELのGenAI意味規約に、コスト属性の定義がない
- スパンは実測の事実だけを持ち、導出値を持たない。単価は価格改定やリージョン、キャッシュ割引で変わるため、金額を焼き込むと価格改定後に過去のトレースが不正確になる
- ダッシュボードの合計コストは、表示時にモデルIDとトークン数から価格表を引いて計算した値である

自前のjsonl分析で金額を出す場合も、`gen_ai.usage.*`に単価表を掛けて後計算します。
キャッシュトークンも分離記録されているため、計算に必要な材料はJSONに揃っています。

### jsonlの圧縮

ダンプはgzip圧縮とよく合います。
18.2万字実行のダンプ（2.96MB）を実測すると、gzipで80KB（37分の1）になります。
自作経路も復元経路も、書き込み直前に`gzip.compress()`を挟むだけで`.jsonl.gz`にできます（今回は未適用）。
機械処理前提ならzipよりgzipが向きます。
Athena、S3 Select、pandasが直接読めるためです。

## つまずきメモ

- Anthropicモデルが`ResourceNotFoundException`になった。アカウントのユースケースフォームが未提出のため。提出から約2分で利用可能になった。提出前の動作確認は`MODEL_ID`環境変数でNova Liteに差し替えて行った
- StrandsのBedrockModelは既定でConverseStreamを使う。フォームエラーの切り分けのため`streaming=False`で非ストリーミングに固定した
- miseのaquaレジストリ経由のterraform導入が400エラーになった。公式バイナリを`~/.local/bin`へ直接配置した（v1.15.9）
- starter toolkitは非推奨警告を出す（後継はnpmの`@aws/agentcore`）。今回は検証済みのtoolkitで続行した
- Transaction Searchはtoolkitのlaunchが有効化するが、ACTIVEまで数分かかる。PENDINGの間に送られたスパンは400で拒否され、失われる
- AgentCoreコンソールの「ログ配信」設定は未設定のままでよい。既定でRuntimeロググループへログとスパンが届く

## 実行方法

### ローカル実験

```sh
uv run --project app scripts/local_run.py --gate pass --payload-lines 3
uv run --project app scripts/local_run.py --gate fail --payload-lines 3
```

全スパンが`out/traces/`へ、NG時のダンプが`out/ng-dumps/`へ書かれます。

### クラウド

1. `cd terraform && terraform init && terraform plan && terraform apply`（人間が実行）
2. app/で`agentcore configure`を実行する（direct_code_deploy方式。SPEC.mdデプロイ手順を参照）
3. `agentcore launch --env OTEL_DUMP_BUCKET=<バケット名> --env OTEL_BLRP_MAX_EXPORT_BATCH_SIZE=1`
4. `uv run --project app scripts/invoke.py --gate fail --payload-lines 800`

ダンプの回収は`aws s3 sync`で行います（`./tmp/`以下に取得済み）。

## 削除の記録（2026-08-26）

次の順で全リソースを削除し、残存ゼロを確認しました。

1. `agentcore destroy --force`: Runtimeとコードzipを削除。terraform管理の実行ロールもtoolkitが先に削除した（configureで渡したロールも削除対象になる挙動）
2. `terraform destroy`: 残る11リソース（バケット3つ、Lambda、ロール、サブスクリプションフィルタなど）を削除。先に消えたロールは「既に無い」として整合した
3. 手動削除: ロググループ3つ（Runtime用、Lambda用、`aws/spans`）を削除し、X-Rayのスパン送信先を既定のXRayへ戻した

確認: Runtime、バケット、ロール、ロググループ、Lambdaのいずれも、実験のprefixでの検索結果が空であることを確認済みです。
ローカルの`./tmp/`に全jsonlの写しが残っています。
