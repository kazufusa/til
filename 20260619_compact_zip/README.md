# compactzip

zip / pptx / docx / xlsx を **全展開せず、エントリ単位で処理** して、内部の画像を
ダウンスケール＆再圧縮し、より軽い同形式のファイルに変換する Go コマンド。

（注: zip は目次＝中央ディレクトリが末尾にあるため、`archive/zip` は `io.ReaderAt`
によるランダムアクセスが必須で、前から順に読む forward ストリームにはできない。
本コマンドは全展開せずエントリ単位で処理し、出力は逐次書き出すが、入力読みは
ランダムアクセス。file 入力は `*os.File` を直接 `ReadAt` で読むのでメモリには載せない。）

ファイルを Office 文書として「開く」ことはせず、zip エントリの並びとして扱う:

- 画像でないエントリ … 既圧縮バイトをそのまま素通し（再圧縮なし、`CreateRaw`）
- 画像エントリ … デコード → 長辺を縮小 → **同じ形式で**再圧縮。
  **小さくなった場合だけ**差し替える（ならなければ元バイトを保持）
- 対応形式: **PNG / JPEG / GIF / BMP / TIFF**。アニメーション GIF とベクタ（EMF/WMF）は素通し

**ファイル名・画像形式・各エントリの中身は変えない**ので、`.rels` や
`[Content_Types].xml` の参照を書き換える必要がなく、元と同じ pptx/docx/xlsx として
安全に開ける。（PNG を JPEG に変換するような形式変更はしない: 劣化・透過喪失・参照
ずれの原因になるため。）

※ ただし**エントリの並び順は保たない**（画像は処理が終わった順に並ぶ。後述）。zip
リーダは名前で部品を引くので並び順は妥当性に影響しないが、先頭エントリだけは固定する
（EPUB/ODF が要求する `mimetype` 先頭ルールを壊さないため）。

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
（各形式の縮小・形式維持・エントリ集合と非画像バイトの保持・先頭エントリ固定・
アニメ GIF 素通し・透過保持・jobs 非依存の同一内容・in-place 上書き・downscale の
厳密値ほか）。

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

### メモリ

ピークメモリは **`同時実行数(jobs) × 画像1枚のビットマップ量`** でほぼ決まる
（入力サイズや画像枚数には依存しない）:

- file 入力は非バッファ（`ReadAt`）なので、入力サイズはヒープに乗らない。
- 圧縮済み画像は**書いた先から解放**するので溜め込まない（ストリーミング書き込み）。
- 1 枚のビットマップ量 ≈ `2.6 × (画像の W×H×4)`（デコード中間＋NRGBA＋GC 余裕。
  「画像サイズ」は**画素数 W×H** であってファイルサイズではない）。
  実測（4000×3000 = 12MP, `W×H×4`≈46MB）: jobs=1 → 148MB / jobs=2 → 257MB / jobs=4 → 410MB。

同時実行数は `jobs`（既定 `GOMAXPROCS`）で頭打ち。**Cloud Run / Lambda は vCPU をメモリに
比例配分**するので、`jobs`（=割当 vCPU）が割当メモリに自動追従する＝小メモリほど jobs も
小さくなり、既定のままピークが割当メモリに収まりやすい（512MB→jobs≈1→~150MB、
10GB→jobs≈6→~1GB）。`COMPACTZIP_JOBS` を手動で上げる時や極端に大きい画像を扱う時だけ、
メモリを意識して絞ればよい。

> メモリ上限からの自前 admission control（cgroup 値を読んで自己制御）は**やらない**:
> その上限はコンテナ全体で共有され他プロセスも消費するので「上限 ≠ 自分が使える量」。
> 実運用では上記のとおり jobs が割当メモリに追従するため、自前制御は不要と判断した。

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
| compactzip | – | ~1.6s |
| LibreOffice | ~22s | ~16s |
| ghostscript | ~3.3s | **~0.2s**（約16倍速） |
| **total** | **25.1s** | **17.8s** |
| 出力PDF | 2,672 KB | 915 KB |

→ **B は 1.41 倍速く、PDF も約 1/3**。効果は画像が多く高解像度なほど大きい
（小さいデッキは LibreOffice の固定起動コストが支配的で差は縮む。絶対値はマシン
負荷で変わるが、A:B の比は安定）。

再現スクリプトは `bench/`（`a_baseline.sh` / `b_compactzip.sh` / `bench.sh`）:

```sh
# 要 libreoffice-impress と ghostscript、先に go build しておく
bash bench/bench.sh <deck.pptx> 5
```

## フロー（呼び出しグラフ）

```
main()
 |
 |-- jobsFromEnv()                COMPACTZIP_JOBS or runtime.GOMAXPROCS(0)
 |
 `-- run(in, out, jobs)
       |-- input :  stdin -> io.ReadAll -> bytes.Reader   (not seekable: buffer)
       |            file  -> os.Open  (*os.File is io.ReaderAt; not loaded to heap)
       |-- output:  stdout -> direct      file -> temp file + os.Rename (atomic)
       |
       `-- compact(ra, size, jobs, out)
             |
             |  zip.NewReader(ra, size)            // central directory at EOF
             |
             |  writeProcessed(files[0])           // keep first entry in place
             |                                      //   (EPUB/ODF mimetype rule)
             |
             |  [ parallel ]  jobs workers, each:
             |      for f := range imageCh:
             |          shrinkImage(f):
             |              f.Open + io.ReadAll
             |              isAnimatedGIF? --yes--> result{nil}   (raw passthrough)
             |              image.Decode
             |              toNRGBA --> downscale (--> srcSpan)
             |              encodeImage (jpeg/png/gif/bmp/tiff)
             |          smaller? --yes--> result{bytes}  --no--> result{nil}
             |              |
             |          results chan ---------------------------------+
             |                                                         |
             |  [ single writer = this goroutine ]                    v
             |      for r := range results:          // COMPLETION order
             |          writeEntry(zw, r.f, r.data)   //   write + free each
             |      then non-image entries:           // input order
             |          writeEntry(zw, f, nil)
             |      zw.Close()

writeEntry(zw, f, data):
    directory    --> CreateHeader
    data != nil  --> CreateHeader(Store) + Write      (shrunk image)
    else         --> copyRaw (OpenRaw -> CreateRaw)    (raw passthrough)
```

1 エントリあたりのデータフロー:

```
image (png/jpeg/gif/bmp/tiff):
    decode -> toNRGBA -> downscale(longest edge <= 800px) -> re-encode(same fmt) -> smaller?
                                                                      |-- yes --> replace
                                                                      `-- no  --> keep original
non-image / animated GIF / vector (emf, wmf):
    copy raw bytes  (no decompress, no recompress)
```

## 設計メモ

- zip の中央ディレクトリは末尾にあるため、`archive/zip.Reader` はランダムアクセス
  （`io.ReaderAt`）を要求する。**file 入力は `*os.File` をそのまま渡し**、内容を
  メモリに載せずに `ReadAt` で読む（OS のページキャッシュ任せ）。seek 不可な stdin
  のときだけバッファする。
- file 出力は一時ファイルへ書いて最後に atomic rename する。エラー時に中途半端な
  出力を残さず、`in == out`（同一ファイル上書き）も安全（読み切ってから置換する）。
- ダウンスケールはアルファ加重のボックスフィルタ（純標準ライブラリ）。透過 PNG の
  アルファも保持する。
- 画像は既に圧縮済みなので、再エンコード画像は `Store` で格納し二重圧縮を避ける。
- アニメーション GIF・EMF/WMF などのベクタは対象外（素通し）。

### 並列圧縮 + 単一ライタ（ストリーミング書き込み）

- 画像処理（デコード→縮小→再エンコード）は CPU バウンドなので **`jobs` 並列**。
  一方 zip は1本のシーケンシャルなバイト列で、各エントリのオフセットを積算しながら
  順に書き、最後に中央ディレクトリを置く形式なので、**書き込みは単一ライタに集約**せざ
  るを得ない（並列書き込み不可）。
- ワーカーが縮小し終えた画像を `results` チャネル経由で単一ライタへ渡し、ライタは
  **完了順に書いて即解放**する。これにより保持メモリは **~`jobs` 個ぶんに有界**。
  全結果を溜めてから書く方式（barrier）だと、**あまり縮まない画像が大量にあるデッキ**
  で保持量が画像ペイロード総量（≒デッキサイズ）まで膨らむが、それを避けられる。
  - 縮まなかった画像は結果を持たず `copyRaw`（大きいバッファを抱えない）。
- 画像エントリは**完了順**に並ぶ（zip は名前で引くので valid）。**先頭エントリは固定**
  し、EPUB/ODF の「`mimetype` を先頭・無圧縮で置く」規約を守る。非画像・ディレクトリは
  画像の後ろに入力順で書く。
- トレードオフ: 出力は完了順なので **バイト単位では非決定的**（毎回・jobs 数で並びが
  変わりうる）。ただし**エントリ集合と各エントリの中身は不変**で、文書としては同一。
