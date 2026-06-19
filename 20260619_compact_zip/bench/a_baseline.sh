#!/usr/bin/env bash
# Approach A (baseline): pptx --(LibreOffice headless)--> pdf --(ghostscript)--> compressed pdf
#   usage: a_baseline.sh <input.pptx> <output.pdf> [profile_dir]
set -euo pipefail

IN="$1"; OUT="$2"; PROFILE="${3:-/tmp/lo_profile_a}"
SOFFICE="$(command -v soffice || command -v libreoffice)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

now() { date +%s.%N; }
el()  { awk "BEGIN{printf \"%.2f\", $2-$1}"; }

# 1) LibreOffice: pptx -> pdf  (isolated profile so timing is steady-state)
t0=$(now)
"$SOFFICE" --headless --norestore --convert-to pdf --outdir "$WORK" \
  -env:UserInstallation="file://$PROFILE" "$IN" >/dev/null 2>&1
t1=$(now)
PDF="$WORK/$(basename "${IN%.*}").pdf"

# 2) ghostscript: compress pdf
gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.5 -dPDFSETTINGS=/ebook \
   -dDownsampleColorImages=true -dColorImageResolution=150 \
   -dNOPAUSE -dQUIET -dBATCH -sOutputFile="$OUT" "$PDF"
t2=$(now)

printf 'A  libreoffice=%ss  ghostscript=%ss  total=%ss  out=%s bytes\n' \
  "$(el "$t0" "$t1")" "$(el "$t1" "$t2")" "$(el "$t0" "$t2")" "$(stat -c%s "$OUT")"
