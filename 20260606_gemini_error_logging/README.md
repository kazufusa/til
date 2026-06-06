# Gemini エラーレスポンスのログ出力 (bun + Vercel AI SDK + effect.ts)

Vercel AI SDK (`ai` + `@ai-sdk/google-vertex`) 経由で **Vertex AI (GCP)** の
Gemini を呼び、**サポート対象外のでかすぎる画像** を inline で送りつけて
返ってくるエラーレスポンスを effect.ts で捕まえてログ出力する実験。

API キーではなく **GCP の Project ID** を env で渡し、認証は ADC に委ねる。

## 仕組み

- `createVertex({ project, location })` で Vertex プロバイダを作って呼ぶ。
- 失敗を `Effect.tryPromise` で捕捉し、`classify()` で **エラー種別ごとの
  タグ付きエラー** (`Data.TaggedError`) に振り分け、`Effect.catchTags` +
  `Effect.logError` / `Effect.annotateLogs` で構造化ログ出力する。

## エラーの種別と区別

| タグ | 何のエラーか | 判定方法 |
| --- | --- | --- |
| `OutputSchemaError` | **出力(スキーマ)を守れない**。HTTP は 200 成功なのに JSON/型が不正 | `NoObjectGeneratedError.isInstance()` |
| `PayloadTooLargeError` | **サイズ超過** | `APICallError` かつ `statusCode===413` または本文が size 超過パターン |
| `ApiError` | その他の API エラー(画像不正・認証・レート等) | 上記以外の `APICallError` |
| `UnknownError` | HTTP に出る前の失敗(ADC 不在など) | それ以外 |

- **①「出力を守れない」 vs ②「サイズ超過」はクラスレベルでキレイに割れる**
  (`NoObjectGeneratedError` は HTTP 成功、`APICallError` は 4xx/5xx)。
- ただし Gemini は **400 系を全部 `INVALID_ARGUMENT` に潰す**ので、
  サイズ超過と画像不正は `statusCode` だけでは割れず、`responseBody`/`message`
  の文字列(`exceeds the limit` 等)か HTTP 413 で見分けるしかない。

## リトライ可否の仕分け

`isRetryable` は **HTTP ステータスコードから機械的に決まる**。Google
プロバイダは独自の判定を渡さないので、`APICallError` コンストラクタの既定式が
そのまま効く(`@ai-sdk/provider`):

```js
isRetryable = statusCode != null &&
  (statusCode === 408 || statusCode === 409 ||
   statusCode === 429 || statusCode >= 500);
```

| 種別 | `isRetryable` | 例 | 対応 |
| --- | --- | --- | --- |
| `APICallError` 408/409/429/**5xx** | `true` | レート制限・サーバ障害・タイムアウト | バックオフでリトライ |
| ネットワーク接続失敗 (fetch failed) | `true` | API に繋がらない | 同上(明示的に true) |
| `APICallError` **その他の 4xx** (400/401/403/404/413) | `false` | 画像不正・PDF ページ超過・サイズ超過・認証 | リトライ無駄。リクエストを直す |
| `NoObjectGeneratedError` (HTTP 200) | — | スキーマ違反 | 別物。再生成で直るかはアプリ判断 |

- **SDK が先にリトライ済み**: `generateText` は `isRetryable===true` を
  `maxRetries`(既定 2)まで指数バックオフで自動リトライしてから投げる。
  つまり catch に届いた `retryable:true` は「2 回試して無理だった」もの。
- **この実験のエラーが全部 `retryable=false` な理由**: 引いたのが全部
  **400(クライアントエラー)**だから。`true` を見るには 429 か 5xx が要る。
- 実用上は **`if (e.isRetryable) リトライ; else リクエストを直す`** の一本で済む。
  `PayloadTooLargeError` / `OutputSchemaError` は本質的に常に non-retryable。

### 唯一の穴 = スキーマ違反の再生成は自前(実装済み)

`NoObjectGeneratedError`(= `OutputSchemaError`)は HTTP 200 成功なので
SDK の自動リトライ対象外。ただしモデルの出力ブレなので**再生成すれば直る
見込みがある**。そこで `MODE=object` の `callObject` にだけ、Effect で
**スキーマ違反のときのみ**最大 `SCHEMA_RETRIES`(既定 3)回まで再生成する
リトライを実装した:

```ts
callObjectOnce().pipe(
  Effect.tapError((e) =>
    e._tag === "OutputSchemaError"
      ? Effect.logWarning("schema violation — 再生成リトライします")
      : Effect.void,
  ),
  Effect.retry({
    while: (e) => e._tag === "OutputSchemaError", // スキーマ違反だけ
    times: SCHEMA_RETRIES,
  }),
)
```

`while` で **`OutputSchemaError` 以外(ApiError 等)は即 fail** にしているので、
SDK の内蔵リトライと二重がけにならない。挙動はユニットテストで検証済み
(2回違反→3回目成功 / 連続違反→4試行で諦め / ApiError→1試行で即 fail)。

## モード (`MODE` env)

| MODE | 送るもの | 結果 |
| --- | --- | --- |
| `text` (既定) | ゼロ埋めの壊れた大画像 (`IMAGE_SIZE_MB`) | `ApiError`(画像不正) |
| `size` | **有効な大 PNG** (`node:zlib` + 暗号乱数で生成, `IMAGE_SIZE_MB`) | `PayloadTooLargeError`(エンドポイントが上限を持てば) |
| `file` | **実ファイルの意味のある画像** (`IMAGE_PATH`) | 通常応答(画像の説明) |
| `bigfile` | **意味のある実画像を巨大化** (`IMAGE_PATH` + `IMAGE_SIZE_MB`) | 通常応答(巨大でも内容を説明) |
| `pdf` | **多ページ PDF** を手組みして送る (`PAGES`) | ページ数 ≤1000 は理解 / >1000 は 400 エラー |
| `object` | `generateObject` でスキーマ出力を要求 | `OutputSchemaError`(モデルが守れなければ) |

### `MODE=file`: 意味のある画像を送る

`IMAGE_PATH` で実画像を指定(拡張子から mediaType を自動判定)。既定は
リポジトリ内の実データ可視化チャート
(`20170724_pro_shogi_bayes_2/rating-skill.png`, 将棋棋士のレーティング散布図)。

```sh
MODE=file bun run start
# 別の画像を送る場合
MODE=file IMAGE_PATH=/path/to/photo.jpg bun run start
```

Gemini はこのチャートの**軸ラベル・棋士名・信頼区間・出典 URL** まで
読み取って説明する(ノイズ画像の「砂嵐です」とは別物の応答が得られる)。

### `MODE=bigfile`: 意味のある画像を巨大化して送る

「意味のある画像」と「巨大バイト数」を両立させるモード。意味のある画像は
よく圧縮されるため、単に拡大しても PNG バイトは小さいまま。そこで:

1. 元 PNG を**自前デコード**(`inflate` + フィルタ 0-4 復元, colortype 0/2/4/6)。
2. 目標バイト数になるよう**最近傍で拡大**(`IMAGE_SIZE_MB` から拡大率を算出)。
3. **無圧縮 (`deflate level 0`)** で再エンコード → 実バイト ≈ 画素数。

中身は本物の画像のまま、実バイトだけ巨大化できる(検証は `file` /
Python stdlib CRC+inflate / Pillow 厳密デコードで実施済み)。

#### 用意したプリセット(実機で内容説明を確認済み)

```sh
# 将棋レーティング散布図 3000x1000 → 4434x1478 / 25MB
MODE=bigfile IMAGE_SIZE_MB=25 \
  IMAGE_PATH=../20170724_pro_shogi_bayes_2/rating-skill.png bun run start

# 上位10棋士チャート 2000x1000 → 5609x2804 / 63MB
MODE=bigfile IMAGE_SIZE_MB=60 \
  IMAGE_PATH=../20170724_pro_shogi_bayes_2/top10.png bun run start

# 桧原村 土地被覆マップ 802x448 → 4333x2420 / 42MB
MODE=bigfile IMAGE_SIZE_MB=40 \
  IMAGE_PATH=../20170925_postgis_raster_intersection/hinoharamura.png bun run start
```

`DUMP=/path/out.png` を付けると API に送らず巨大化 PNG をファイルに書き出して
終了する(生成物の検証用)。Vertex は 25/40/63MB いずれも受理し、巨大化後も
チャートの軸・凡例・座標などを正しく説明した。

### 有効な大 PNG の作り方 (`makeValidPng`)

依存なしで正規 PNG を組み立てる:

- `IHDR`(RGB/8bit) + `IDAT`(全行 filter=None の生スキャンラインを `deflateSync`)
  + `IEND`、各チャンクに自前の **CRC32** を付与。
- 画素は **`crypto.getRandomValues` のノイズ**で埋める。これで deflate が
  縮められず、出力 PNG の実バイト数 ≈ `IMAGE_SIZE_MB` を確保できる
  (規則的な擬似乱数だと圧縮されてサイズが出ない)。
- 生成物は `file` / Python stdlib (CRC + IDAT 展開) / Pillow の厳密デコードで
  検証済み。

### `MODE=pdf`: 画像と PDF は「効く制約の軸」が違う

PDF は手組み(依存無し, `PAGES` ページ)。画像と違い PDF は **1 ページずつ
画像化+OCR** されるので、**ページ数**で頭打ちになる。

```sh
MODE=pdf PAGES=5    bun run start   # 理解できる
MODE=pdf PAGES=1500 bun run start   # 400 エラー
```

実測(本番 Vertex, `gemini-3.1-flash-lite`):

| 入力 | バイト | 結果 |
| --- | --- | --- |
| PDF 5 ページ | 0.004MB | ✅ 内容を説明 |
| **PDF 1500 ページ** | **0.40MB** | ❌ `400 INVALID_ARGUMENT`<br>`"The document contains 1500 pages which exceeds the supported page limit of 1000."` |
| 画像 (noise/meaningful) | ~150MB | ✅ 受理 |

**失敗した PDF はわずか 0.40MB** — バイトではなく **ページ数 (>1000)** で弾かれた。
画像が 150MB でも通るのと対照的。効いている制約が違う:

- **画像** = サーバ側ダウンサンプルで固定トークン化 → バイト数はほぼ無関係。
- **PDF** = ページごとに処理 → **1000 ページのハード上限**(Gemini 自身が
  エラーメッセージで明言)。ファイルサイズと無関係にページ数で落ちる。

> このエラーは `code:400, INVALID_ARGUMENT` なので `classify()` では
> `ApiError` に乗るが、メッセージが `page limit` を明示するので
> サイズ超過とは本文で区別できる。

### ⚠ 実測メモ: 「20MB 上限」はモデルではなくエンドポイントの話

`MODE=size`(ノイズ)で 25/60/150MB、`MODE=bigfile`(意味のある画像)で
25/40/63MB を投げたが、**Vertex はいずれも受理して内容を説明した**
(`gemini-3.1-flash-lite`, `location=global`)。

つまり、よく言われる **「Gemini の inline 20MB 上限」は
`gemini-3.1-flash-lite` というモデルの上限ではなく、AI Studio
(Gemini Developer API / `generativelanguage`)エンドポイントの
リクエストサイズ制限**。`@ai-sdk/google-vertex`(Vertex AI)で叩くと
この 20MB 制限には当たらず、もっと大きな画像が通る。当初「Gemini の
inline 上限 ~20MB」と書いていたのはエンドポイントを取り違えた表現だった。

さらに **Gemini は画像をサーバ側でダウンサンプル/タイル化**して
固定トークン量で処理する。だから 63MB に拡大しても情報量は元画像と同じで、
内容説明も変わらない(= バイト数 ≠ 実際に使われる解像度)。

- **サイズ超過(413 / payload exceeds)を確実に出したいなら** API キー +
  `@ai-sdk/google`(AI Studio エンドポイント)を使う。こちらは 20MB を
  enforce する。Vertex では現実的サイズで `PayloadTooLargeError` を引けない。
- `classify()` の振り分け自体は正しく、413 や size 超過本文が返れば
  `PayloadTooLargeError` に乗る(コードとしては検証済み)。
- modern Gemini は大抵スキーマを守るので `OutputSchemaError` も出にくい。
  分類コード自体はどのエラーでも正しく振り分ける。

## セットアップ

```sh
bun install
cp .env.example .env   # GOOGLE_VERTEX_PROJECT / GOOGLE_VERTEX_LOCATION を設定

# 認証 (ADC) はどちらか
gcloud auth application-default login
# もしくは GOOGLE_APPLICATION_CREDENTIALS にサービスアカウント鍵を指す

bun run start
```

## env

| 変数 | 既定 | 説明 |
| --- | --- | --- |
| `GOOGLE_VERTEX_PROJECT` | (必須) | GCP の Project ID |
| `GOOGLE_VERTEX_LOCATION` | `us-central1` | Vertex のリージョン。gemini 3.x は `global` が要る場合あり |
| `GOOGLE_APPLICATION_CREDENTIALS` | (任意) | サービスアカウント鍵のパス。未指定なら gcloud ADC |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | 使うモデル ID |
| `IMAGE_SIZE_MB` | `25` | 合成画像のサイズ。下げて上限内に収めると正常応答も確認できる |
| `MODE` | `text` | `text`/`size`/`file`/`object` を切替(下の表参照) |
| `IMAGE_PATH` | リポジトリの将棋チャート | `MODE=file`/`bigfile` で送る実画像のパス |
| `PAGES` | `1500` | `MODE=pdf` のページ数(>1000 で 400 エラー) |
| `SCHEMA_RETRIES` | `3` | `MODE=object` のスキーマ違反時の再生成リトライ回数 |

## 出力イメージ

```
timestamp=... level=INFO  message="setup: project=my-proj location=global model=gemini-3.1-flash-lite / 合成画像=25MB"
timestamp=... level=ERROR message="Gemini API error" status=400 url=https://aiplatform.googleapis.com/... retryable=false message="Provided image is not valid." responseBody="{ \"error\": { \"code\": 400, ... } }"
```

## メモ

- スタックは AI SDK **v5** 系で統一 (`ai@5` + `@ai-sdk/google-vertex@3` は
  どちらも `@ai-sdk/provider@2`)。v6 と vertex@4 の組み合わせは
  クールダウン (公開7日) に引っかかるため避けた。
- パッケージは公開から7日以上経った版に固定 (ローカル `bunfig.toml` の
  `minimumReleaseAge` + グローバル設定)。
- ADC が無い / Project が無効など、HTTP に出る前の失敗は `APICallError` では
  なく `UnknownError` 経路でログされる。
