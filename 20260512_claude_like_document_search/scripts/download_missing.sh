#!/usr/bin/env bash
# ============================================================================
# download_missing.sh — download.sh で取れなかった PDF を逐次再取得する.
#
# download.sh との違い:
# - **逐次実行** (並列禁止). サーバ側のレート制限を踏まないため.
# - **ブラウザ風 User-Agent** を付与. 政府系サイトは default の curl UA で
#   弾いてくることがあるため.
# - タイムアウトを 300s に延長. 大型 PDF や応答が遅いサーバ向け.
# - リトライ 5 回 + connect-timeout 30s.
#
# それでも METI / chusho 等は完全に応答返さないことがある (本リポジトリで 11 件取得断念).
#
# usage: bash scripts/download_missing.sh missing_urls.tsv pdfs
# ============================================================================
set -u
TSV="${1:?usage: download_missing.sh urls.tsv out_dir}"
OUT="${2:?usage: download_missing.sh urls.tsv out_dir}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

while IFS=$'\t' read -r url name domain; do
    dest="$OUT/$name"
    if [[ -s "$dest" ]]; then
        echo "skip: $name"
        continue
    fi
    echo "fetch: $name"
    if curl -sL -A "$UA" --max-time 300 --retry 5 --retry-delay 3 --connect-timeout 30 -o "$dest" "$url"; then
        if [[ -s "$dest" ]]; then
            echo "  ok: $(wc -c < "$dest") bytes"
        else
            echo "  EMPTY"
            rm -f "$dest"
        fi
    else
        echo "  FAIL"
        rm -f "$dest"
    fi
done < "$TSV"
