#!/usr/bin/env bash
# 権限 JSON 内の eks-exp を <PROJECT> に置き換え、bootstrap/rendered/<PROJECT>/ に出力する。
# 使い方: scripts/render-policy.sh <PROJECT>
set -euo pipefail

[[ $# -eq 1 ]] || { echo "usage: $0 <PROJECT>" >&2; exit 1; }
PROJECT="$1"
[[ "$PROJECT" =~ ^[a-z][a-z0-9-]*[a-z0-9]$ ]] || { echo "invalid PROJECT: $PROJECT" >&2; exit 1; }
BOOTSTRAP="$(cd "$(dirname "$0")/../bootstrap" && pwd)"
OUT="${BOOTSTRAP}/rendered/${PROJECT}"
mkdir -p "$OUT"

for f in tf-builder-policy.json tf-builder-policy.minimal.json; do
  sed "s/eks-exp/${PROJECT}/g" "${BOOTSTRAP}/${f}" > "${OUT}/${f}"
  echo "${OUT}/${f}"
done
