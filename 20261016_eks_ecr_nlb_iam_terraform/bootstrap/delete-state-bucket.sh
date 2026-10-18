#!/usr/bin/env bash
# state 用 S3 バケットを、全オブジェクトバージョンと削除マーカーごと消す。
# 使い方: [PROJECT=<名前>] bootstrap/delete-state-bucket.sh [bucket-name]
set -euo pipefail

PROJECT="${PROJECT:-eks-exp}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${1:-tfstate-${ACCOUNT_ID}-${PROJECT}}"

if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "bucket not found: $BUCKET" >&2
  exit 0
fi

read -r -p "delete bucket ${BUCKET} and ALL versions? [y/N] " ans
[[ "$ans" == "y" ]] || { echo "aborted" >&2; exit 1; }

# 1000 件ずつしか返らないので、空になるまで繰り返す
while :; do
  objects="$(aws s3api list-object-versions --bucket "$BUCKET" --max-keys 1000 \
    --query '{Objects: [Versions[].{Key:Key,VersionId:VersionId}, DeleteMarkers[].{Key:Key,VersionId:VersionId}][] | [?Key != null], Quiet: `true`}' \
    --output json)"
  count="$(jq '.Objects | length' <<<"$objects")"
  [[ "$count" -eq 0 ]] && break
  out="$(aws s3api delete-objects --bucket "$BUCKET" --delete "$objects" --output json)"
  jq -e '(.Errors // []) | length == 0' <<<"$out" >/dev/null || { echo "$out" >&2; exit 1; }
  echo "deleted $count versions" >&2
done

aws s3api delete-bucket --bucket "$BUCKET"
echo "deleted bucket: $BUCKET"
