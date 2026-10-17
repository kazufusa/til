#!/usr/bin/env bash
# terraform destroy の前に、Kubernetes 側が terraform 外のクラウド資源を持っていないか確認する。
# 使い方: scripts/preflight-destroy.sh [cluster-name]
set -euo pipefail

CLUSTER="${1:-eks-exp}"
ctx="$(kubectl config current-context)"
if [[ "$ctx" != *"cluster/${CLUSTER}"* ]]; then
  echo "current kubeconfig context is not ${CLUSTER}: ${ctx}" >&2
  echo "run: aws eks update-kubeconfig --name ${CLUSTER}" >&2
  exit 1
fi

lbs="$(kubectl get svc -A -o json | jq -r '.items[] | select(.spec.type=="LoadBalancer") | "\(.metadata.namespace)/\(.metadata.name)"')"
if [[ -n "$lbs" ]]; then
  echo "Service type=LoadBalancer exists. delete them before terraform destroy:" >&2
  echo "$lbs" >&2
  exit 1
fi

pvcs="$(kubectl get pvc -A -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name)"')"
if [[ -n "$pvcs" ]]; then
  echo "PersistentVolumeClaim exists. delete them before terraform destroy:" >&2
  echo "$pvcs" >&2
  exit 1
fi

echo "preflight ok: no LoadBalancer services, no PVCs"
