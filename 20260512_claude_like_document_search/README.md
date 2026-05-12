# claude-like document search

日本語マルチドキュメント RAG (Claude Code 風の探索ループ) の検証用 til。
実装仕様は `plan.md` を参照。

## データ取得元

- 元データ: [allganize/RAG-Evaluation-Dataset-JA](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-JA)
  - 日本語 RAG 評価用 65 PDF (finance / it / manufacturing / public / retail 各 13 件前後)
  - `documents.csv` に元 PDF の URL・タイトル・出典が記載
- データセットには markdown 版が存在しないため、PDF を Gemini で markdown 化して `docs/` に配置
- ファイル名は元 PDF 名を保持する形式: `<original>.pdf.md` (例: `01.pdf` → `docs/01.pdf.md`)
- 取得済み: **51 / 65** (78%)
  - 残り 14 件は元URLが応答せず取得断念 (METI / 中小企業庁 / 経産系のサーバーが unreachable、または該当URLが 404)
  - 取得不可リスト: `003_02_04.pdf`, `06_info-services_soft.pdf`, `2022_01benchmark.pdf`, `20220518_2.pdf`, `210928.pdf`, `220408shoutengai01.pdf`, `2301atobaraigaiyousiryou.pdf`, `cloud_policy_20210910.pdf`, `FILP_Report2022.pdf`, `gaiyo.pdf`, `iot_guideline.pdf`, `kaisetsushiryou_2024.pdf`, `r3fy-FC-all.pdf`, `tekiseitorihiki-21.pdf`

## 再現手順

```bash
# 1. URL 一覧抽出
curl -sL https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-JA/resolve/main/documents.csv -o /tmp/documents.csv
uv venv .venv && source .venv/bin/activate
uv pip install pymupdf4llm google-genai
python scripts/extract_urls.py /tmp/documents.csv urls.tsv

# 2. PDF ダウンロード (並列 8)
bash scripts/download.sh urls.tsv pdfs

# 3. markdown 化 (Gemini 3.1 Flash Lite Preview, 4 並列)
#    要 ADC: gcloud auth application-default login
#    .env に GOOGLE_VERTEX_PROJECT を設定 (.env.example 参照)
python scripts/batch_convert.py

# 4. 失敗分のリトライ (空応答 / RECITATION / "no pages" 対策)
python scripts/retry_failed.py
```

## ファイル構成

```
pdfs/                # オリジナル PDF
docs/                # markdown 化済み (<元名>.pdf.md)
sqls/
  01_init.sql        # documents / blocks スキーマ + pg_trgm
src/
  knowledge/
    types.ts         # I/O 型
    db.ts            # postgres.js クライアント
    parser.ts        # markdown → blocks
    tools.ts         # list/search/grep/read tools (Vercel AI SDK)
    search-agent.ts  # runSearchAgent (低レベルtoolsを使い evidence を返す)
    chat-agent.ts    # streamChat (searchKnowledge だけを持つ)
    prompts.ts       # system prompts
  cli/
    ingest.ts        # docs/*.md を取り込む
    chat.ts          # 対話 CLI
scripts/             # PDF 取得・markdown 化 (前段パイプライン)
compose.yaml         # Postgres 18 (port 5434)
urls.tsv             # URL / file_name / domain
plan.md              # MVP 実装仕様
```

## RAG MVP の使い方

```bash
# Postgres 18 起動 (port 5434)
docker compose up -d

# スキーマ適用
bun run db:migrate

# 取り込み済みデータをロード (sqls/02_data.sql、51 docs / 約 6600 blocks)
# あるいは docs/*.pdf.md から再取り込みしたい場合は次の `bun run ingest`
bun run db:load
# または:
# bun run ingest

# 対話チャット (Vertex AI ADC で認証、port は 5434 を使う)
# 事前に .env を作成 (.env.example をコピーして GOOGLE_VERTEX_PROJECT 等を設定)
bun run chat
```

### 環境変数 (`.env`)

`.env.example` をコピーして `.env` を作成し、利用するプロバイダの値を設定してください。リポジトリには project id 等の値は書かない方針です。

| 変数 | 用途 |
|---|---|
| `GOOGLE_VERTEX_PROJECT` | Vertex AI を使う GCP project id (必須) |
| `GOOGLE_VERTEX_LOCATION` | Vertex AI リージョン (default: `global`) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini Developer API (vertex の代わりに API key で使う場合) |
| `OLLAMA_BASE_URL` | ローカル Ollama (default: `http://localhost:11434/api`) |
| `DATABASE_URL` | PostgreSQL 接続 URL |
| `CDCS_PDF_MODEL` | PDF→markdown 変換に使うモデル (default: `gemini-3.1-flash-lite-preview`) |
| `CDCS_VERBOSE` | `0` で Search Agent の内部ログを抑止 |

### 動作概要

- Chat Agent (`gemini-3.1-flash-lite-preview`) は `searchKnowledge` ツール 1 つだけを持つ
- `searchKnowledge` の実行で内部 Search Agent が `listDocuments / searchDocuments / grepBlocks / readBlocks` を最大 12 ステップ呼ぶ
- Search Agent は原文確認済み evidence JSON を返し、Chat Agent が path + headingPath 付きで回答する
- ベクトル検索は使わず、`pg_trgm` (ILIKE / `%`) と Postgres 正規表現 (`~ / ~*`) で grep する

## 変換モデル / プロンプト方針

- モデル: `gemini-3.1-flash-lite-preview` (Vertex AI, `global` location)
- プロンプト方針 (`scripts/pdf_to_md.py`):
  - 要約禁止、PDF 全情報を保持
  - 表は markdown table で全セル展開
  - **グラフ・図はデータを読み取って markdown table に再構成** (年度ごとの値、凡例、軸ラベル、出典)
  - フロー図・概念図はノードと矢印関係を箇条書きで記述
  - 日本語は翻訳せずそのまま保持
  - 出力は markdown 本体のみ (フェンス無し)

## 既知の問題

- 一部 PDF で Gemini が `FinishReason.RECITATION` を返す → `scripts/retry_failed.py` の代替プロンプトで回避
- ダウンロード時に拡張子は `.pdf` でも中身が HTML (Access Denied / 404 ページ) のことがある → `file pdfs/*.pdf` で検査推奨
- METI / 中小企業庁系の PDF はサーバー側で IP / UA フィルタが厳しく、UA を変えても取得できないケースがある (本リポジトリでは諦めた)
