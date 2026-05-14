# 比較サマリ

`scripts/compare.ts` で各アプローチを 2 つの fixture に対して実行した結果。

| approach | fixture | bytes | headings | gfmRows | htmlTbl | mdImg | htmlImg | base64 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mammoth-md-default | sample | 2,880 | 3 | 0 | 0 | 1 | 0 | 2,662 |
| mammoth-md-stubbed | sample | 240 | 3 | 0 | 0 | 1 | 0 | 0 |
| mammoth-html-default | sample | 3,244 | 0 | 0 | 1 | 0 | 1 | 2,662 |
| mammoth-html-stubbed | sample | 611 | 0 | 0 | 1 | 0 | 1 | 0 |
| officeparser-text | sample | 165 | 0 | 0 | 0 | 0 | 0 | 0 |
| pandoc-gfm | sample | 519 | 0 | 6 | 0 | 0 | 1 | 0 |
| mammoth-md-default | _open | 365,714 | 0 | 0 | 0 | 2 | 0 | 364,582 |
| mammoth-md-stubbed | _open | 1,084 | 0 | 0 | 0 | 2 | 0 | 0 |
| mammoth-html-default | _open | 365,994 | 0 | 0 | 0 | 0 | 2 | 364,582 |
| mammoth-html-stubbed | _open | 1,364 | 0 | 0 | 0 | 0 | 2 | 0 |
| officeparser-text | _open | 761 | 0 | 0 | 0 | 0 | 0 | 0 |
| pandoc-gfm | _open | 1,354 | 0 | 0 | 0 | 0 | 2 | 0 |

## 列の意味
- `bytes`: 出力ファイルサイズ (文字数)
- `headings`: `^#{1,6} ` で始まる行の数 (Markdown 見出し)
- `gfmRows`: `^|...|$` パターンの行数 (GFM テーブル行)
- `htmlTbl`: `<table` の出現数 (HTML テーブル要素)
- `mdImg`: `![alt](src)` 形式の画像数
- `htmlImg`: `<img` の出現数
- `base64`: data:image base64 として埋め込まれた合計バイト数 (見えない肥大化分)