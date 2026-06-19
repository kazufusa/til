#!/usr/bin/env bash
# Benchmark: A (libreoffice+ghostscript) vs B (compactzip+libreoffice+ghostscript).
# Runs each pipeline RUNS times, reports the median total wall time, and checks
# that B is faster than A.
#   usage: bench.sh <input.pptx> [runs]
set -euo pipefail

IN="$1"; RUNS="${2:-5}"
DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v soffice >/dev/null && ! command -v libreoffice >/dev/null; then
  echo "ERROR: LibreOffice not found. Install with:" >&2
  echo "  sudo apt-get install -y libreoffice-impress" >&2
  exit 1
fi
command -v gs >/dev/null || { echo "ERROR: ghostscript (gs) not found" >&2; exit 1; }

median() { printf '%s\n' "$@" | sort -n | awk '{a[NR]=$1} END{print (NR%2)? a[(NR+1)/2] : (a[NR/2]+a[NR/2+1])/2}'; }
total_of() { sed -E 's/.*total=([0-9.]+)s.*/\1/'; }

echo "input: $IN ($(stat -c%s "$IN") bytes), runs=$RUNS"
echo

# Warm up LibreOffice (first launch initializes the user profile / caches).
echo "warming up LibreOffice..."
bash "$DIR/a_baseline.sh" "$IN" /tmp/_warm_a.pdf >/dev/null 2>&1 || true
bash "$DIR/b_compactzip.sh" "$IN" /tmp/_warm_b.pdf >/dev/null 2>&1 || true
echo

declare -a A_T B_T
for i in $(seq 1 "$RUNS"); do
  a=$(bash "$DIR/a_baseline.sh"  "$IN" "/tmp/out_a_$i.pdf"); echo "  run $i  $a"
  b=$(bash "$DIR/b_compactzip.sh" "$IN" "/tmp/out_b_$i.pdf"); echo "  run $i  $b"
  A_T+=("$(printf '%s' "$a" | total_of)")
  B_T+=("$(printf '%s' "$b" | total_of)")
done

MA=$(median "${A_T[@]}"); MB=$(median "${B_T[@]}")
SPEEDUP=$(awk "BEGIN{printf \"%.2f\", $MA/$MB}")
SIZE_A=$(stat -c%s "/tmp/out_a_1.pdf"); SIZE_B=$(stat -c%s "/tmp/out_b_1.pdf")

echo
echo "================ RESULT ================"
printf 'A (libreoffice+gs)            median total = %ss   pdf=%s bytes\n' "$MA" "$SIZE_A"
printf 'B (compactzip+libreoffice+gs) median total = %ss   pdf=%s bytes\n' "$MB" "$SIZE_B"
printf 'B is %sx faster than A\n' "$SPEEDUP"
awk "BEGIN{exit !($MB < $MA)}" && echo "PASS: B faster than A" || echo "FAIL: B not faster"
