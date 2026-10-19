#!/usr/bin/env bash
# attach-builder-policy.sh で付けた 4 つを外し、自作ポリシー tf-builder-policy を消す。
# 使い方: bootstrap/detach-builder-policy.sh <ロール名>
set -Ceuo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 <role-name>" >&2; exit 1; }
ROLE="$1"
set -x
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/tf-builder-policy"

aws iam detach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonVPCFullAccess
aws iam detach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess
aws iam detach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess
aws iam detach-role-policy --role-name "$ROLE" --policy-arn "$POLICY_ARN"
aws iam delete-policy --policy-arn "$POLICY_ARN"
