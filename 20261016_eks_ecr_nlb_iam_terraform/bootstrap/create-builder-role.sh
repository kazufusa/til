#!/usr/bin/env bash
# terraform を回すロール tf-builder を作る。マネージャーが管理者権限で実行する。
#
# 使い方: bootstrap/create-builder-role.sh <builder のログイン identity の ARN>
#
# やること(上から順に 3 つ)
#   1. 隣の tf-builder-policy.json からカスタマー管理ポリシー tf-builder-policy を作る
#   2. 引数の ARN からスイッチできるロール tf-builder を作る
#   3. ロールに AWS 管理ポリシー 3 つと tf-builder-policy を付ける
# 2 回目以降に実行すると、ポリシーの中身と信頼先を置き換える(作り直しはしない)。
set -euo pipefail

ROLE="tf-builder"
POLICY_NAME="tf-builder-policy"
POLICY_FILE="$(cd "$(dirname "$0")" && pwd)/tf-builder-policy.json"
MANAGED_POLICIES=(
  arn:aws:iam::aws:policy/AmazonVPCFullAccess
  arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess
  arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess
)

[[ $# -eq 1 ]] || { echo "usage: $0 <principal-arn>" >&2; exit 1; }
PRINCIPAL_ARN="$1"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"

# 1. ポリシー。既にあれば新しいバージョンに置き換える
ensure_policy() {
  if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
    for v in $(aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
        --query 'Versions[?IsDefaultVersion==`false`].VersionId' --output text); do
      aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$v"
    done
    aws iam create-policy-version --policy-arn "$POLICY_ARN" \
      --policy-document "file://${POLICY_FILE}" --set-as-default >/dev/null
    echo "updated policy: ${POLICY_NAME}" >&2
  else
    aws iam create-policy --policy-name "$POLICY_NAME" \
      --policy-document "file://${POLICY_FILE}" --tags Key=Project,Value=eks-exp >/dev/null
    echo "created policy: ${POLICY_NAME}" >&2
  fi
}

# 2. ロール。既にあれば信頼先だけ置き換える
ensure_role() {
  local trust
  trust="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"${PRINCIPAL_ARN}\"},\"Action\":\"sts:AssumeRole\"}]}"
  if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
    aws iam update-assume-role-policy --role-name "$ROLE" --policy-document "$trust"
    echo "updated trust policy: ${ROLE}" >&2
  else
    aws iam create-role --role-name "$ROLE" --assume-role-policy-document "$trust" \
      --description "Runs terraform for eks-exp" --tags Key=Project,Value=eks-exp >/dev/null
    echo "created role: ${ROLE}" >&2
  fi
}

# 3. 付ける(付いていれば何も起きない)
attach_policies() {
  for arn in "${MANAGED_POLICIES[@]}" "$POLICY_ARN"; do
    aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$arn"
  done
}

ensure_policy
ensure_role
attach_policies
echo "arn:aws:iam::${ACCOUNT_ID}:role/${ROLE}"
