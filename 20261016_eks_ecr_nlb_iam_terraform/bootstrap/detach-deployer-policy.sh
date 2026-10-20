#!/usr/bin/env bash
# attach-deployer-policy.sh で付けたポリシーを外す。マネージャーが管理者権限で実行する。
# 使い方: [PROJECT=<名前>] bootstrap/detach-deployer-policy.sh <開発者の個人ロール名>
set -Ceuo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 <developer-personal-role-name>" >&2; exit 1; }
PROJECT="${PROJECT:-eks-exp}"
set -x
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws iam detach-role-policy --role-name "$1" --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${PROJECT}-deployer-policy"
