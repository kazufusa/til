# 役割別の実施コマンド一覧

誰が、どの順で、何を打つかだけをまとめます。
説明は `docs/guide.md`、権限は `docs/permissions.md` にあります。
コマンドはこのディレクトリ(`20261016_eks_ecr_nlb_iam_terraform/`)で実行します。

## 前提

| 役割 | 必要なもの |
| --- | --- |
| マネージャー | 管理者権限の AWS CLI。terraform は不要 |
| builder | terraform 1.11 以上、aws cli v2、session-manager-plugin、kubectl、jq、docker |
| deployer | aws cli v2、session-manager-plugin、kubectl、docker |

名前(`eks-exp`)を変える場合は、builder が先に `terraform/variables.tf` の `cluster_name` を変えます。
次に `scripts/render-policy.sh <名前>` で、マネージャーに渡す一式(スクリプト 4 本と JSON 3 枚)を
`bootstrap/rendered/<名前>/` に作り、そのフォルダごと渡します。
以後の builder のスクリプトは `PROJECT=<名前>` を付けて実行します。

## マネージャー(1 回だけ)

builder から、builder の個人ロール名を受け取ります。
`aws sts get-caller-identity` の出力の `assumed-role/<ここ>/...` の部分です。

```bash
bootstrap/setup-iam.sh <builder の個人ロール名>
```

これで、ロール 3 つ(`eks-exp-cluster`、`eks-exp-node`、踏み台用の `eks-exp-bastion`)とポリシー 2 つができ、
builder の個人ロールに AWS 管理ポリシー 3 つと `eks-exp-builder-policy` が付きます。

アプリ開発者が決まったら、その人の個人ロール名を受け取って 1 回ずつ実行します。

```bash
bootstrap/attach-deployer-policy.sh <開発者の個人ロール名>
```
撤去は `bootstrap/teardown-iam.sh <builder の個人ロール名>` です。
ポリシーの中身を更新するときは、新しい版を作って既定にします。ロールへの付け直しは要りません。

```bash
aws iam create-policy-version --set-as-default \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/eks-exp-deployer-policy \
  --policy-document file://bootstrap/deployer-policy.json
```

版は 5 つまでしか持てないので、古い版は `aws iam delete-policy-version` で消します。

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

API サーバーはプライベートだけなので、新規構築は 2 段で進めます。

端末 1 で、初期化と 1 段目の apply を流します。VPC、クラスタ、踏み台ができます。

```bash
cd terraform
terraform init -backend-config="profile=builder" \
  -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
terraform apply -var aws_profile=builder \
  -target=aws_instance.bastion -target=aws_vpc_security_group_ingress_rule.cluster_from_bastion
```

端末 2 で、トンネルを張ったままにします(このディレクトリで実行します)。

```bash
AWS_PROFILE=builder scripts/eks-tunnel.sh eks-exp "$(terraform -chdir=terraform output -raw bastion_instance_id)"
```

端末 1 に戻り、2 段目の apply で残りを作ります。

```bash
terraform apply -var aws_profile=builder
terraform output
cd ..
```

apply は全体で 15〜20 分かかります。
2 回目以降の plan、apply、destroy も、先にトンネルを張ります。

### 4. deployer への引き渡し

```bash
scripts/render-deployer-doc.sh terraform docs/deployer.md
```

値が埋まった `docs/deployer.md` を deployer に渡します。
deployer の個人ロールの ARN を `terraform/variables.tf` の `deployer_role_arns` に書いて apply します(トンネルを張ったまま)。
EKS の Access Entry ができ、トンネルを通して kubectl が使えるようになります。
IAM 側(ECR の push、ログの参照、トンネルの接続)は、マネージャーが `attach-deployer-policy.sh` で付けます。

```bash
cd terraform && terraform apply -var aws_profile=builder && cd ..
```

### 5. 日々の運用

| やること | コマンド |
| --- | --- |
| 開発者を足す、外す | マネージャーに `attach-deployer-policy.sh` / `detach-deployer-policy.sh` を頼み、`variables.tf` の `deployer_role_arns` を変えて apply |
| namespace を足す | `variables.tf` の `deployer_namespaces` に追加して apply |
| ECR を足す | `variables.tf` の `ecr_repository_names` に追加して apply |
| ノードを増やす | `variables.tf` の `node_count` を変えて apply |
| ログ保存期間を変える | `variables.tf` の `log_retention_days` を変えて apply |
| 変更前の確認 | トンネルを張ってから `terraform -chdir=terraform plan -var aws_profile=builder` |
| 踏み台の ID を知る | `terraform -chdir=terraform output -raw bastion_instance_id` |

### 6. 片付け(環境を消すとき)

別の端末でトンネルを張ってから、destroy を流します。スクリプトが kubeconfig も作るので、`update-kubeconfig` は要りません。
kubernetes の資源は踏み台に依存するので、destroy では踏み台より先に消えます。トンネルは最後まで張ったままにします。

```bash
# 別の端末
AWS_PROFILE=builder scripts/eks-tunnel.sh eks-exp "$(terraform -chdir=terraform output -raw bastion_instance_id)"
# 元の端末
scripts/preflight-destroy.sh
terraform -chdir=terraform destroy -var aws_profile=builder
yes y | AWS_PROFILE=builder bootstrap/delete-state-bucket.sh
scripts/check-leftovers.sh
```

最後にマネージャーに `bootstrap/teardown-iam.sh <builder の個人ロール名>` を頼みます。

## deployer(アプリ開発者)

値は builder から受け取った `docs/deployer.md` に書いてあります。

### 1. 権限の確認

権限は自分のログインのロールに付いているので、スイッチは不要です。
出力のロール名が `docs/deployer.md` の「権限が付いているロール」にあれば準備できています。

```bash
aws sts get-caller-identity --query Arn --output text
```

### 2. image の push

```bash
ECR=<deployer.md の ECR リポジトリ>
aws ecr get-login-password | docker login --username AWS --password-stdin "${ECR%/*}"
docker build -t "${ECR}:v1" app/
docker push "${ECR}:v1"
```

### 3. トンネルとデプロイ

端末 1 でトンネルを張ったままにします。スクリプトが kubeconfig を作り、接続先を手元のポートへ向けます。
値は `docs/deployer.md` の踏み台のインスタンス ID です。

```bash
scripts/eks-tunnel.sh eks-exp <deployer.md の踏み台のインスタンス ID>
```

端末 2 で、デプロイします。

```bash
sed "s|IMAGE_PLACEHOLDER|${ECR}:v1|" app/k8s.yaml | kubectl apply -n app -f -
kubectl -n app rollout status deploy/web
```

### 4. 確認(端末 2)

```bash
curl -s <deployer.md の公開 URL>
curl -s <deployer.md の公開 URL>news
kubectl -n app logs deploy/web --tail=20
aws logs tail /aws/containerinsights/eks-exp/application --since 10m
```

### 5. 更新するとき

```bash
docker build -t "${ECR}:v2" app/ && docker push "${ECR}:v2"
kubectl -n app set image deploy/web web="${ECR}:v2"
kubectl -n app rollout status deploy/web
```

Service の `nodePort` は 30080 のままにします。
Service type=LoadBalancer と PersistentVolumeClaim は quota で作れません。
