#!/usr/bin/env bash
# Approach B (with this product): pptx --(compactzip)--> small pptx --(LibreOffice)--> pdf --(ghostscript)--> compressed pdf
# The image downscaling up front means LibreOffice imports/renders far less pixel
# data and ghostscript has much smaller images to recompress, so the LibreOffice
# and ghostscript stages get cheaper — outweighing compactzip's tiny cost.
#   usage: b_compactzip.sh <input.pptx> <output.pdf> [profile_dir]
set -euo pipefail

IN="$1"; OUT="$2"; PROFILE="${3:-/tmp/lo_profile_b}"
SOFFICE="$(command -v soffice || command -v libreoffice)"
COMPACTZIP="${COMPACTZIP:-$(dirname "$0")/../compactzip}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

now() { date +%s.%N; }
el()  { awk "BEGIN{printf \"%.2f\", $2-$1}"; }

SMALL="$WORK/small.pptx"

# 1) compactzip: shrink the images inside the pptx (keeps it a valid pptx)
t0=$(now)
"$COMPACTZIP" "$IN" "$SMALL"
t1=$(now)

# 2) LibreOffice: small pptx -> pdf
"$SOFFICE" --headless --norestore --convert-to pdf --outdir "$WORK" \
  -env:UserInstallation="file://$PROFILE" "$SMALL" >/dev/null 2>&1
t2=$(now)
PDF="$WORK/small.pdf"

# 3) ghostscript: compress pdf
gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.5 -dPDFSETTINGS=/ebook \
   -dDownsampleColorImages=true -dColorImageResolution=150 \
   -dNOPAUSE -dQUIET -dBATCH -sOutputFile="$OUT" "$PDF"
t3=$(now)

printf 'B  compactzip=%ss  libreoffice=%ss  ghostscript=%ss  total=%ss  out=%s bytes\n' \
  "$(el "$t0" "$t1")" "$(el "$t1" "$t2")" "$(el "$t2" "$t3")" "$(el "$t0" "$t3")" "$(stat -c%s "$OUT")"
