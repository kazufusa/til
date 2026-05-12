#!/usr/bin/env bash
# 並列で PDF をダウンロードする (8 並列, タイムアウト 60s, リトライ 3 回).
set -u
TSV="${1:?usage: download.sh urls.tsv out_dir}"
OUT="${2:?usage: download.sh urls.tsv out_dir}"
mkdir -p "$OUT"

download_one() {
    local url="$1" name="$2" out="$3"
    local dest="$out/$name"
    if [[ -s "$dest" ]]; then
        echo "skip: $name"
        return 0
    fi
    if curl -sL --max-time 120 --retry 3 --retry-delay 2 -o "$dest" "$url"; then
        if [[ -s "$dest" ]]; then
            echo "ok: $name ($(wc -c < "$dest") bytes)"
        else
            echo "EMPTY: $name from $url"
            rm -f "$dest"
            return 1
        fi
    else
        echo "FAIL: $name from $url"
        rm -f "$dest"
        return 1
    fi
}
export -f download_one

# xargs で 8 並列
awk -F'\t' -v out="$OUT" '{printf "%s\t%s\t%s\n", $1, $2, out}' "$TSV" \
    | xargs -P 8 -I {} bash -c 'IFS=$'"'"'\t'"'"' read -r url name out <<< "$1"; download_one "$url" "$name" "$out"' _ {}
