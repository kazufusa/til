#!/usr/bin/env bash
# tf-builder ロールとポリシーを消す。無ければ何もしない。
set -euo pipefail

ROLE="tf-builder"
POLICY="tf-builder-policy"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY}"

if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  for arn in $(aws iam list-attached-role-policies --role-name "$ROLE" \
      --query 'AttachedPolicies[].PolicyArn' --output text); do
    aws iam detach-role-policy --role-name "$ROLE" --policy-arn "$arn"
  done
  aws iam delete-role --role-name "$ROLE"
  echo "deleted role: $ROLE" >&2
fi

if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  for v in $(aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
      --query 'Versions[?IsDefaultVersion==`false`].VersionId' --output text); do
    aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$v"
  done
  aws iam delete-policy --policy-arn "$POLICY_ARN"
  echo "deleted policy: $POLICY_ARN" >&2
fi
