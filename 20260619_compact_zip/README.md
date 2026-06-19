# compactzip

zip / pptx / docx / xlsx を **中身を展開せずにストリーム処理** して、内部の画像を
ダウンスケール＆再圧縮し、より軽い同形式のファイルに変換する Go コマンド。

ファイルを Office 文書として「開く」ことはせず、zip エントリの並びとして扱う:

- 画像でないエントリ … 既圧縮バイトをそのまま素通し（再圧縮なし、`CreateRaw`）
- 画像エントリ … デコード → 長辺を縮小 → **同じ形式で**再圧縮。
  **小さくなった場合だけ**差し替える（ならなければ元バイトを保持）
- 対応形式: **PNG / JPEG / GIF / BMP / TIFF**。アニメーション GIF とベクタ（EMF/WMF）は素通し

**ファイル名・画像形式は変えない**ので、`.rels` や `[Content_Types].xml` の参照を
書き換える必要がなく、元と同じ pptx/docx/xlsx として安全に開ける。
（PNG を JPEG に変換するような形式変更はしない: 劣化・透過喪失・参照ずれの原因になるため。）

## Build

```sh
go build -o compactzip .
```

PNG / JPEG / GIF は標準ライブラリ、BMP / TIFF は `golang.org/x/image` を使う。
（依存追加時は 7 日 cooldown を適用し、公開から 7 日以上経過した版にピン留めする。
現在 `golang.org/x/image v0.42.0`。）

## Test

```sh
go test ./...
```

zip 生成 → compact → 検証まで、外部ツールなしのインメモリ spec テスト
（各形式の縮小・形式維持・名前/順序保持・アニメ GIF 素通し・透過保持・並列決定性ほか）。

## Usage

**フラグは無し。常に最大圧縮**（長辺 `800px` / JPEG品質 `40`、ソース内定数で固定）。
入出力は引数で渡す。省略時は stdin / stdout。

```sh
compactzip deck.pptx deck.small.pptx     # in -> out
compactzip deck.pptx                     # in -> stdout
cat deck.pptx | compactzip > out.pptx    # パイプフィルタ (stdin -> stdout)
```

### 並列数

並列ワーカー数は**自動検出**。未設定なら `runtime.GOMAXPROCS(0)` を使う。これは
**Go 1.25+ でコンテナ対応**になっており、Cloud Run の cgroup CPU リミット（CFS quota）
を見て割り当て vCPU 数を返す（`runtime.NumCPU()` のようにホストのコア数を過大計上しない）。
そのため通常は何も設定しなくてよい。

明示的に上書きしたいときだけ環境変数 `COMPACTZIP_JOBS` を渡す:

| env | default | 説明 |
|-----|---------|------|
| `COMPACTZIP_JOBS` | `GOMAXPROCS(0)`（≒割り当てCPU） | ワーカー数の上書き。未設定・不正値・1未満なら自動検出値 |

```sh
COMPACTZIP_JOBS=4 compactzip deck.pptx deck.small.pptx   # 明示指定したい場合のみ
```

## 例

18MB の pptx を最大圧縮:

```
$ compactzip tmp/sample-3.pptx out.pptx
# 18MB -> 1.67MB (元の約9%)
```

## ベンチ: pptx→圧縮PDF パイプラインの前段に挟むと速い

pptx を「圧縮 PDF」にする定番パイプライン **LibreOffice headless + ghostscript** の前段に
本コマンドを挟むと、**全体が速くなり、PDF も小さくなる**。画像を先に縮小しておくことで、
LibreOffice のインポート/レンダリング負荷が下がり、ghostscript の重いダウンサンプルが
ほぼ不要になるため。compactzip 自身のコスト（数秒）はこの節約に十分見合う。

- **A**: `pptx → (LibreOffice) → pdf → (ghostscript) → 圧縮pdf`
- **B**: `pptx → (compactzip) → 縮小pptx → (LibreOffice) → pdf → (ghostscript) → 圧縮pdf`

`sample-3.pptx`（18MB）/ 5回計測の中央値:

| 段 | A | B |
|---|---|---|
| compactzip | – | ~3.6s |
| LibreOffice | ~68s | ~50s |
| ghostscript | ~9.0s | **~0.5s**（約18倍速） |
| **total** | **76.7s** | **54.3s** |
| 出力PDF | 2,672 KB | 915 KB |

→ **B は 1.41 倍速く、PDF も約 1/3**。効果は画像が多く高解像度なほど大きい
（小さいデッキは LibreOffice の固定起動コストが支配的で差は縮む）。

再現スクリプトは `bench/`（`a_baseline.sh` / `b_compactzip.sh` / `bench.sh`）:

```sh
# 要 libreoffice-impress と ghostscript、先に go build しておく
bash bench/bench.sh <deck.pptx> 5
```

## 設計メモ

- zip の中央ディレクトリは末尾にあるため、`archive/zip.Reader` はランダムアクセス
  を要求する。入力は一旦メモリにバッファしてから読む（stdin パイプにも対応するため）。
  出力側 `zip.Writer` は順次書き込みなので stdout へ直接流せる。
- ダウンスケールはアルファ加重のボックスフィルタ（純標準ライブラリ）。透過 PNG の
  アルファも保持する。
- JPEG/PNG は既に圧縮済みなので、再エンコード画像は `Store` で格納し二重圧縮を避ける。
- アニメーション GIF・EMF/WMF などのベクタは対象外（素通し）。
- 画像処理(デコード→縮小→再エンコード)は CPU バウンドなので、CPU 数ぶんの goroutine
  ワーカーで並列化する。zip の書き込みは順序が必要なため 1 本に保ち、「並列で縮小 →
  元の順序で書き出す」2 フェーズ構成。出力は逐次実行とバイト一致（決定的）。
