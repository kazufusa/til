#!/usr/bin/env bash
# terraform を回すロール tf-builder を作る。マネージャーが管理者権限で実行する。
# 使い方: bootstrap/create-builder-role.sh <builder のログイン identity の ARN>
# やり直すときは、先に bootstrap/delete-builder-role.sh で消す。
set -Ceuxo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 <principal-arn>" >&2; exit 1; }
cd "$(dirname "$0")"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# 1. 何ができるか(tf-builder-policy.json)をポリシーにする
aws iam create-policy --policy-name tf-builder-policy --policy-document file://tf-builder-policy.json >/dev/null

# 2. 誰がスイッチできるか(引数の ARN)を書いたロールを作る
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"'"$1"'"},"Action":"sts:AssumeRole"}]}'
aws iam create-role --role-name tf-builder --assume-role-policy-document "$TRUST" >/dev/null

# 3. ロールにポリシーを付ける(AWS 管理 3 つ + 上の 1 つ)
aws iam attach-role-policy --role-name tf-builder --policy-arn arn:aws:iam::aws:policy/AmazonVPCFullAccess
aws iam attach-role-policy --role-name tf-builder --policy-arn arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess
aws iam attach-role-policy --role-name tf-builder --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess
aws iam attach-role-policy --role-name tf-builder --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/tf-builder-policy"

echo "arn:aws:iam::${ACCOUNT_ID}:role/tf-builder"
