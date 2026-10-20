#!/usr/bin/env bash
# マネージャーに渡す一式を bootstrap/rendered/<名前>/ に作る。
# 使い方: scripts/render-policy.sh <名前>
# 出力: setup-iam.sh、teardown-iam.sh(IAM を作る・消す台本)、attach-deployer-policy.sh、detach-deployer-policy.sh、
#       builder-policy.json、deployer-policy.json(権限 JSON)、
#       builder-policy.minimal.json(参考: 最小権限版)
#   台本と JSON の eks-exp を、すべて <名前> に置き換える。
set -euo pipefail

[[ $# -eq 1 ]] || { echo "usage: $0 <name>" >&2; exit 1; }
NAME="$1"
[[ "$NAME" =~ ^[a-z][a-z0-9-]*[a-z0-9]$ ]] || { echo "invalid name: $NAME" >&2; exit 1; }
BOOTSTRAP="$(cd "$(dirname "$0")/../bootstrap" && pwd)"
OUT="${BOOTSTRAP}/rendered/${NAME}"
mkdir -p "$OUT"

for f in setup-iam.sh teardown-iam.sh attach-deployer-policy.sh detach-deployer-policy.sh builder-policy.json builder-policy.minimal.json deployer-policy.json; do
  sed "s/eks-exp/${NAME}/g" "${BOOTSTRAP}/${f}" > "${OUT}/${f}"
done
chmod +x "${OUT}"/*.sh
ls -1 "$OUT" | sed "s|^|${OUT}/|"
