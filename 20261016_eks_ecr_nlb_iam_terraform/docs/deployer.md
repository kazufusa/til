# deployer 向けの手引き

アプリ開発者が最初に読むページです。
image を ECR に push し、kubectl でアプリをデプロイするまでを説明します。

## 受け取る情報

builder から、次の 7 つを受け取ります。

- [ ] `app-deployer` ロールの ARN(`deployer_role_arn`)
- [ ] クラスタ名とリージョン(`cluster_name`、`region`)
- [ ] ECR リポジトリの URL(`ecr_repository_url`)
- [ ] namespace(`deployer_namespaces`、既定は `app`)
- [ ] NodePort(`node_port`、30080)
- [ ] 公開 URL(`nlb_dns_name`)
- [ ] このページの場所(`docs/deployer.md`)

## プロファイルの設定

`~/.aws/config` に、次のプロファイルを足します。

```ini
[profile deployer]
role_arn       = <deployer_role_arn>
source_profile = <自分のログインプロファイル>
region         = ap-northeast-1
```

設定できたかは、次のコマンドで確かめます。
出力の ARN に `app-deployer` が含まれていれば成功です。

```bash
aws sts get-caller-identity --profile deployer
```

## image の push

ECR にログインし、image を build して push します。

```bash
ECR=<ecr_repository_url>
aws ecr get-login-password --profile deployer | docker login --username AWS --password-stdin "${ECR%/*}"
docker build -t "${ECR}:v1" app/
docker push "${ECR}:v1"
```

## デプロイ

kubeconfig を作り、manifest の image 名を置き換えて apply します。

```bash
aws eks update-kubeconfig --name <cluster_name> --profile deployer --alias <alias>
sed "s|IMAGE_PLACEHOLDER|${ECR}:v1|" app/k8s.yaml | kubectl apply -n app -f -
kubectl -n app rollout status deploy/web
curl http://<nlb_dns_name>/
```

Service の `nodePort` は、必ず 30080 にします。
NLB がこの番号に転送するためです。

## できること・できないこと

| 操作 | 可否 |
| --- | --- |
| namespace `app` の中の操作 | admin なのでできる |
| クラスタ全体の参照(`get nodes` など) | 読み取りだけできる |
| Secret の参照 | できない |
| namespace の作成 | できない |
| ResourceQuota の変更 | できない |
| Service type=LoadBalancer と PVC | quota に拒否される |

LoadBalancer と PVC を拒否するのは、terraform の外にクラウド資源を作らせないためです。
外部に公開する口は、builder が NLB として用意しています。
権限の詳細は `docs/permissions.md` にあります。

## うまくいかないとき

- `Forbidden` が出るときは、`-n app` を付けているか確かめます。他の namespace には書き込めません。
- `exceeded quota` が出るときは、Service type=LoadBalancer や PVC を使っていないか確かめます。
- Pod が Pending のときは、`kubectl get nodes` と `kubectl -n app describe pod` を見ます。
- image の pull に失敗するときは、manifest の URL と tag が push したものと一致するか確かめます。
- URL が応答しないときは、Service の `nodePort` が 30080 か確かめます。
