# 目的

vercel ai sdk で何かアプリを作り, OpenTelemetry で計装して, token 使用量を
Google Cloud 上で確認できるようにする.

- `.env.example` を用意する
- infra で必要な操作があれば Terraform 等を使う

# TODO

## 1. アプリ雛形
- [x] プロジェクト初期化 (Bun / package.json, bunfig.toml cooldown)
- [x] Vercel AI SDK (`ai`) + `@ai-sdk/google` を導入
- [x] 最小の CLI を作成 (`src/index.ts` で `generateText` を叩く)
- [x] `.env.example` 作成 (API キー, GCP プロジェクト ID, OTEL 関連設定)

## 2. OpenTelemetry 計装
- [x] OTel SDK 導入 (`@opentelemetry/sdk-node`, exporter)
- [x] AI SDK の `experimental_telemetry` を有効化し span を出力
- [x] token 使用量を span 属性 + Cloud Monitoring 用カウンタとして記録
- [x] ローカルで trace/metric が出力されることを確認 (console exporter)
- [x] Vertex + ADC で実際に Gemini 応答取得・token 使用量取得を確認

## 3. Google Cloud へエクスポート
- [x] エクスポート方式を決定 (Cloud Trace + Cloud Monitoring exporter)
- [x] GCP 認証情報の取り回しを決める (ADC / SA キー → .env.example に記載)
- [x] 実際に `OTEL_TARGET=gcp` で送信し Cloud Trace に span が出ることを確認
- [x] token 使用量を Cloud Monitoring メトリクスとして送信・REST で集計確認

## 3.5 使用料 (cost) 化
- [ ] モデル別単価表を用意 (使うモデルを確定して単価を入れる)
- [ ] token 集計 × 単価で金額を算出 (cost メトリクス or 集計スクリプト)

## 4. Infra (必要なら)
- [ ] 必要な GCP API 有効化 (monitoring, trace 等)
- [ ] SA / 権限を Terraform で定義
- [ ] `terraform apply` 手順を README 化

## 5. 仕上げ
- [ ] README に構成・起動手順・確認方法をまとめる
- [ ] 動作確認のスクショ or ログを残す

# 決定事項
- プロバイダ: **Google Gemini (Vertex AI)** (`@ai-sdk/google-vertex`)
- 認証: **ADC** (`gcloud auth application-default login`) ※ API キーは使わない
- アプリ形態: **単発スクリプト / CLI** (`generateText` を叩く最小構成)
- ランタイム: Bun

# メモ / 未決事項
- 可視化先は Cloud Monitoring メトリクスで十分か, BigQuery 集計まで要るか
