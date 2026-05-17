# office-to-markdown-2 SPEC

Office (docx / xlsx / pptx) → Markdown 変換。シンプルな npm パッケージ + Bun。
画像は LLM 要約せず、プレースホルダ `> **[画像]** (画像: NAME.ext)` で残す
(LLM 要約は後段の別パイプラインで担当)。

## ゴール

- `fixtures/{docx,pptx,xlsx}/*.expected.md` と **同等の構造化出力**
- 画像は元のファイル名 (`image1.png` 等) で `<output>.media/` に書き出し
- pandoc / pandoc-wasm / libreoffice / Python 系 (markitdown) に依存しない

## 非ゴール

- pandoc 出力の完全 byte-for-byte 再現
- チャート画像のレンダリング(xlsx チャートは pandoc 固有の処理)
- 数式・SmartArt・図形描画
- LLM 要約(別段で実施)

## 依存

| パッケージ | 用途 |
|---|---|
| `mammoth` | docx → HTML |
| `turndown` + `turndown-plugin-gfm` | HTML → markdown(GFM tables) |
| `exceljs` | xlsx 解析(セル, スタイル, 描画アンカー画像) |
| `jszip` | OOXML 解凍、リレーション・画像アクセス |
| `fast-xml-parser` | pptx 用 OOXML 直接 walk(preserveOrder) |

## 出力規約

### ファイル

- `OUTPUT.md` 本体
- `OUTPUT.md.media/imageN.ext` 画像(元の `word/media/` / `xl/media/` / `ppt/media/` 名を維持)

### 画像プレースホルダ

```
> **[画像]** (画像: image1.png)
```

テーブルセル内など in-line では bare span (`**[画像]** (画像: ...)`) を使用。

### 見出し

- Word の `Heading 1..N` スタイルだけを `#..######` に昇格 (no fabricated structure)
- Bold 行や太字パラグラフは昇格しない
- docx の caption スタイル (`pStyle="ac"` = "caption") は、画像隣接時のみ
  `<hN>` (N = 直前見出しレベル + 1) に昇格して image の前に置く。それ以外は body のまま

## 形式別仕様

### docx (mammoth + turndown)

- mammoth で HTML 化 (`convertToHtml`)
- 画像は `convertImage` フックで `imgph:NAME` という placeholder src として残し、バイトを `word/media/*` と `Bun.hash` 照合して元ファイル名を採用
- caption スタイル(`pStyle="ac"`)は styleMap で `<p class="figcap">` にマーク
- HTML 前処理:
  - `<td>/<th>` 内の `<p>` をアンラップ、複数段落は `<br>` 区切り
  - `<thead>` が無いテーブルに空ヘッダ行を挿入(pandoc 流の `|  |  |` ヘッダ)
  - figcap が image と隣接(両順)している場合に **figcap → `<hN>` 化して image の前に置く**(レベルは直前見出し+1、stateful な走査)
  - 画像隣接でない figcap は単なる `<p>` に降格
- turndown + `turndown-plugin-gfm` で GFM 化、入れ子リストは 2 スペースに上書き

### xlsx (exceljs + jszip)

- exceljs で workbook 読み、シートごとに `## SheetName`
- セル走査: `rowCount × columnCount` をフル走査(`actualRowCount` は信頼不可)
- セル種別:
  - 数値: 整数は `N.0`、float はそのまま (pandoc 流)
  - Date: Excel シリアル番号に変換 (1899-12-30 epoch)
  - 数式: `result` を再変換
  - リッチテキスト: テキスト連結
  - エラー値(`#VALUE!`): rich-data 画像で上書きされるので空文字列
- スタイル: `cell.font.bold` で `**...**` ラップ
- 画像処理:
  1. drawing-anchored: `ws.getImages()` + `wb.model.media`
  2. cell-anchored ("Image in cell" / IMAGE() rich-data): `xl/richData/*` + `xl/metadata.xml` をパース(`rc.v` → `rv` → `rel` → `rId` → image path)
  3. **チャンク分割前に**セルアンカーを grid に適用(エラー値セルが「データありの行」として扱われる)
  4. グリッドを「全空白行」で分割、各サブテーブルごとに前後の空カラムを除去
  5. drawing 画像はそのアンカー行を含むチャンクの直後にブロック配置

### pptx (jszip + fast-xml-parser)

- `ppt/_rels/presentation.xml.rels` + `ppt/presentation.xml` でスライド表示順を取得
- スライドごとに `## <title>`(`p:ph type="title|ctrTitle"` プレースホルダのテキスト)。タイトル無し → `## Slide N`
- XMLParser は `parseTagValue: false`(`<a:t>2011.10</a:t>` が数値化されて末尾 0 落ちするのを防ぐ data-loss 対策)
- `ppt/slides/_rels/slideN.xml.rels` から rId → image path
- `p:spTree` を再帰的に walk:
  - `p:sp` → `p:txBody` → `a:p`/`a:r`/`a:t` でテキスト抽出
    - `a:buChar` がある段落 → `- ` バレット
    - `a:buAutoNum` がある段落 → `1. 2. 3. ...` 順序付きリスト
    - 連続するリスト項目は tight join(`\n` 区切り)で 1 つのリストブロックに集約
  - `p:graphicFrame` → `a:tbl`/`a:tr`/`a:tc` を pipe table へ
  - `p:pic` → `p:blipFill/a:blip/@r:embed` から rId → image filename
  - `p:grpSp` → 再帰するが **内部の `p:pic` は emit しない**(group はコンポジット図形であり、内部画像は単独の意味を持たない。pandoc も同じ挙動)
- 画像ファイルは body 内の placeholder で参照されたものだけを `.media/` に書き出す(group 内 skip により orphan を生む rels エントリは除外)

## 評価軸: 「意味の欠落」のみを問題とする

cf. memory: `feedback_semantic_over_exact_match`

差分は以下の 3 分類で評価する:

1. **データ欠落** (文字が消える/化ける) → 修正
2. **markdown 構造の意味喪失** (見出しレベル変化、リストが段落化、表が表でなくなる、placeholder の付加/欠落) → 修正
3. **整形差** (空白、カラム幅、空行、無意味コメント、画像 file 名の renumber) → 許容

## 受け入れた偏差(整形差のみ、意味は等価)

| 項目 | expected | 現状 | 判断 |
|---|---|---|---|
| 表のカラム幅整形 | 揃え | 詰める | render 上同等 |
| 入れ子リスト記号 | `1.` / `1)` / `1.` | すべて `1.` | mammoth は marker 種類を出さない、リスト構造は維持 |
| 入れ子リスト間の空行 | あり | なし | render 上同等(tight list) |
| 空 `## ` 見出し(docx) | 残る | 落ちる | 空見出しは意味的に無 |
| 売上シート C 列の bold(xlsx) | あり | なし | source xlsx に bold 設定無し → mine が source 忠実 |
| ヘッダ行の bold strip(xlsx) | 解除 | 保持 | source に bold あり → mine が source 忠実 |
| png 画像番号(xlsx) | チャート分込みでリナンバー | 元名維持 | 同じ画像ファイル参照、LLM 後処理は filename で読むので命名規約不問 |
| `<!-- -->` リスト区切り(pptx) | あり | なし | pandoc 固有の list-break ヒント |
| 段落間の空白 ` `(pptx) | 維持 | 圧縮 | render 上同等 |
| 半角/全角間スペース(pptx) | あり | なし | render 上同等 |
| 末尾改行 | あり | なし | render 上同等 |

## LLM 後処理可能な状態の保証

placeholder は以下の形式で出力され、後処理で `(画像: FILENAME)` 部分を LLM 生成テキストに置換するだけで `*.llm.md` 形式になる。

- block: `> **[画像]** (画像: image1.png)`
- inline(テーブルセル内): `**[画像]** (画像: image1.png)`
- 正規表現: `/\*\*\[画像\]\*\* \(画像: ([^)]+)\)/g`
- 全 placeholder の filename は `.media/` に対応ファイルが存在(orphan 0、broken 0)
- 全 fixture で expected との **placeholder 集合が一致**(xlsx は renumber 差のみで意味同等)

## 進捗

| タスク | 状態 |
|---|---|
| 1. scaffold | ✅ |
| 2. shared lib | ✅ |
| 3. docx backend | ✅ |
| 4. xlsx backend | ✅ |
| 5. pptx backend | ✅ |
| 6. CLI + dispatch | ✅ |

## 使い方

```sh
bun install
bun run convert.ts fixtures/docx/sample.docx /tmp/out.md
bun run convert.ts fixtures/xlsx/example.xlsx /tmp/out.md
bun run convert.ts fixtures/pptx/sample.pptx /tmp/out.md
# → /tmp/out.md + /tmp/out.md.media/image*.{png,jpeg,...}
```

## テスト(golden)

`fixtures/*/*.expected.md` と完全一致比較するゴールデンテストを
`test/golden.test.ts` に実装。

```sh
bun test        # または bun run test
```

`fixtures/<format>/` 配下の `.docx` / `.xlsx` / `.pptx` を自動検出し、
対応する `<name>.expected.md` がある場合のみテスト対象になる。
失敗時は `expect(...).toBe(...)` の diff が unified diff 形式で表示される。

> **現状**: 5 件のフィクスチャで全て構造一致しているものの、
> 上記「受け入れた偏差」の範囲で文字列差分が出るため exact-match では fail する。
> diff を見て expected を更新するか、コードを直すかは個別判断。

## ファイル構成

```
office_to_markdown_2/
├── SPEC.md
├── convert.ts          # CLI エントリ・形式ディスパッチ
├── package.json
├── tsconfig.json
├── lib/
│   ├── types.ts        # Conversion / Image / Format
│   ├── common.ts       # OOXML 検証, mime, image placeholder, image 書き出し
│   ├── docx.ts         # mammoth + turndown + GFM、figcap state-rewrite
│   ├── xlsx.ts         # exceljs + rich-data セルアンカー
│   └── pptx.ts         # jszip + fast-xml-parser、p:spTree walk
└── fixtures/
    ├── docx/
    ├── pptx/
    └── xlsx/
```
