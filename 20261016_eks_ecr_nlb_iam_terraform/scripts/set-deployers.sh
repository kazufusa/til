#!/usr/bin/env bash
# デプロイ担当ロール(<名前>-deployer)にスイッチできる人を設定する。作業者が実行する。
# 開発者の追加も削除も、このスクリプトで行う。
# 渡した ARN の一覧が全員の一覧になる(宣言的)。実行した作業者自身のロールは常に含まれる。
# 外したい人は、その ARN を除いて実行し直す。
# 使い方: [PROJECT=<名前>] scripts/set-deployers.sh [IAM ロールまたはユーザーの ARN]...
#   例: scripts/set-deployers.sh arn:aws:iam::123456789012:role/dev-hanako arn:aws:iam::123456789012:user/jiro
set -euo pipefail

PROJECT="${PROJECT:-eks-exp}"

for arn in "$@"; do
  [[ "$arn" =~ ^arn:aws:iam::[0-9]{12}:(role|user)/ ]] || { echo "invalid arn: $arn" >&2; exit 1; }
done

# 実行者自身の ARN。assumed-role なら元の IAM ロールを get-role で引く(パス付きのロールでも正しい ARN になる)
caller="$(aws sts get-caller-identity --query Arn --output text)"
if [[ "$caller" =~ ^arn:aws:sts::[0-9]{12}:assumed-role/([^/]+)/ ]]; then
  caller="$(aws iam get-role --role-name "${BASH_REMATCH[1]}" --query Role.Arn --output text)"
fi

principals="$(printf '%s\n' "$caller" "$@" | sort -u | jq -R . | jq -sc .)"
trust="$(jq -nc --argjson p "$principals" \
  '{Version:"2012-10-17",Statement:[{Effect:"Allow",Principal:{AWS:$p},Action:"sts:AssumeRole"}]}')"

aws iam update-assume-role-policy --role-name "${PROJECT}-deployer" --policy-document "$trust"

echo "${PROJECT}-deployer に許可した principal:"
jq -r '.[]' <<<"$principals"
