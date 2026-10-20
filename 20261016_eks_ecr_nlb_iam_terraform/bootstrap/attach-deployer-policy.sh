#!/usr/bin/env bash
# アプリ開発者の個人ロールに、デプロイ用のポリシーを付ける。マネージャーが管理者権限で実行する。
# 開発者が増えるたびに 1 回。setup-iam.sh のあとに使う。
# 使い方: [PROJECT=<名前>] bootstrap/attach-deployer-policy.sh <開発者の個人ロール名>
#   例: bootstrap/attach-deployer-policy.sh cli-fl-hanako.sato
# 外すときは bootstrap/detach-deployer-policy.sh <開発者の個人ロール名>
set -Ceuo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 <developer-personal-role-name>" >&2; exit 1; }
PROJECT="${PROJECT:-eks-exp}"
set -x
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws iam attach-role-policy --role-name "$1" --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${PROJECT}-deployer-policy"
