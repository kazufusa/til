#!/usr/bin/env bash
# 既存のロールに、terraform を回す権限を付ける。マネージャーが管理者権限で実行する。
# 使い方: bootstrap/attach-builder-policy.sh <ロール名>
#   例: bootstrap/attach-builder-policy.sh cli-fl-taro.yamada
# 外すときは bootstrap/detach-builder-policy.sh <ロール名>
set -Ceuo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 <role-name>" >&2; exit 1; }
cd "$(dirname "$0")"
set -x
ROLE="$1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/tf-builder-policy"

# 1. 自作ポリシーを作る(tf-builder-policy.json)。すでにあればそのまま使う
aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1 \
  || aws iam create-policy --policy-name tf-builder-policy --policy-document file://tf-builder-policy.json >/dev/null

# 2. ロールにポリシーを 4 つ付ける。ロールの権限 = AWS 管理 3 つ + 自作 1 つの合計
aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonVPCFullAccess
aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess
aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess
aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$POLICY_ARN"
