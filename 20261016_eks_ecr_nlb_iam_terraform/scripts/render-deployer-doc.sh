#!/usr/bin/env bash
# terraform output から、値の埋まった docs/deployer.md を生成する。
# 使い方: scripts/render-deployer-doc.sh [terraform-dir] [out-file]
#         scripts/render-deployer-doc.sh --from-json <outputs.json> [out-file]
# --from-json は terraform output -json 相当の JSON を読む(テスト用)。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="${ROOT}/docs/deployer.md.tmpl"

if [[ "${1:-}" == "--from-json" ]]; then
  [[ $# -ge 2 ]] || { echo "usage: $0 --from-json <outputs.json> [out-file]" >&2; exit 1; }
  json="$(cat "$2")"
  out="${3:-${ROOT}/docs/deployer.md}"
else
  tfdir="${1:-${ROOT}/terraform}"
  out="${2:-${ROOT}/docs/deployer.md}"
  json="$(terraform -chdir="$tfdir" output -json)"
fi

get() { jq -er "$1" <<<"$json"; }
esc() { printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'; }

role_arn="$(get .deployer_role_arn.value)"
cluster="$(get .cluster_name.value)"
region="$(get .region.value)"
ecr="$(get .ecr_repository_url.value)"
ns="$(get '.deployer_namespaces.value[0]')"
port="$(get .node_port.value)"
nlb="$(get .nlb_dns_name.value)"
nat="$(get .nat_public_ip.value)"
https="$(get .https_url.value)"

sed \
  -e "s|{{DEPLOYER_ROLE_ARN}}|$(esc "$role_arn")|g" \
  -e "s|{{CLUSTER_NAME}}|$(esc "$cluster")|g" \
  -e "s|{{REGION}}|$(esc "$region")|g" \
  -e "s|{{ECR_REPOSITORY_URL}}|$(esc "$ecr")|g" \
  -e "s|{{NAMESPACE}}|$(esc "$ns")|g" \
  -e "s|{{NODE_PORT}}|$(esc "$port")|g" \
  -e "s|{{NLB_DNS_NAME}}|$(esc "$nlb")|g" \
  -e "s|{{NAT_PUBLIC_IP}}|$(esc "$nat")|g" \
  -e "s|{{HTTPS_URL}}|$(esc "$https")|g" \
  "$TEMPLATE" >"$out"

echo "$out"
