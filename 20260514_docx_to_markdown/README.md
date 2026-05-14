# office (.docx / .xlsx / .pptx) → markdown (画像は Gemini で説明文化)

Office 文書 (Word / Excel / PowerPoint) を Markdown に変換する Bun スクリプト。
**変換バックエンドはコマンドラインで切り替え可能** (`--backend=<name>`)、
入力フォーマットは拡張子から自動検出。
画像 (グラフ含む) は Gemini (Vertex AI) で説明文化して埋め込む処理を backend 横断で共通実装。

## どの backend を使うべきか (結論)

**全フォーマット `pandoc` (default) が最良**。`gemini-pdf` は xlsx/pptx の **構造抽出が pandoc で崩れる稀なケース** だけの代替。

| format | 推奨 | 代替を検討する条件 |
|---|---|---|
| **docx** | `pandoc` | (実質なし。docx は構造化が一番進んでおり、画像内テキストも `pandoc + 画像ごと Gemini 説明` で拾えるので gemini-pdf は冗長) |
| **xlsx** | `pandoc` (+ anchor 解析) | 大量の結合セルや「シート全体を 1 つの帳票として書式整形している」ケースで pandoc の表抽出が崩れたら `gemini-pdf` |
| **pptx** | `pandoc` | 図形・矢印・吹き出しが意味を持ち、テキスト抽出だけでは意図が再現できないスライドで `gemini-pdf` |

> 注: `make-fixture.ts` で生成する `sample.docx` は、`docx` npm パッケージが出す `styles.xml` が pandoc の Heading 判定基準を満たしていなかった (Normal 定義無し、name="Heading 1" 大文字、outlineLvl 無し)。`make-fixture.ts` 内の `patchHeadingStyles()` で post-process して修正済み。**pandoc 自体は正しく Heading を認識する**。

その他 backend の位置付け:
- `mammoth-md` / `mammoth-html`: docx 限定。pandoc が動かない環境でのフォールバック
- `officeparser`: 構造を捨てた純テキスト抽出。検索インデックス用途など
- `markitdown`: 単独では実用に耐えない (後述)。比較計測のために残してある

### markitdown の実測 (= 推奨しない理由)

`compare/all/` で各 backend を全 fixture に走らせた結果:

| 観点 | 結果 |
|---|---|
| docx 画像 | ❌ `data:image/jpeg;base64,…` を本文にベタ書き、alt に `C:\Users\pfirst\…` の **ローカル Windows パスを漏洩** |
| xlsx 画像 | ❌ drawing-anchored / セル内画像とも **5 枚全部消失**、表に `NaN` / `Unnamed: 2` の pandas 残骸 |
| pptx 画像 | ❌ 全画像が `Image0.jpg` の同名で衝突、抽出ファイル無し |
| pptx スライド | ⚠️ `<!-- Slide number: N -->` (HTML コメント、markdown 見出しでない) |
| docx 見出し | ✅ Word Heading スタイル → `#`/`##` を pandoc より正しく拾う |
| 数値表記 | ✅ 整数のまま (`3`)、pandoc は `3.0` |

「画像を markdown に含める」という本プロジェクトの要件 (#4) を **複数の方法で破壊** するので、画像入り文書には不適。テキストだけ取りたい用途 (画像はあっても無視で OK) なら pandoc より cleaner な markdown が出る、というニッチな立ち位置。

### 全 backend 比較

| backend | 種別 | 対応 | 表 | 見出し | 画像/図 | 決定性 | 外部依存 |
|---|---|---|---|---|---|---|---|
| **`pandoc`** (default) | CLI | docx / xlsx / pptx | ✅ 整った GFM | ✅ | ✅ 抽出 + 当 repo で位置 splice (xlsx) | ✅ 決定的 | pandoc |
| `gemini-pdf` | CLI + LLM | docx / xlsx / pptx | ✅ Gemini が読解 | ✅ | ✅ 画像内テキスト含めて LLM が要約 | ❌ LLM 揺らぎ | LibreOffice + Vertex AI |
| `markitdown` | Python CLI | docx / xlsx / pptx | ✅ Microsoft 実装 | ✅ | ✳️ 描述あり (extract はしない) | ✅ 決定的 | Python + `markitdown[all]` |
| `mammoth-md` | npm | docx のみ | ❌ セルが平坦化 | ✅ `#` | ✅ フック | ✅ 決定的 | npm のみ |
| `mammoth-html` | npm | docx のみ | ✅ `<table>` 保持 | ✅ `<h1>` | ✅ フック | ✅ 決定的 | npm のみ |
| `officeparser` | npm | docx / xlsx / pptx | ❌ プレーンテキスト | ❌ | ✅ zip 直読みで末尾集約 | ✅ 決定的 | npm のみ |

### 外部依存があるバックエンドと Docker

`gemini-pdf` (LibreOffice 必要) と `markitdown` (Python + pip パッケージ必要) はホスト側で `apt install` / `pip install` するか、リポジトリ同梱の `Dockerfile` を使う:

```bash
docker build -t office2md .

# pandoc (default) — Docker でも普通に使える
docker run --rm --env-file .env -v "$PWD:/app" office2md convert.ts fixtures/docx/sample.docx

# gemini-pdf (Vertex AI ADC を mount で渡す)
docker run --rm --env-file .env \
  -v ~/.config/gcloud:/root/.config/gcloud \
  -v "$PWD:/app" office2md \
  convert.ts --backend=gemini-pdf fixtures/xlsx/sample.xlsx

# markitdown
docker run --rm -v "$PWD:/app" office2md \
  convert.ts --backend=markitdown fixtures/pptx/sample.pptx
```

ローカルで試すなら:
- LibreOffice: `apt-get install libreoffice` / `brew install --cask libreoffice`
- MarkItDown: `pipx install 'markitdown[all]'` (推奨) / `pip install 'markitdown[all]'`

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
bun run make-fixture.ts             # fixtures/docx/sample.docx を生成
bun run make-fixture-xlsx.ts        # fixtures/xlsx/sample.xlsx を生成
bun run make-fixture-pptx.ts        # fixtures/pptx/sample.pptx を生成

bun run convert.ts                                          # default: fixtures/docx/sample.docx → ...sample.docx.md
bun run convert.ts fixtures/xlsx/sample.xlsx                 # xlsx も同様に変換
bun run convert.ts fixtures/pptx/sample.pptx                 # pptx も同様に変換
bun run convert.ts --backend=mammoth-md in.docx out.md       # backend 切替え
bun run convert.ts --backend=officeparser in.xlsx            # xlsx/pptx は pandoc か officeparser
bun run convert.ts --help                                    # オプション一覧
bun run convert.ts --list-backends                           # backend 一覧 + 対応 format

bun run scripts/compare.ts                                   # docx fixture 群で全 backend を実行し比較
```

出力ファイル名はデフォルトで `<input>.<backend>.md` (例: `sample.xlsx` を pandoc backend → `sample.xlsx.pandoc.md`)。

- ソース拡張子を残す: 同一フォルダに `foo.docx` と `foo.xlsx` が同居していても `foo.md` 衝突しない
- backend 名を含める: 複数 backend を試したときに `sample.xlsx.pandoc.md` / `sample.xlsx.markitdown.md` が共存できる
- 画像は `<input>.<backend>.md.media/` に backend ごと独立に書き出す

`pandoc` を default に置いた理由は **「`.md` として読んで実際に markdown になっている」のがこれだけだから** (mammoth-html はほぼ HTML、mammoth-md は表が壊れ、officeparser はテキスト)。pandoc を入れたくない/環境で動かないケース用に他 3 backend も差し替え可。

## ライブラリ選定: なぜ mammoth (`convertToHtml`) なのか

`scripts/compare.ts` で 2 つの fixture (`sample.docx`: 表 + 画像 + Heading スタイル / `_open.docx`: 報道リリースの実ファイル) を 6 アプローチに掛けて計測した。生の出力は `compare/`、サマリは `compare/SUMMARY.md`。

### 質的比較

| アプローチ | 表 | 画像 | 見出し | コメント |
|---|---|---|---|---|
| `mammoth.convertToMarkdown` (default) | ❌ 各セルが独立 `<p>` に分解されて行列が消える | ❌ base64 を本文に直書き (`_open.docx` で +364 KB) | ✅ Word の Heading スタイルを `#` に | 画像が肥大化、表が壊滅 |
| `mammoth.convertToMarkdown` + image hook | ❌ 同上 | ✅ プレースホルダ可 | ✅ | 表が壊滅 |
| **`mammoth.convertToHtml` + image hook** | **✅ `<table>` で完全保持 (HTML は markdown 内で valid)** | **✅** | **`<h1>`/`<h2>` で保持** | **採用** |
| `officeparser` (text mode) | ❌ プレーンテキストに展開 | ❌ 無視 | ❌ 区別なし | 全文検索向き |
| `pandoc --to=gfm` | ✅ 整った GFM テーブル | ✅ ディレクトリへ書き出し | ❌ 自作 fixture の Heading を `#` 化できなかった | 出力品質は最も綺麗。外部バイナリ依存 |

### 定量計測 (`scripts/compare.ts` の出力そのまま)

| approach | fixture | bytes | headings | gfmRows | htmlTbl | mdImg | htmlImg | base64 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mammoth-md-default | sample | 2,880 | 3 | 0 | 0 | 1 | 0 | 2,662 |
| mammoth-md-stubbed | sample | 240 | 3 | 0 | 0 | 1 | 0 | 0 |
| mammoth-html-default | sample | 3,244 | 0 | 0 | 1 | 0 | 1 | 2,662 |
| **mammoth-html-stubbed** | sample | **611** | 0 | 0 | **1** | 0 | 1 | 0 |
| officeparser-text | sample | 165 | 0 | 0 | 0 | 0 | 0 | 0 |
| pandoc-gfm | sample | 519 | 0 | 6 | 0 | 0 | 1 | 0 |
| mammoth-md-default | _open | 365,714 | 0 | 0 | 0 | 2 | 0 | **364,582** |
| mammoth-md-stubbed | _open | 1,084 | 0 | 0 | 0 | 2 | 0 | 0 |
| mammoth-html-default | _open | 365,994 | 0 | 0 | 0 | 0 | 2 | **364,582** |
| **mammoth-html-stubbed** | _open | **1,364** | 0 | 0 | 0 | 0 | 2 | 0 |
| officeparser-text | _open | 761 | 0 | 0 | 0 | 0 | 0 | 0 |
| pandoc-gfm | _open | 1,354 | 0 | 0 | 0 | 0 | 2 | 0 |

列の意味:
- `headings`: `^#{1,6} ` 行の数 — **markdown 記法の `#` のみ**。`mammoth-html` の `<h1>...</h1>` はこのカウントに入らない (HTML 出力なので) が、見出しとしては保持されている
- `gfmRows` / `htmlTbl`: GFM テーブル行数 / HTML `<table>` 要素数 — 「表が markdown 上で表として残っているか」の指標
- `mdImg` / `htmlImg`: `![]()` / `<img>` の数
- `base64`: 出力に直書きされた `data:image;base64,...` の合計バイト数 — image hook を渡さないと本文が画像 base64 で肥大化することの数値証拠 (`_open` で 364 KB)

### 選定理由

要件「**markdown には表が読み取られていること**」を npm ライブラリだけで満たせるのは `mammoth.convertToHtml` のみ (`htmlTbl=1` を保持し他は 0)。Markdown は HTML をインラインで許容するので `.md` の中に `<table>` があっても全 renderer で表としてレンダリングされる。

要件「**markdown には表が読み取られていること**」を npm ライブラリだけで満たせるのは `mammoth.convertToHtml` のみ。Markdown は HTML をインラインで許容するので `.md` の中に `<table>` があっても全 renderer で表としてレンダリングされる。

pandoc は `gfmRows=6` で出力品質が最良だが、

- 外部バイナリ依存 (Bun だけで完結しない)
- 自作 fixture では Heading スタイル (`headings=0`) を認識せず `#` 化が落ちる

の点でやめた。npm の中で閉じたまま、表と構造を保てる `mammoth.convertToHtml` (`htmlTbl=1` で表保持、見出しは `<h1>` HTML で残る) が今回の要件には最適。

## 参考解答 (screenshot → Gemini → md)

「シートを画像で渡して LLM に markdown 化させたらどうなるか」を参考解答として保存してある。
`scripts/screenshot-to-md.ts` がそのスクリプト。

```bash
bun run scripts/screenshot-to-md.ts fixtures/xlsx/sample.xlsx.expected.md \
    fixtures/xlsx/sample.xlsx.1.png fixtures/xlsx/sample.xlsx.2.png
```

`fixtures/xlsx/sample.xlsx.expected.md` が出力例。prompt は意図的に**最小** (`"渡されたスクリーンショットの内容を GFM に変換してください"` 1 行) にしてある。これは fixture 特有の失敗 (transpose してくる / 存在しないセル番地を捏造する) を見て prompt にパッチを足し続けると「Gemini の素の能力」ではなく「自分のプロンプト職人芸」を測ることになってしまうため。

その結果、Gemini は概ね:

- ヘッダ・表構造・横並びの並びを正しく取り出す
- 画像 URL が無いので `placeholder.com` の URL で誤魔化し、末尾に「画像はプレースホルダーです」と自己申告する (= 画像内容を勝手に作話しない)
- セル番地 (A1 等) は **出さない** (= 画像から目分量で読むしかなく不確定なので Gemini 側も避ける)

この素の出力と、我々の parser 出力 (`sample.xlsx.md`) を並べると役割の違いが明確になる:

| 観点 | parser 出力 | Gemini 素の出力 |
|---|---|---|
| 表構造 | XML 由来で機械的に正確 | 視覚的に正確 (失敗時は transpose する) |
| セル番地 (A18 等) | xlsx の rich-data XML から取得 → **正確** | 出さない |
| 画像内容 | Gemini で個別に説明 | プレースホルダ URL に置換 |
| 再現性 | 完全に決定的 | 実行ごとに揺れる |

実用は parser+pandoc。Gemini 参考解答は「LLM 直叩きで何が落ちる/何が拾える」を素のまま観察するベンチマーク用途。

## 別アプローチ: PDF 化して Gemini に丸投げ

`docx → PDF → Gemini に markdown 化を依頼` という構成もある。Gemini は PDF を inline で受け付けるので、構造把握から markdown 生成までを 1 回の LLM 呼び出しで完結できる。

| 観点 | 現行 (パーサ + Gemini 画像のみ) | PDF + Gemini 丸投げ |
|---|---|---|
| 構造再現 | パーサの出力品質に依存 (表/見出しなど機械的に正確) | LLM が読解する。複雑なレイアウトに強い |
| 数式・図表内のテキスト | 画像内テキストは Gemini にキャプションさせるのみ | 全部 LLM が読み取れる (OCR 込み) |
| 決定性 | 高い (同じ docx → 同じ出力) | 低い (LLM 揺らぎ。本文の言い換え・要約のリスク) |
| 速度 | 数百 ms 〜数秒 | docx 全体を 1 リクエストで。数秒〜数十秒 |
| コスト | 画像数に比例 (数枚程度) | 文書全長に比例 (大きい docx で割高) |
| 外部依存 | pandoc または npm のみ | **PDF レンダラ必須** (LibreOffice headless / wkhtmltopdf / LaTeX 等) |

実装スケッチ:

```ts
// 1. docx → pdf  (例: libreoffice --headless --convert-to pdf in.docx)
// 2. PDF bytes を Gemini に送って markdown 化を依頼
const res = await ai.models.generateContent({
  model,
  contents: [{
    role: "user",
    parts: [
      { text: "この PDF の内容を Markdown で出力。見出し/表/箇条書きを保持。" },
      { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
    ],
  }],
});
```

採用しなかった理由: 今回の環境に PDF レンダラが入っておらず、それを入れる前提だと「mammoth/pandoc 任せ + 画像だけ Gemini」より重くなる。決定性が落ちる点も大きい (本文を LLM が書き換える可能性)。要件「画像内容を markdown に含める」は現行構成で満たせているので、PDF 経路は **採用候補としては妥当だが優先度は下** という位置付け。

## 検討したが採用しなかったもの

- **`mammoth.convertToMarkdown`** — 純 Markdown 出力。ただし表はセル毎に独立段落へ分解されるため使えない。さらに画像フックを渡さないと巨大な base64 を本文に直接埋め込む。
- **`officeparser`** — `.docx`/`.xlsx`/`.pptx`/`.pdf` を共通 API でテキスト抽出。表構造も画像も保持しない。
- **`mammoth.convertToHtml` → turndown + GFM** — HTML を GFM markdown に落とす案。mammoth が `<th>` を出力せず turndown-plugin-gfm は `<th>` 無しのテーブルを markdown 化しないため、`<td>` → `<th>` 昇格やセル内 `<p>` 平坦化など複数の後処理が必要になる。「ライブラリの欠落を自前ロジックで埋める」アプローチは別の docx で壊れる確率が高いので避けた。
- **`docx4js` / 自前 XML パース** — 過剰。
- **LibreOffice headless** — 重量級なので不採用。
- **pandoc CLI** — 出力品質は最良 (上記参照)。外部バイナリ依存と一部 Heading 認識の問題で見送り。

## 出力の見え方

```markdown
<h1>月次売上レポート</h1>
<p>このドキュメントは…</p>

<h2>売上一覧</h2>

<table>
<tr><td><p><strong>商品名</strong></p>
</td><td><p><strong>数量</strong></p>
…
</table>

<h2>売上グラフ</h2>
<p><strong>[画像: img_0]</strong> 5つの異なる色の棒で構成された棒グラフです。…<br/></p>
<p>上のグラフは各商品の売上を示しています。…</p>
```

ベタの HTML 風に見えるが拡張子は `.md`、Markdown renderer (GitHub, VSCode preview, pandoc, etc.) はインライン HTML をそのまま尊重する。表は表として、見出しは見出しとして、ちゃんとレンダリングされる。

## 実装メモ

- `convert.ts` は 3 ステップだけ:
  1. `mammoth.convertToHtml` で docx → HTML を取得。画像は `convertImage` フックで横取りして `src="PLACEHOLDER:img_N"` のスタブに置き換え、bytes を保持
  2. 各画像を Gemini に渡し日本語キャプションを生成 (1〜3 文)
  3. プレースホルダ `<img>` を `<strong>[画像: id]</strong> 説明<br/>` のインライン HTML へ置換し、ブロック要素境界に改行を入れて (`prettifyBlocks`) `.md` に書き出す
- Gemini に渡せる MIME は PNG / JPEG / WEBP / HEIC / HEIF。GIF などは置換テキストに `(未対応の画像形式: …)` を残してスキップ。
- mammoth は本文 (`<w:body>`) のみを処理する。ヘッダー/フッター内の画像は対象外。
- Vertex AI は ADC で認証 (`new GoogleGenAI({ vertexai: true, project, location })`)、API キー不要。
- `make-fixture.ts` は `docx` パッケージで表＋画像入りの test docx を生成 (PNG は自作の小さいエンコーダで5本バー風の図を描く)。

## ファイル

- `convert.ts` — 変換本体 (4 backend + 共通 image-injection)
- `lib/png.ts` — fixture 用の最小 PNG エンコーダ (bar chart / pie chart 風 PNG)
- `make-fixture.ts` — `fixtures/docx/sample.docx` を生成
- `make-fixture-xlsx.ts` — `fixtures/xlsx/sample.xlsx` を生成 (2 シート + bar/pie chart 画像)
- `make-fixture-pptx.ts` — `fixtures/pptx/sample.pptx` を生成 (4 スライド + bar/pie chart 画像)
- `scripts/compare.ts` — docx 向け全 backend の出力と統計を `compare/` に並べる比較スクリプト
- `fixtures/{docx,xlsx,pptx}/` — 入力 office ファイルと変換出力 md
- `compare/` — backend 比較結果 (各出力 + `SUMMARY.md` の指標表)
