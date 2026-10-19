#!/usr/bin/env bash
# terraform を回すロール tf-builder を作る。マネージャーが管理者権限で実行する。
# 使い方: [PROJECT=<名前>] [VARIANT=standard|minimal] bootstrap/create-builder-role.sh <スイッチを許可する principal の ARN> [ARN...]
#   VARIANT=standard(既定): AWS 管理ポリシー 3 つ + tf-builder-policy.json
#   VARIANT=minimal        : 管理ポリシーを付けず tf-builder-policy.minimal.json だけ(最小権限版)
#   例: bootstrap/create-builder-role.sh arn:aws:iam::123456789012:role/aws-reserved/sso.amazonaws.com/ap-northeast-1/AWSReservedSSO_Foo_abc
# 2 回目以降は、ポリシーを新バージョンに更新し、信頼ポリシーを置き換える。
set -euo pipefail

[[ $# -ge 1 ]] || { echo "usage: $0 <principal-arn> [principal-arn...]" >&2; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT="${PROJECT:-eks-exp}"
VARIANT="${VARIANT:-standard}"
case "$VARIANT" in standard|minimal) ;; *) echo "VARIANT must be standard or minimal" >&2; exit 1;; esac
if [[ "$VARIANT" == "minimal" ]]; then JSON_NAME="tf-builder-policy.minimal.json"; else JSON_NAME="tf-builder-policy.json"; fi
ROLE="tf-builder"
POLICY="tf-builder-policy"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
# 既定の名前ならコミット済みの JSON、違う名前なら scripts/render-policy.sh の出力を使う
if [[ "$PROJECT" == "eks-exp" ]]; then
  POLICY_JSON="${DIR}/${JSON_NAME}"
else
  POLICY_JSON="${DIR}/rendered/${PROJECT}/${JSON_NAME}"
  [[ -f "$POLICY_JSON" ]] || { echo "run: scripts/render-policy.sh ${PROJECT}" >&2; exit 1; }
fi
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY}"

principals="$(printf '"%s",' "$@")"
trust="$(cat <<EOT
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":[${principals%,}]},"Action":"sts:AssumeRole"}]}
EOT
)"

if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  # カスタマー管理ポリシーはバージョンを 5 つまでしか持てないので、古い非既定版を 1 つ消してから足す
  n="$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" --query 'length(Versions)' --output text)"
  if [[ "$n" -ge 5 ]]; then
    old="$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
      --query 'Versions[?IsDefaultVersion==`false`] | sort_by(@, &CreateDate) | [0].VersionId' --output text)"
    aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$old"
  fi
  aws iam create-policy-version --policy-arn "$POLICY_ARN" \
    --policy-document "file://${POLICY_JSON}" --set-as-default >/dev/null
  echo "updated policy: $POLICY_ARN" >&2
else
  aws iam create-policy --policy-name "$POLICY" \
    --policy-document "file://${POLICY_JSON}" \
    --tags Key=Project,Value=eks-exp >/dev/null
  echo "created policy: $POLICY_ARN" >&2
fi

if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE" --policy-document "$trust"
  echo "updated trust policy: $ROLE" >&2
else
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document "$trust" \
    --description "Runs terraform/ for eks-exp" \
    --tags Key=Project,Value=eks-exp >/dev/null
  echo "created role: $ROLE" >&2
fi

managed_policies=(
  arn:aws:iam::aws:policy/AmazonVPCFullAccess
  arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess
  arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess
)
# standard は管理ポリシーを付け、minimal は付けない(付いていれば外す)。切り替えに対応するため両方向を扱う
for managed in "${managed_policies[@]}"; do
  if [[ "$VARIANT" == "standard" ]]; then
    aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$managed"
  else
    aws iam detach-role-policy --role-name "$ROLE" --policy-arn "$managed" 2>/dev/null || true
  fi
done
echo "variant: ${VARIANT}" >&2
aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$POLICY_ARN"
echo "arn:aws:iam::${ACCOUNT_ID}:role/${ROLE}"
