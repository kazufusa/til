# office → markdown (pandoc-wasm + Gemini)

Office Open XML (`.docx` / `.xlsx` / `.pptx`) を GitHub-Flavored Markdown に変換する Bun スクリプト。

- 変換エンジンは **pandoc-wasm** (WebAssembly ビルドの pandoc、in-process で動く)。`pandoc` バイナリ不要、Bun が WASM をネイティブ実行
- 画像はファイルとして残さず、Gemini が生成したキャプションを本文中にインラインで埋め込む (block: `> **[画像]** …` / table cell: `**[画像]** …`)
- xlsx の画像は pandoc が認識しないので、drawing-anchored と「セル内画像」(IMAGE() / rich-data) を OOXML XML から直接読み取り、シート内の正しい位置に挿入
- **ローカル FS を汚さない**: 処理中の temp ディレクトリも、出力時の `.media/` 等の side-car も作らない。出力は `.md` 1 ファイルだけ

これは [`../`](../) で複数バックエンド (pandoc CLI / mammoth / officeparser / markitdown / gemini-pdf) を比較計測した結果の **完成版**。

## 動作要件

- Bun
- Vertex AI に通る ADC (`gcloud auth application-default login`)
- `.env`:

```
GOOGLE_VERTEX_PROJECT=<your-project>
GOOGLE_VERTEX_LOCATION=global
GOOGLE_VERTEX_MODEL=gemini-3.1-flash-lite-preview
```

## 使い方

```bash
bun install

bun run convert.ts fixtures/docx/sample.docx
bun run convert.ts fixtures/xlsx/sample.xlsx
bun run convert.ts fixtures/pptx/sample.pptx

# 出力先を明示
bun run convert.ts in.docx out.md

# テスト (parser まわりは Gemini を呼ばずに検証可能)
bun test
```

デフォルト出力名は `<input>.md` (例: `sample.xlsx` → `sample.xlsx.md`)。**出力はこの 1 ファイルのみ**、`.media/` のような side-car ディレクトリは作らない。

## ファイル

```
final/
├── convert.ts         CLI エントリ
├── lib/
│   ├── types.ts       Format / Image / Source
│   ├── common.ts      loadSource (file → ArrayBuffer + JSZip を 1 度だけ) + mime + escape
│   ├── pandoc.ts      pandoc-wasm runner、参照画像のみ lazy 抽出
│   ├── xlsx.ts        xlsx 専用 anchor 解析 + GFM テーブルへの splice
│   ├── gemini.ts      画像 → Vertex AI Gemini → 日本語キャプション (並列 8)
│   └── output.ts      placeholder → 「**[画像]** 要約文」テキスト置換 (画像ファイルは書かない)
├── tests/             bun test の単体テスト (23 ケース)
├── fixtures/{docx,xlsx,pptx}/sample.*   入力サンプル
└── package.json       4 dep: pandoc-wasm / jszip / exceljs / @google/genai
```

## なぜ pandoc-wasm にしたか (短縮版)

実験フェーズ (`../`) で 7 backend を全 fixture で比較した結果:

| backend | 評価 |
|---|---|
| **`pandoc-wasm`** | docx/xlsx/pptx すべてで CLI pandoc と同等品質、しかも binary 不要・in-process |
| `pandoc` (CLI) | 同等品質だが外部バイナリ依存 |
| `mammoth-md` | 表が崩壊 |
| `mammoth-html` | 出力が HTML 寄り |
| `officeparser` | 構造を捨てた純テキスト |
| `markitdown` | 画像が消失/衝突/base64 漏洩 |
| `gemini-pdf` | LibreOffice 依存 + LLM 非決定的、出力品質の代償が見合わない |

詳細な比較は `../README.md` と `../compare/all/` 参照。
