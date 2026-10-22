#!/usr/bin/env bash
# SSM の踏み台を経由して、EKS の API サーバー(プライベートエンドポイント)へのトンネルを張る。
# kubeconfig を作り、server を手元のポートへ向けてから、ポート転送を前面で動かす。Ctrl-C で閉じる。
# トンネルを張っている間、別の端末で kubectl と terraform が使える。
# 手元に session-manager-plugin が必要。
# 使い方: scripts/eks-tunnel.sh <cluster-name> <bastion-instance-id> [local-port]
#   例: scripts/eks-tunnel.sh eks-exp i-0123456789abcdef0
set -euo pipefail

[[ $# -ge 2 ]] || { echo "usage: $0 <cluster-name> <bastion-instance-id> [local-port]" >&2; exit 1; }
CLUSTER="$1"
INSTANCE="$2"
PORT="${3:-8443}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-1}}"

command -v session-manager-plugin >/dev/null || { echo "session-manager-plugin is not installed" >&2; exit 1; }

endpoint="$(aws eks describe-cluster --name "$CLUSTER" --region "$REGION" --query cluster.endpoint --output text)"
host="${endpoint#https://}"
cluster_arn="$(aws eks describe-cluster --name "$CLUSTER" --region "$REGION" --query cluster.arn --output text)"

aws eks update-kubeconfig --name "$CLUSTER" --region "$REGION" >/dev/null
# 証明書はエンドポイントのホスト名で発行されているので、接続先を localhost にしても名前で検証する
kubectl config set-cluster "$cluster_arn" --server="https://127.0.0.1:${PORT}" --tls-server-name="$host" >/dev/null

echo "tunnel: 127.0.0.1:${PORT} -> ${host}:443 via ${INSTANCE}" >&2
exec aws ssm start-session --region "$REGION" --target "$INSTANCE" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=${host},portNumber=443,localPortNumber=${PORT}"
