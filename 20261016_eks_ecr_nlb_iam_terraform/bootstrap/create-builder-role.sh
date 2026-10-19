#!/usr/bin/env bash
# 共有の作業ロール tf-builder を作り、権限を付ける。個人ロールに直接付ける場合はこの台本は不要で、
# attach-builder-policy.sh だけを使う。
# 使い方: bootstrap/create-builder-role.sh <スイッチを許可する principal の ARN>
# やり直すときは、先に bootstrap/delete-builder-role.sh で消す。
set -Ceuo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 <principal-arn>" >&2; exit 1; }
cd "$(dirname "$0")"
set -x
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# 1. 誰がスイッチできるか(引数の ARN)だけを書いた空のロールを作る
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"'"$1"'"},"Action":"sts:AssumeRole"}]}'
aws iam create-role --role-name tf-builder --assume-role-policy-document "$TRUST" >/dev/null

# 2. 権限を付ける(個人ロールに付けるときと同じ台本)
./attach-builder-policy.sh tf-builder

echo "arn:aws:iam::${ACCOUNT_ID}:role/tf-builder"
