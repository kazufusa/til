#!/usr/bin/env bash
# マネージャーに渡す一式を bootstrap/rendered/<名前>/ に作る。
# 使い方: scripts/render-policy.sh <名前>
#   名前が eks-exp 以外なら、権限 JSON 内の eks-exp を <名前> に置き換える。
# 出力: create-builder-role.sh、delete-builder-role.sh、tf-builder-policy.json(申請用)、
#       tf-builder-policy.minimal.json(参考: 最小権限版)
set -euo pipefail

[[ $# -eq 1 ]] || { echo "usage: $0 <name>" >&2; exit 1; }
NAME="$1"
[[ "$NAME" =~ ^[a-z][a-z0-9-]*[a-z0-9]$ ]] || { echo "invalid name: $NAME" >&2; exit 1; }
BOOTSTRAP="$(cd "$(dirname "$0")/../bootstrap" && pwd)"
OUT="${BOOTSTRAP}/rendered/${NAME}"
mkdir -p "$OUT"

cp "${BOOTSTRAP}/create-builder-role.sh" "${BOOTSTRAP}/delete-builder-role.sh" "$OUT/"
for f in tf-builder-policy.json tf-builder-policy.minimal.json; do
  sed "s/eks-exp/${NAME}/g" "${BOOTSTRAP}/${f}" > "${OUT}/${f}"
done
ls -1 "$OUT" | sed "s|^|${OUT}/|"
