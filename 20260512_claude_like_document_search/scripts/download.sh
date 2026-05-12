#!/usr/bin/env bash
# ============================================================================
# download.sh — urls.tsv の URL を並列で PDF としてダウンロード.
#
# urls.tsv の各行は <url>\t<file_name>\t<domain> 形式 (extract_urls.py が生成).
# 出力先ディレクトリ ($2) に <file_name> として保存. 既存ファイル (size > 0) はスキップ.
#
# 並列度 8 / curl のタイムアウト 120s / リトライ 3 回.
#
# 注意:
# - 一部の政府サイト (METI 系) は IP/UA フィルタで応答が遅い/拒否する.
#   その場合は download_missing.sh で UA を変えて逐次再取得を試す.
# - 拡張子 .pdf でもサーバが HTML エラーページを返すケースがある.
#   ダウンロード後に `file pdfs/*.pdf` で実体確認すると良い.
#
# usage: bash scripts/download.sh urls.tsv pdfs
# ============================================================================
set -u
TSV="${1:?usage: download.sh urls.tsv out_dir}"
OUT="${2:?usage: download.sh urls.tsv out_dir}"
mkdir -p "$OUT"

# 1 URL を取得する worker. xargs から並列に呼ばれる前提で stateless.
download_one() {
    local url="$1" name="$2" out="$3"
    local dest="$out/$name"
    # 既にダウンロード済み (空でないファイル) ならスキップ
    if [[ -s "$dest" ]]; then
        echo "skip: $name"
        return 0
    fi
    if curl -sL --max-time 120 --retry 3 --retry-delay 2 -o "$dest" "$url"; then
        if [[ -s "$dest" ]]; then
            echo "ok: $name ($(wc -c < "$dest") bytes)"
        else
            # 0 バイトのレスポンス. ゴミファイルを残さないように消す.
            echo "EMPTY: $name from $url"
            rm -f "$dest"
            return 1
        fi
    else
        # curl が non-zero で終了 (タイムアウトや接続失敗)
        echo "FAIL: $name from $url"
        rm -f "$dest"
        return 1
    fi
}
export -f download_one

# xargs -P 8 で 8 並列実行.
# bash 内で IFS=\t を作るため $'\t' を 2 段のクオートで埋め込んでいる (見栄え悪いが POSIX).
awk -F'\t' -v out="$OUT" '{printf "%s\t%s\t%s\n", $1, $2, out}' "$TSV" \
    | xargs -P 8 -I {} bash -c 'IFS=$'"'"'\t'"'"' read -r url name out <<< "$1"; download_one "$url" "$name" "$out"' _ {}
