#!/usr/bin/env bash
# 残り PDF を逐次ダウンロード (UA 付与、タイムアウト長め).
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
