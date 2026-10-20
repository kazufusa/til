# 役割別の実施コマンド一覧

誰が、どの順で、何を打つかだけをまとめます。
説明は `docs/guide.md`、権限は `docs/permissions.md` にあります。
コマンドはこのディレクトリ(`20261016_eks_ecr_nlb_iam_terraform/`)で実行します。

## 前提

| 役割 | 必要なもの |
| --- | --- |
| マネージャー | 管理者権限の AWS CLI。terraform は不要 |
| builder | terraform 1.10 以上、aws cli v2、kubectl、jq、docker |
| deployer | aws cli v2、kubectl、docker |

名前(`eks-exp`)を変える場合は、builder が先に `terraform/variables.tf` の `cluster_name` を変えます。
次に `scripts/render-policy.sh <名前>` で、マネージャーに渡す一式(スクリプト 2 本と JSON 3 枚)を
`bootstrap/rendered/<名前>/` に作り、そのフォルダごと渡します。
以後の builder のスクリプトは `PROJECT=<名前>` を付けて実行します。

## マネージャー(1 回だけ)

builder から、builder の個人ロール名(`aws sts get-caller-identity` の `assumed-role/<ここ>/...`)を受け取ります。

```bash
bootstrap/setup-iam.sh <builder の個人ロール名>
```

これで、ロール 3 つ(`eks-exp-cluster`、`eks-exp-node`、`eks-exp-deployer`)とポリシー 2 つができ、
builder の個人ロールに AWS 管理ポリシー 3 つと `eks-exp-builder-policy` が付きます。
撤去は `bootstrap/teardown-iam.sh <builder の個人ロール名>` です。
ポリシーの中身を更新するときは、撤去してからもう一度作ります。

## builder

### 0. 自分のロール名を調べてマネージャーに渡す

```bash
aws sts get-caller-identity --query Arn --output text
# arn:aws:sts::<ACCOUNT_ID>:assumed-role/<ここがロール名>/<セッション名>
```

### 1. (実験のみ)builder 役のロールにスイッチする設定

個人アカウントの実験では、個人ロールの代役にスイッチして builder を演じます。
移植先では自分の個人ロールに権限が付くので、この節は不要です。

```ini
[profile builder]
role_arn       = <ロール ARN>
source_profile = <自分のログインプロファイル>
region         = ap-northeast-1
```

```bash
aws sts get-caller-identity --profile builder
```

移植先では、以後の `--profile builder` と `-var aws_profile=builder` も省きます。

### 2. state バケットの作成(1 回だけ)

```bash
AWS_PROFILE=builder bootstrap/create-state-bucket.sh
```

### 3. 初期化と作成

```bash
cd terraform
terraform init -backend-config="profile=builder" \
  -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
terraform apply -var aws_profile=builder
terraform output
cd ..
```

apply は 15〜20 分かかります。

### 4. deployer への引き渡し

```bash
scripts/render-deployer-doc.sh terraform docs/deployer.md
```

値が埋まった `docs/deployer.md` を deployer に渡します。
deployer の IAM ロールの ARN を、`eks-exp-deployer` の信頼先に足します。

```bash
AWS_PROFILE=builder scripts/set-deployers.sh <deployer の IAM ロールの ARN> ...
```

渡した ARN と自分が、スイッチできる全員になります。増減するときも全員分を渡します。

### 5. 日々の運用

| やること | コマンド |
| --- | --- |
| 開発者を足す、外す | `scripts/set-deployers.sh <ARN> ...` に全員分を渡す(terraform は不要) |
| namespace を足す | `variables.tf` の `deployer_namespaces` に追加して apply |
| ECR を足す | `variables.tf` の `ecr_repository_names` に追加して apply |
| ノードを増やす | `variables.tf` の `node_count` を変えて apply |
| ログ保存期間を変える | `variables.tf` の `log_retention_days` を変えて apply |
| 変更前の確認 | `terraform -chdir=terraform plan -var aws_profile=builder` |

### 6. 片付け(環境を消すとき)

```bash
aws eks update-kubeconfig --name eks-exp --profile builder --alias eks-exp-builder --user-alias eks-exp-builder
kubectl config use-context eks-exp-builder
scripts/preflight-destroy.sh
terraform -chdir=terraform destroy -var aws_profile=builder
yes y | AWS_PROFILE=builder bootstrap/delete-state-bucket.sh
scripts/check-leftovers.sh
```

最後にマネージャーに `bootstrap/teardown-iam.sh <builder の個人ロール名>` を頼みます。

## deployer(アプリ開発者)

値は builder から受け取った `docs/deployer.md` に書いてあります。

### 1. deployer ロールにスイッチする設定

```ini
[profile deployer]
role_arn       = <deployer.md のロール ARN>
source_profile = <自分のログインプロファイル>
region         = ap-northeast-1
```

```bash
aws sts get-caller-identity --profile deployer
```

### 2. image の push

```bash
ECR=<deployer.md の ECR リポジトリ>
aws ecr get-login-password --profile deployer | docker login --username AWS --password-stdin "${ECR%/*}"
docker build -t "${ECR}:v1" app/
docker push "${ECR}:v1"
```

### 3. デプロイ

```bash
aws eks update-kubeconfig --name eks-exp --profile deployer --alias eks-exp-deployer --user-alias eks-exp-deployer
sed "s|IMAGE_PLACEHOLDER|${ECR}:v1|" app/k8s.yaml | kubectl --context eks-exp-deployer apply -n app -f -
kubectl --context eks-exp-deployer -n app rollout status deploy/web
```

### 4. 確認

```bash
curl -s <deployer.md の公開 URL>
curl -s <deployer.md の公開 URL>news
kubectl --context eks-exp-deployer -n app logs deploy/web --tail=20
aws logs tail /aws/containerinsights/eks-exp/application --since 10m --profile deployer
```

### 5. 更新するとき

```bash
docker build -t "${ECR}:v2" app/ && docker push "${ECR}:v2"
kubectl --context eks-exp-deployer -n app set image deploy/web web="${ECR}:v2"
kubectl --context eks-exp-deployer -n app rollout status deploy/web
```

Service の `nodePort` は 30080 のままにします。
Service type=LoadBalancer と PersistentVolumeClaim は quota で作れません。
