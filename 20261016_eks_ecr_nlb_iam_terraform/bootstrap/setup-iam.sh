#!/usr/bin/env bash
# IAM をすべて作る。マネージャーが管理者権限で 1 回だけ実行する。
# 作業者は IAM を作れないので、ロールとポリシーはここで揃える。terraform はロールとポリシーを名前で参照するだけ。
# アプリ開発者の個人ロールには、別途 attach-deployer-policy.sh で <名前>-deployer-policy を付ける。
# 使い方: [PROJECT=<名前>] bootstrap/setup-iam.sh <作業者の個人ロール名>
#   例: bootstrap/setup-iam.sh cli-fl-taro.yamada
# 消すときは bootstrap/teardown-iam.sh <作業者の個人ロール名>
set -Ceuo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 <builder-personal-role-name>" >&2; exit 1; }
cd "$(dirname "$0")"
PROJECT="${PROJECT:-eks-exp}"
PERSONAL_ROLE="$1"
set -x
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
POLICY_PREFIX="arn:aws:iam::${ACCOUNT_ID}:policy"
TAG="Key=Project,Value=${PROJECT}"
EKS_TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"eks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
EC2_TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

# 1. 自作ポリシーを 2 つ作る(作業者用と、アプリ開発者用)
aws iam create-policy --policy-name "${PROJECT}-builder-policy" --policy-document file://builder-policy.json --tags "$TAG" >/dev/null
aws iam create-policy --policy-name "${PROJECT}-deployer-policy" --policy-document file://deployer-policy.json --tags "$TAG" >/dev/null

# 2. EKS クラスタ用ロール(EKS が引き受ける)
aws iam create-role --role-name "${PROJECT}-cluster" --assume-role-policy-document "$EKS_TRUST" --tags "$TAG" >/dev/null
aws iam attach-role-policy --role-name "${PROJECT}-cluster" --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy

# 3. ノード用ロール(EC2 が引き受ける)
aws iam create-role --role-name "${PROJECT}-node" --assume-role-policy-document "$EC2_TRUST" --tags "$TAG" >/dev/null
aws iam attach-role-policy --role-name "${PROJECT}-node" --policy-arn arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy
aws iam attach-role-policy --role-name "${PROJECT}-node" --policy-arn arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy
aws iam attach-role-policy --role-name "${PROJECT}-node" --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly
aws iam attach-role-policy --role-name "${PROJECT}-node" --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

# 4. 作業者の個人ロールにポリシーを 4 つ付ける。権限 = AWS 管理 3 つ + 自作 1 つの合計
aws iam attach-role-policy --role-name "$PERSONAL_ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonVPCFullAccess
aws iam attach-role-policy --role-name "$PERSONAL_ROLE" --policy-arn arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess
aws iam attach-role-policy --role-name "$PERSONAL_ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess
aws iam attach-role-policy --role-name "$PERSONAL_ROLE" --policy-arn "${POLICY_PREFIX}/${PROJECT}-builder-policy"

set +x
echo "${POLICY_PREFIX}/${PROJECT}-deployer-policy"
