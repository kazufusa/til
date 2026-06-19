# vercel ai sdk + OpenTelemetry → Google Cloud

Vercel AI SDK (Gemini / Vertex AI) で `generateText` を叩き、OpenTelemetry で計装して
token 使用量を Google Cloud (Cloud Trace / Cloud Monitoring) で確認できるようにする実験。
認証は API キーではなく ADC (`gcloud auth application-default login`) を使う。

## 構成

- `src/index.ts` — 最小 CLI。`generateText` を `experimental_telemetry` 付きで呼ぶ。
- `src/telemetry.ts` — OTel SDK 初期化と token 使用量メトリクスの記録。
  - **traces**: AI SDK の `ai.*` span → Cloud Trace
  - **metrics**: `result.usage` を `gen_ai.client.token.usage` カウンタに記録 → Cloud Monitoring

## セットアップ

```sh
bun install
cp .env.example .env                       # GOOGLE_VERTEX_PROJECT などを設定
gcloud auth application-default login      # ADC で認証 (API キー不要)
```

## 実行

ローカル確認 (LLM は Vertex、trace/metric は標準出力へ):

```sh
OTEL_TARGET=console GOOGLE_VERTEX_PROJECT=<project-id> bun run start "好きなプロンプト"
```

Google Cloud へ送信:

```sh
OTEL_TARGET=gcp GOOGLE_VERTEX_PROJECT=<project-id> bun run start "好きなプロンプト"
```

## Google Cloud 側の準備

対象プロジェクトで以下が必要:

- API 有効化: `aiplatform.googleapis.com` (Vertex),
  `cloudtrace.googleapis.com`, `monitoring.googleapis.com`
- ADC の認証 ID に権限: `roles/aiplatform.user` (Gemini 呼び出し),
  `roles/cloudtrace.agent`, `roles/monitoring.metricWriter` (OTel 送信)

確認場所:

- Cloud Trace コンソールで `ai.generateText` などの span
- Metrics Explorer で `workload.googleapis.com/gen_ai.client.token.usage`
  (`gen_ai_token_type` = input/output で分かれる)

### 複数アプリの区別

このメトリクスは型が共有なので、複数アプリが書くと衝突する。各アプリに
`service_name` ラベルを付けて区別している (`OTEL_SERVICE_NAME` で設定)。

```sh
OTEL_SERVICE_NAME=my-app-a OTEL_TARGET=gcp ... bun run start
```

集計時は `service_name` で group by / filter する (`scripts/query_usage.sh` 参照)。

## メモ

- Bun install は `bunfig.toml` の `minimumReleaseAge` で 7 日未満の新しすぎる
  バージョンを掴まないようにしている。
- Cloud Monitoring は同一時系列への書き込み頻度に制限があるため、
  メトリクスの export 間隔は gcp 時 60s にしている。
