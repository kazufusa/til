#!/usr/bin/env bash
# setup-iam.sh で作ったものをすべて消す。マネージャーが管理者権限で実行する。
# すでに消えているものは読み飛ばすので、途中で止まっても再実行できる。
# 使い方: [PROJECT=<名前>] bootstrap/teardown-iam.sh <作業者の個人ロール名>
set -Ceuo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 <builder-personal-role-name>" >&2; exit 1; }
cd "$(dirname "$0")"
PROJECT="${PROJECT:-eks-exp}"
PERSONAL_ROLE="$1"
set -x
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
POLICY_PREFIX="arn:aws:iam::${ACCOUNT_ID}:policy"

# 1. 作業者の個人ロールから 4 つを外す
aws iam detach-role-policy --role-name "$PERSONAL_ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonVPCFullAccess || true
aws iam detach-role-policy --role-name "$PERSONAL_ROLE" --policy-arn arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess || true
aws iam detach-role-policy --role-name "$PERSONAL_ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess || true
aws iam detach-role-policy --role-name "$PERSONAL_ROLE" --policy-arn "${POLICY_PREFIX}/${PROJECT}-builder-policy" || true

# 2. 自作ポリシー 2 つを、付いているロールすべてから外す(開発者のロールに残っている分も含む)
for p in builder deployer; do
  arn="${POLICY_PREFIX}/${PROJECT}-${p}-policy"
  for r in $(aws iam list-entities-for-policy --policy-arn "$arn" --entity-filter Role --query 'PolicyRoles[].RoleName' --output text 2>/dev/null || true); do
    aws iam detach-role-policy --role-name "$r" --policy-arn "$arn" || true
  done
done

# 3. ノード用ロールを消す
aws iam detach-role-policy --role-name "${PROJECT}-node" --policy-arn arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy || true
aws iam detach-role-policy --role-name "${PROJECT}-node" --policy-arn arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy || true
aws iam detach-role-policy --role-name "${PROJECT}-node" --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly || true
aws iam detach-role-policy --role-name "${PROJECT}-node" --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy || true
aws iam delete-role --role-name "${PROJECT}-node" || true

# 4. 踏み台用ロールと instance profile を消す
aws iam remove-role-from-instance-profile --instance-profile-name "${PROJECT}-bastion" --role-name "${PROJECT}-bastion" || true
aws iam delete-instance-profile --instance-profile-name "${PROJECT}-bastion" || true
aws iam detach-role-policy --role-name "${PROJECT}-bastion" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore || true
aws iam delete-role --role-name "${PROJECT}-bastion" || true

# 5. クラスタ用ロールを消す
aws iam detach-role-policy --role-name "${PROJECT}-cluster" --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy || true
aws iam delete-role --role-name "${PROJECT}-cluster" || true

# 6. 自作ポリシーを消す。既定でない版が残っていると消せないので、先に版を消す
for p in builder deployer; do
  arn="${POLICY_PREFIX}/${PROJECT}-${p}-policy"
  for v in $(aws iam list-policy-versions --policy-arn "$arn" --query 'Versions[?IsDefaultVersion==`false`].VersionId' --output text 2>/dev/null || true); do
    aws iam delete-policy-version --policy-arn "$arn" --version-id "$v" || true
  done
  aws iam delete-policy --policy-arn "$arn" || true
done
