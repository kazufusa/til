# deployer 向けの手引き

この値は例です。builder が scripts/render-deployer-doc.sh で実際の値に埋めます。移植先のリポジトリでは、埋めた状態で commit します。

アプリ開発者が最初に読むページです。
image を ECR に push し、kubectl でアプリをデプロイするまでを説明します。

## あなたの環境

| 項目 | 値 |
| --- | --- |
| 権限が付いているロール | `arn:aws:iam::123456789012:role/dev-hanako` |
| クラスタ名 | `eks-exp` |
| リージョン | `ap-northeast-1` |
| ECR リポジトリ | `123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/app` |
| namespace | `app` |
| NodePort | `30080` |
| 公開 URL(HTTPS) | `https://d0123456789abc.cloudfront.net/` |
| CloudFront のオリジン(NLB) | `eks-exp-nlb-0123456789abcdef.elb.ap-northeast-1.amazonaws.com`(直接は届きません) |
| アプリのログ(CloudWatch Logs) | `/aws/containerinsights/eks-exp/application` |
| 外向き通信の送信元 IP | `203.0.113.10` |

## 権限の確認

権限は、あなたがログインに使っているロールに付いています。スイッチは要りません。
次のコマンドの出力のロール名が、上の表の「権限が付いているロール」にあれば準備できています。

```bash
aws sts get-caller-identity --query Arn --output text
```

## image の push

ECR にログインし、image を build して push します。

```bash
ECR=123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/app
aws ecr get-login-password | docker login --username AWS --password-stdin "${ECR%/*}"
docker build -t "${ECR}:v1" app/
docker push "${ECR}:v1"
```

## デプロイ

kubeconfig を作り、manifest の image 名を置き換えて apply します。

```bash
aws eks update-kubeconfig --name eks-exp --region ap-northeast-1 --alias <alias> --user-alias <alias>
sed "s|IMAGE_PLACEHOLDER|${ECR}:v1|" app/k8s.yaml | kubectl apply -n app -f -
kubectl -n app rollout status deploy/web
curl https://d0123456789abc.cloudfront.net/
```

外向きの通信は、`/news` で確認します。
NHK の RSS から取った見出しが 5 件、JSON で返れば成功です。

```bash
curl -s https://d0123456789abc.cloudfront.net/news
```

Service の `nodePort` は、必ず 30080 にします。
NLB がこの番号に転送するためです。

## Slack アプリとして使う

サンプルアプリは、Slack のイベントを受ける最小のアプリです。
Secret を作ると、署名の検証と、メンションへの返信が有効になります。

Slack のアプリを作り、Signing Secret と Bot User OAuth Token を控えてから、Secret を作ります。

```bash
kubectl -n app create secret generic slack \
  --from-literal=SLACK_SIGNING_SECRET=... \
  --from-literal=SLACK_BOT_TOKEN=xoxb-...
kubectl -n app rollout restart deploy/web
```

Slack の Event Subscriptions で、Request URL を次の値にします。
`app_mention` を subscribe し、`chat:write` 権限を付けてインストールします。

```text
https://d0123456789abc.cloudfront.net/slack/events
```

Request URL を入れると、Slack が challenge を送ります。
アプリが同じ値を返せば、画面に Verified と出ます。
チャンネルでアプリにメンションすると、スレッドに `hello from eks-exp` が返ります。

slack.com への通信は NAT を通ります。送信元 IP は上の表の値です。
詳しい手順は `app/README.md` にあります。

## ログの見方

Pod のログは、まず kubectl で見ます。

```bash
kubectl -n app logs deploy/web --tail=100 -f
```

Pod が消えると、kubectl では見えなくなります。
全 Pod の標準出力は CloudWatch Logs にも転送してあり、Pod が消えたあとも 30 日間残ります。
次のコマンドで読めます。

```bash
aws logs tail /aws/containerinsights/eks-exp/application --follow --region ap-northeast-1
```

読み取りの権限があるのは、このクラスタのロググループだけです。
NLB の URL には、外から直接は届きません。
入口は CloudFront の HTTPS の URL だけです。

## できること・できないこと

| 操作 | 可否 |
| --- | --- |
| namespace `app` の中の操作 | admin なのでできる |
| クラスタ全体の参照(`get nodes` など) | 読み取りだけできる |
| 自分の namespace(`app`)の Secret の参照と編集 | できる |
| ログの参照 | できる(`kubectl logs` と CloudWatch Logs の両方) |
| 他の namespace の Secret の参照 | できない |
| namespace の作成 | できない |
| ResourceQuota の変更 | できない |
| Service type=LoadBalancer と PVC | quota に拒否される |
| 特権 Pod、hostPath、hostNetwork | できない(Pod Security の baseline に拒否される) |

LoadBalancer と PVC を拒否するのは、terraform の外にクラウド資源を作らせないためです。
外部に公開する口は、builder が NLB として用意しています。
権限の詳細は `docs/permissions.md` にあります。

## うまくいかないとき

- `Forbidden` が出るときは、`-n app` を付けているか確かめます。他の namespace には書き込めません。
- `exceeded quota` が出るときは、Service type=LoadBalancer や PVC を使っていないか確かめます。
- Pod が Pending のときは、`kubectl get nodes` と `kubectl -n app describe pod` を見ます。
- image の pull に失敗するときは、manifest の URL と tag が push したものと一致するか確かめます。
- URL が応答しないときは、Service の `nodePort` が 30080 か確かめます。
