#!/usr/bin/env bash
# terraform を回すロール tf-builder を作る。マネージャーが管理者権限で実行する。
# 使い方: bootstrap/create-builder-role.sh <スイッチを許可する principal の ARN> [ARN...]
#   例: bootstrap/create-builder-role.sh arn:aws:iam::123456789012:role/aws-reserved/sso.amazonaws.com/ap-northeast-1/AWSReservedSSO_Foo_abc
# 2 回目以降は、ポリシーを新バージョンに更新し、信頼ポリシーを置き換える。
set -euo pipefail

[[ $# -ge 1 ]] || { echo "usage: $0 <principal-arn> [principal-arn...]" >&2; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
ROLE="tf-builder"
POLICY="tf-builder-policy"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
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
    --policy-document "file://${DIR}/tf-builder-policy.json" --set-as-default >/dev/null
  echo "updated policy: $POLICY_ARN" >&2
else
  aws iam create-policy --policy-name "$POLICY" \
    --policy-document "file://${DIR}/tf-builder-policy.json" \
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

for managed in \
  arn:aws:iam::aws:policy/AmazonVPCFullAccess \
  arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess \
  arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess; do
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$managed"
done
aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$POLICY_ARN"
echo "arn:aws:iam::${ACCOUNT_ID}:role/${ROLE}"
