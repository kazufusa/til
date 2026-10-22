# EKS + ECR + NLB + IAM ロールの terraform

## 概要

EKS 環境を作る terraform と、その前後でマネージャーが使う IAM のスクリプトです。
個人のアカウントで何度も作って壊し、完全に戻せることを確かめました。移植先(dev 環境)のリポジトリへ移す前提です。

## できること

- HTTPS の URL(CloudFront)で、アプリにアクセスできる。NLB は内部向けで、CloudFront から VPC origin で届く
- Pod から、NAT Gateway と固定 EIP を通ってアウトバウンド通信できる
- kubectl で、サンプルの Slack アプリ(署名検証、メンション返信)をデプロイできる
- EKS の API サーバーは VPC の中だけに公開し、SSM の踏み台とポート転送で手元からつなぐ(転送先は自前の SSM ドキュメントで API サーバーの 443 に固定)
- 全 Pod のログが CloudWatch Logs に転送され、30 日間残る
- image を置く ECR がある(リポジトリは複数指定できる)
- 開発者は自分のロールのまま、image の push とデプロイができる(スイッチ不要)
- 構築先のアカウントを固定できる(`allowed_account_ids`)

## 役割と IAM

| 役割 | 誰 | 使うロール | できること |
| --- | --- | --- | --- |
| マネージャー | 管理者 | 自分の管理者権限 | `setup-iam.sh` でロール 3 つとポリシー 2 つを作り、builder に権限を付ける(1 回)。開発者ごとに `attach-deployer-policy.sh`。撤去は `teardown-iam.sh` |
| builder | 環境を作る人 | 自分の個人ロール(権限を付けてもらう) | terraform の apply と destroy。開発者の ARN を `variables.tf` に書いて apply。API サーバーへはトンネル経由 |
| deployer | アプリ開発者 | 自分の個人ロール(権限を付けてもらう) | ECR への push、namespace `app` の admin、クラスタ全体の読み取り。kubectl はトンネル経由 |

IAM のロールとポリシーは terraform では作りません。
builder がロールを作れると自分に任意の権限を与えられるため、マネージャーがまとめて作ります。

| 名前 | 種類 | 用途 |
| --- | --- | --- |
| `eks-exp-cluster` | ロール | EKS のコントロールプレーン用 |
| `eks-exp-node` | ロール | ノード(EC2)用。ECR の pull と CloudWatch Logs への書き込み |
| `eks-exp-bastion` | ロールと instance profile | 踏み台(EC2)用。SSM に登録するだけ |
| `eks-exp-builder-policy` | ポリシー | builder の個人ロールに付ける。AWS 管理ポリシー 3 つと組み合わせる |
| `eks-exp-deployer-policy` | ポリシー | 開発者の個人ロールに付ける |

## 最短手順

### 1. マネージャー: IAM を作る(1 回だけ)

```bash
bootstrap/setup-iam.sh <builder の個人ロール名>   # 例: cli-fl-taro.yamada
```

JSON 2 枚からポリシー 2 つが登録され、EKS と踏み台用のロール 3 つが作られます。
続けて、builder の個人ロールに AWS 管理ポリシー 3 つ(VPC、ELB、ECR の FullAccess)と
`eks-exp-builder-policy` が付き、builder は terraform を回せます。

### 2. builder: state バケットを作り、terraform を 2 段で回す

```bash
bootstrap/create-state-bucket.sh
cd terraform
terraform init -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
# 1 段目: VPC、クラスタ、踏み台までを作る
terraform apply -target=aws_instance.bastion -target=aws_vpc_security_group_ingress_rule.cluster_from_bastion
# (別の端末で下のトンネルを張ったままにする)
# 2 段目: 残りを作る
terraform apply
terraform output
```

1 段目で VPC、クラスタ、踏み台ができます。API サーバーはプライベートだけなので、2 段目は別の端末にトンネルを張って流します。
トンネルは `session-manager-plugin` が手元に必要で、2 回目以降の plan、apply、destroy にも要ります。

```bash
scripts/eks-tunnel.sh eks-exp "$(terraform -chdir=terraform output -raw bastion_instance_id)"
```

`output` で、deployer に渡す値(ECR の URL、公開 URL など)が表示されます。

### 3. 開発者を足す(マネージャーと builder が 1 回ずつ)

```bash
bootstrap/attach-deployer-policy.sh <開発者の個人ロール名>   # マネージャー
```

マネージャーが個人ロールに `eks-exp-deployer-policy` を付けます(ECR の push、ログの参照、トンネルの接続)。
builder は `deployer_role_arns` に開発者のロール ARN を足して apply します。
これで EKS 側の権限(Access Entry)が付きます。外すときは逆の手順です。

### 4. deployer: image を push してデプロイする

開発者は自分のログインのまま、`docs/deployer.md` の手順で ECR へ push します(トンネル不要)。
kubectl は、トンネルを張った別の端末で打ちます。役割ごとのコマンド一覧は `docs/runbook.md` です。

## deployer への引き渡し

builder が apply の後に `scripts/render-deployer-doc.sh` を実行し、値が埋まった `docs/deployer.md` を開発者に渡します。
下の表は、各値の出所です。

| 渡すもの | 出所 | 用途 |
| --- | --- | --- |
| 権限が付いているロール | `terraform output deployer_role_arns` | 自分のロールが入っているかの確認 |
| クラスタ名とリージョン | `cluster_name`、`region` | トンネルのスクリプトの引数 |
| 踏み台のインスタンス ID | `bastion_instance_id` | トンネルのスクリプトの引数 |
| ECR リポジトリの URL | `ecr_repository_url`(先頭の 1 つ。全部は `ecr_repository_urls`) | push と manifest の image |
| namespace | `deployer_namespaces`(既定 `app`) | デプロイ先 |
| NodePort | `node_port`(30080) | Service に必ずこの番号を書く |
| 公開 URL(HTTPS) | `https_url` | 動作確認 |
| ログのロググループ | `log_group_application` | CloudWatch Logs でのログ参照 |
| できること・できないこと | `docs/permissions.md` | 権限の範囲の確認 |
| 最初に読むページ | `docs/deployer.md` | 開発者向けの手順 |

## 名前を変えるときの注意

名前の元になる語は、今は `eks-exp` です。ロール、ポリシー、クラスタ、NLB、バケット、タグの接頭辞に入っています。
変えるときは、terraform の変数 `cluster_name` を変え、
`scripts/render-policy.sh <名前>` でマネージャーに渡す一式(スクリプト 4 本と JSON 3 枚)を作ります。
以後のスクリプトは `PROJECT=<名前>` を付けて実行します。
NLB の名前は 32 文字までで、稼働後に変えると terraform が作り直します。

## ディレクトリ構成

```
terraform/   EKS、ネットワーク、踏み台、NLB、CloudFront、ECR の terraform(IAM は名前で参照するだけ)
bootstrap/   マネージャーが実行する IAM のスクリプトと、ポリシーの JSON
scripts/     トンネル、deployer ページの生成、destroy 前の確認、残骸の検査、名前の置換
app/         サンプルアプリの Dockerfile と manifest
docs/        解説、権限、申請文、実験ログ、設計、計画
```

## 文書の案内

- `docs/porting.md`: 移植ガイド。何をコピーし、何を変え、何を頼み、最初の apply で何を確認するか
- `docs/runbook.md`: 役割別のコマンド一覧
- `docs/deployer.md`: 開発者に渡すページ(`scripts/render-deployer-doc.sh` で生成)
- `docs/permissions.md`: builder と deployer の権限、申請向け構成
- `docs/request.md`: マネージャーへの申請文のたたき台
- `docs/guide.md`: IAM と Kubernetes を知らない人向けの解説

実験の記録(`docs/practice.md`、`docs/history/`)は、移植には不要です。
