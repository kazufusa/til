# AgentCore + Strands + OTEL 実行記録収集の仕様

## 目的

AWS Bedrock AgentCore上でStrands Graphを動かし、次の2点を検証します。

- Agentの入出力と検証ゲートの判断内容を、OTELスパンとしてすべて記録できるか
- 巨大なプロンプトを渡したとき、OTEL記録でプロンプトが切り落とされるか

検証ゲートがNGを返した実行については、全OTELスパンをjsonlとしてS3へ保存します。

## 全体構成

```
ローカル (scripts/invoke.py)
  │  InvokeAgentRuntime (payload: topic, prompt_payload, gate_min_length)
  ▼
AgentCore Runtime (ap-northeast-1)
  └─ Strands Graph
       writer (Agent A) ──▶ reviewer (Agent B) ──▶ gate (Python検証ゲート)
                                                        │
                                                        └─ NG時: バッファ済み全スパンをjsonl化してS3へPUT
  │
  ├─ OTEL spans ──▶ CloudWatch (AgentCore標準の観測基盤)
  └─ OTEL spans ──▶ InMemoryJsonlExporter (自作) ──NG時──▶ S3
```

デプロイ前のローカル実験モードも用意します。Graph本体を共通モジュールにし、
ローカルではAgentCore Runtimeを介さず直接実行します。

```
ローカル実験 (uv run --project app scripts/local_run.py)
  └─ Strands Graph（クラウド版と同一のGraph関数）
       ├─ OTEL spans ──▶ ConsoleSpanExporter(out=ファイル) ──▶ out/traces/ へ全スパンをjsonl保存
       └─ NG時: jsonlをローカルの out/ng-dumps/ へ保存
```

モデル呼び出しはローカルのAWS認証情報（SSO）でBedrockへ直接行います。

## AWSリソースとterraformの管理範囲

terraformで次のリソースを管理します。planとapplyは人間が実行します。

- S3バケット(ダンプ用): NG時のjsonl保存先。`force_destroy = true`を設定します。
- S3バケット(コード用): direct_code_deployのzip置き場。`force_destroy = true`を設定します。
- IAMロール: AgentCore Runtime実行ロール。信頼ポリシーは`bedrock-agentcore.amazonaws.com`です。

IAMロールへ付与する権限は次のとおりです。

- `bedrock:InvokeModel`と`bedrock:InvokeModelWithResponseStream`
- コード用バケットからの読み取り（`s3:GetObject`ほか）
- CloudWatch LogsとX-Ray（ADOTによるスパン送信用）
- ダンプ用バケットへの`s3:PutObject`

AgentCore Runtime本体はterraformで管理しません。TASK.mdの要求により、
デプロイをagentcore CLI（Strands用スターターツールキット）で行うためです。
削除手順の節で、リソースを残さない手順を定めます。

terraformの設定値は次のとおりです。

- provider: aws（バージョンは実装時に7日以上経過したものへ固定）
- region: ap-northeast-1
- リソース名prefix: `agentcore-otel-til`

## Strands Graphの構成

### ノード構成

| ノード | 種別 | 役割 |
|---|---|---|
| writer | Strands Agent | topicについて短い文章を書く |
| reviewer | Strands Agent | writer出力を推敲して最終出力を作る |
| gate | Pythonクラス（MultiAgentBase実装） | reviewer出力を機械的に検証する |

エッジは`writer → reviewer → gate`です。gateが終端ノードとなり、
最終出力の合否を判定します。

### Agentの仕様

両Agentともモデルは`jp.anthropic.claude-haiku-4-5-20251001-v1:0`を使います。
利用にはアカウントのAnthropicユースケースフォーム提出が必要です。
提出前の動作確認は`MODEL_ID`環境変数で`apac.amazon.nova-lite-v1:0`へ
差し替えて行います。

writerのプロンプトは次の形とします。prompt_payloadを加工せずそのまま埋め込みます。

```
次の題材について3文で説明してください。

題材: {topic}

参考資料:
{prompt_payload}
```

reviewerはwriterの出力を受け取り、より簡潔に書き直します。

### 検証ゲートの仕様

gateはLLMを使わないPython処理です。判定は次式で行います。

```
合格 ⇔ len(reviewer出力の文字数) >= gate_min_length
```

gate_minlengthはリクエストのパラメータです。呼び出し側は次の値で成否を制御します。

- 成功させたいとき: `1`
- 失敗させたいとき: `1000000`

判定に使った値はすべてOTELスパン属性として記録します（OTEL記録の節を参照）。

## 実行時パラメータの仕様

InvokeAgentRuntimeのpayloadは次のJSONです。

```json
{
  "topic": "string。writerの題材。",
  "prompt_payload": "string。writerプロンプトへそのまま入る文字列。",
  "gate_min_length": "int。gateの合格しきい値（文字数）。"
}
```

prompt_payloadは呼び出しスクリプトが生成します。切り落とし判定のため、
次の形式で行番号マーカー入りの行を並べます。

```
PAYLOAD-LINE-000001 aaaaaaaaaa...（1行およそ64文字）
PAYLOAD-LINE-000002 aaaaaaaaaa...
...
PAYLOAD-LINE-NNNNNN aaaaaaaaaa... PAYLOAD-END
```

記録側に先頭行・末尾行・`PAYLOAD-END`マーカーが残っているかで、
切り落としの有無と位置を判定します。

## OTEL記録の仕様

### スパン構成

Strandsの組み込みテレメトリ（strands-agents[otel]）を有効にします。
これによりgraph、各Agentの実行、モデル呼び出しがスパンになります。
Agentのシステムプロンプト、ユーザーメッセージ、モデル出力は、
Strandsが生成するスパンの属性・イベントに含まれます。

gateは自前でスパンを1つ作り、次の属性を付けます。

| 属性 | 内容 |
|---|---|
| `gate.evaluated_text` | 評価対象（reviewer出力の全文） |
| `gate.evaluated_length` | 評価対象の文字数 |
| `gate.criteria` | 判断基準の説明文字列（例: `len(output) >= 1000000`） |
| `gate.min_length` | しきい値そのもの |
| `gate.result` | `PASS`または`FAIL` |

### エクスポート経路

クラウド実行時のエクスポート先は2系統です。標準経路が全実行の全量を記録し、
自作経路はNG時の証跡をS3へ追加保全します。

- AgentCore標準経路: ADOT経由でCloudWatchへ送ります。全量記録のため
  次の2点が必要です（検証で判明。READMEの結論を参照）。
  - Transaction SearchをACTIVEにしてからスパンを送ること。
    PENDING中のスパンは400で拒否され、失われます
  - `OTEL_BLRP_MAX_EXPORT_BATCH_SIZE=1`を設定すること。既定のバッチ送信は
    合計1MiBを超えるとCloudWatch OTLPエンドポイントが丸ごと拒否し、
    ADOTエクスポータは分割再送せず捨てます
- 自作経路: InMemoryJsonlExporter（自作SpanExporter）をTracerProviderへ追加します。

1レコード単体で1MiBを超えるプロンプトは、上の設定でも標準経路では
失われます。その場合も自作経路には残ります。

ローカル実験時は次の2系統とします。

- ConsoleSpanExporter: 終了した全スパンを、gateの結果に関係なく
  `out/traces/{unixtime}.jsonl`へ1行1スパンで書きます。
  `out`にファイルハンドルを、`formatter`に1行JSONを返す自前関数を渡します。
  エクスポータの自作はしません
- InMemoryJsonlExporter: クラウド版と同じ実装を使い、NG時の保存先だけ
  ローカルの`out/ng-dumps/`へ切り替えます

ConsoleSpanExporterのformatterは、InMemoryJsonlExporterと
同じシリアライザを呼び出します。2つの出力を同一形式に保つためです。

InMemoryJsonlExporterは終了した全スパンをメモリへ蓄積します。
各invocationの開始時にバッファを初期化します。AgentCore Runtimeは
セッションごとにmicroVMを分離するため、この方式で実行間の混入を防げます。

この方式には制約があります。Graphが1回のinvocation内で
gateまで完走することを前提とします。非同期HITLのように
invocationをまたいで停止・再開する構成では、microVMの停止で
バッファが消え、記録が欠けます。その場合はスパンをS3の
ステージング領域へ逐次永続化し、gate判定時に確定・削除する
方式へ変える必要があります。本検証はHITLを扱わないため、
メモリバッファ方式を採用します。

### S3への保存

エントリポイントはgraph実行後にgateの結果を確認します。FAILのとき、
バッファ内の全スパンをjsonl（1行1スパンのJSON）へ変換し、S3へPUTします。

- キー: `ng-dumps/{YYYY-MM-DD}/{session_id}_{unixtime}.jsonl`
- 各行の内容: スパン名、trace/span ID、親span ID、開始・終了時刻、属性、イベント、ステータス

PASSのときはS3へ何も書きません。

### 日本語の出力形式

jsonl化のJSONシリアライズには、必ず
`json.dumps(..., ensure_ascii=False)`を使います。日本語を
`\uXXXX`のエスケープではなくUTF-8文字列のまま出力するためです。
OTEL SDK付属の`ReadableSpan.to_json()`は非ASCIIをエスケープするため
使いません。自前のシリアライザでdict化して`ensure_ascii=False`で
書き出します。ファイルはUTF-8（BOMなし）で開きます。

### 切り落とし検証の設計

切り落としが起こりうる箇所は次の3つです。

- OTEL SDKの属性長制限（`OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT`）
- ADOT・CloudWatch側の制限
- Strands自身のメッセージ記録処理

自作経路ではSDK既定値（無制限）のまま記録し、S3のjsonlを正とします。
CloudWatch側の記録と突き合わせ、経路ごとの切り落とし有無を比較します。

## デプロイ手順

アプリはuvプロジェクトとして作ります。依存は
`bedrock-agentcore`、`strands-agents[otel]`、`boto3`、開発用に
`bedrock-agentcore-starter-toolkit`です。バージョンはすべて
公開から7日以上経過したものへ固定します。

デプロイはagentcore CLIのdirect_code_deploy方式で行います。
コードをzipに固めてS3へ置き、マネージドPythonランタイムで動かす方式です。
ECRもdockerビルドも使いません。

1. `terraform apply`（人間が実行）でロールとS3バケット2つを作る
2. app/ディレクトリで`agentcore configure`を実行する

   ```
   agentcore configure -e src/app.py -n agentcore_otel_til \
     -er <terraform出力のrole ARN> -s3 <terraform出力のcode_bucket> \
     -dt direct_code_deploy -dm --non-interactive -r ap-northeast-1
   ```

   `-dm`（メモリ無効）で、Runtime以外の付随リソースを作らせません。
   `-s3`で既存バケットを渡すと、バケットの自動作成も抑止できます。
3. `agentcore launch`でzipのビルドとデプロイを行う

   ```
   agentcore launch \
     --env OTEL_DUMP_BUCKET=<terraform出力のotel_dump_bucket> \
     --env OTEL_BLRP_MAX_EXPORT_BATCH_SIZE=1
   ```

## 実行手順

### ローカル実験

デプロイ前の動作確認は`scripts/local_run.py`で行います。

```
uv run --project app scripts/local_run.py --gate pass|fail --payload-lines N [--topic TEXT]
```

Graphをローカルプロセスで直接実行します。全スパンは
`out/traces/{unixtime}.jsonl`へ、NG時のダンプは`out/ng-dumps/`へ書きます。

### クラウド実行

デプロイ後は`scripts/invoke.py`から呼び出します。

```
uv run --project app scripts/invoke.py --gate pass|fail --payload-lines N [--topic TEXT]
```

- `--gate`: gate_min_lengthを1または1000000に設定します
- `--payload-lines`: マーカー行をN行生成します（1行約64文字）
- 呼び出しにはboto3の`bedrock-agentcore`クライアントを使います

引数の仕様は2つのスクリプトで共通です。

## 検証項目

デプロイ前に、ローカル実験でpass・fail各1回を実行します。
`out/traces/`のjsonlに全スパンが日本語のまま記録され、fail時に
`out/ng-dumps/`へもjsonlが書かれることを確認してから、クラウド検証へ進みます。

クラウドでの検証は次の4件です。

| # | gate | payload行数（概算サイズ） | 期待結果 |
|---|---|---|---|
| 1 | pass | 3行（約200B） | S3にjsonlなし。CloudWatchにトレースあり |
| 2 | fail | 3行（約200B） | S3にjsonlあり。gate属性と全メッセージを含む |
| 3 | fail | 800行（約50KB） | jsonlにPAYLOAD-ENDが残るか確認 |
| 4 | fail | 3200行（約200KB） | 同上。切り落とし発生位置を特定 |

検証2の合格条件は次のとおりです。

- jsonlにgraph・writer・reviewer・gateのスパンがすべて含まれる
- writerのシステムプロンプトとユーザーメッセージ全文が読める
- gateの評価対象（reviewer出力）、判断基準、判断結果がスパン属性として読める

検証3・4では、S3側とCloudWatch側それぞれの切り落とし有無を記録します。

## 拡張: CloudWatch起点のイベント駆動復元

自作経路とは別に、CloudWatchをソースとする復元経路を実験として追加します。

```
aws/spansへverification_gate(FAIL)スパンが着弾
  → サブスクリプションフィルタ("verification_gate" "FAIL")
  → Lambda: traceId抽出 → 75秒待機 → aws/spansとotel-rt-logsを
    traceIdでクエリ → jsonl化 → 専用バケット(cw-dumps)へPUT
```

- 保存先は自作経路と別のS3バケットとし、経路ごとの結果を分離します
- リソース(バケット、Lambda、IAMロール、サブスクリプションフィルタ)はterraformで管理します
- 待機75秒はヒューリスティックです。トレース完成の確実な信号はありません
- ソースがCloudWatchのため、標準経路で失われた記録はこの経路でも復元できません
- 自作経路(ng-dumps/)との差分を突き合わせ、復元経路の網羅性を評価します

## 削除手順

次の順で削除します。手順完了後にリソースが残らないことを確認します。

1. `agentcore destroy`でRuntimeを削除する
2. `terraform destroy`（人間が実行）でロールとS3バケット2つを削除する
3. CloudWatchロググループなど自動生成物が残っていれば手動で削除する

手順3の対象は実装時に洗い出し、READMEへ記録します。

## ディレクトリ構成

```
20260825_aws_agentcore_otel_pick_logs/
├── TASK.md
├── SPEC.md            # 本書
├── README.md          # 作業ログと検証結果
├── terraform/
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
├── app/
│   ├── pyproject.toml
│   └── src/
│       ├── app.py     # AgentCore用エントリポイント
│       ├── graph.py   # Graph本体 + gate（ローカルとクラウドで共通）
│       └── otel.py    # InMemoryJsonlExporter + jsonl変換
├── scripts/
│   ├── local_run.py   # ローカル実験（ConsoleSpanExporterでjsonl出力）
│   └── invoke.py      # クラウド実行
└── out/               # git管理外
    ├── traces/        # ローカル実験の全スパンjsonl
    └── ng-dumps/      # ローカル実験のNG時jsonl
```

## 前提条件

- AWS SSOでAdministratorAccessへログイン済みであること（確認済み）
- ap-northeast-1でBedrockのClaude Haiku 4.5が呼び出せること
- terraformが使えること（公式バイナリv1.15.9を導入済み）
- uvとzipコマンドが使えること（direct_code_deployのビルドに必要。確認済み）
