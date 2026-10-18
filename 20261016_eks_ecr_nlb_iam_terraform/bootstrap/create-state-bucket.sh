#!/usr/bin/env bash
# state 用 S3 バケットを作る。2 回実行しても成功する。
# 使い方: [PROJECT=<名前>] bootstrap/create-state-bucket.sh [bucket-name]
set -euo pipefail

PROJECT="${PROJECT:-eks-exp}"
REGION="${AWS_REGION:-ap-northeast-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${1:-tfstate-${ACCOUNT_ID}-${PROJECT}}"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "bucket already exists: $BUCKET" >&2
else
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  echo "created: $BUCKET" >&2
fi

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# 残骸チェック(Project=${PROJECT})の対象から外すため、値を ${PROJECT}-state にする
aws s3api put-bucket-tagging \
  --bucket "$BUCKET" \
  --tagging "TagSet=[{Key=Project,Value=${PROJECT}-state}]"

echo "$BUCKET"
