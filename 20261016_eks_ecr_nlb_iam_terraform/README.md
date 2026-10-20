# EKS + ECR + NLB + IAM ロールの terraform

## 概要

このディレクトリには、EKS 環境を作る terraform と、その前後でマネージャーが使う IAM のスクリプトが入っています。
個人のアカウントで何度も作って壊し、完全に戻せることを確かめました。
移植先(dev 環境)のリポジトリへ移す前提で作っています。

## できること

- HTTPS の URL(CloudFront)で、アプリにアクセスできる。NLB は内部向けで、CloudFront から VPC origin で届く
- Pod から、NAT Gateway と固定 EIP を通ってアウトバウンド通信できる
- kubectl で、サンプルの Slack アプリ(署名検証、メンション返信)をデプロイできる
- 全 Pod のログが CloudWatch Logs に転送され、30 日間残る
- image を置く ECR がある(リポジトリは複数指定できる)
- deployer ロール(既定は `eks-exp-deployer`)で、image の push とデプロイができる
- 構築先のアカウントを固定できる(`allowed_account_ids`)

## 役割と IAM

| 役割 | 誰 | 使うロール | できること |
| --- | --- | --- | --- |
| マネージャー | 管理者 | 自分の管理者権限 | `setup-iam.sh` でロール 3 つとポリシー 2 つを作り、builder に権限を付ける(1 回)。撤去は `teardown-iam.sh` |
| builder | 環境を作る人 | 自分の個人ロール(権限を付けてもらう) | terraform の apply と destroy、開発者の追加(`set-deployers.sh`) |
| deployer | アプリ開発者 | `eks-exp-deployer`(スイッチ) | ECR への push、namespace `app` の admin、クラスタ全体の読み取り |

IAM のロールとポリシーは terraform では作りません。
builder がロールを作れると自分に任意の権限を与えられるため、マネージャーがまとめて作ります。

| 名前 | 種類 | 用途 |
| --- | --- | --- |
| `eks-exp-cluster` | ロール | EKS のコントロールプレーン用 |
| `eks-exp-node` | ロール | ノード(EC2)用。ECR の pull と CloudWatch Logs への書き込み |
| `eks-exp-deployer` | ロール | 開発者がスイッチする。信頼先は builder が書き換える |
| `eks-exp-builder-policy` | ポリシー | builder の個人ロールに付ける。AWS 管理ポリシー 3 つと組み合わせる |
| `eks-exp-deployer-policy` | ポリシー | `eks-exp-deployer` に付ける |

## 最短手順

### 1. マネージャー: IAM を作る(1 回だけ)

```bash
bootstrap/setup-iam.sh <builder の個人ロール名>   # 例: cli-fl-taro.yamada
```

実行すると、隣の JSON 2 枚からポリシー 2 つが登録され、ロール 3 つが作られます。
続けて、builder の個人ロールに AWS 管理ポリシー 3 つ(VPC、ELB、ECR の FullAccess)と
`eks-exp-builder-policy` が付きます。builder はこれで terraform を回せます。

### 2. builder: state バケットを作り、terraform を回す

```bash
bootstrap/create-state-bucket.sh
cd terraform
terraform init -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
terraform apply
terraform output
```

最初の行で、state を置く S3 バケットが作られます。
`init` でそのバケットを terraform に教え、`apply` で VPC から EKS、ECR、NLB、CloudFront まで作ります。
IAM ロールは名前で参照するだけです。
`output` で、deployer に渡す値(ロール ARN、ECR の URL、公開 URL など)が表示されます。

### 3. builder: 開発者を deployer ロールの信頼先に足す

```bash
scripts/set-deployers.sh <開発者の IAM ロールの ARN> ...
```

渡した ARN の一覧(と自分)が、`eks-exp-deployer` にスイッチできる全員になります。
開発者を増やすときも減らすときも同じコマンドで、terraform は触りません。

### 4. deployer: image を push してデプロイする

`docs/deployer.md` の手順どおりに、ECR へ push し、kubectl で namespace `app` へ配置します。
役割ごとのコマンドを順に並べた一覧は `docs/runbook.md` にあります。

## deployer への引き渡し

builder が apply の後に `scripts/render-deployer-doc.sh` を実行します。
値が埋まった `docs/deployer.md` を、developer に渡します。
下の表は、各値の出所です。

| 渡すもの | 出所 | 用途 |
| --- | --- | --- |
| deployer ロールの ARN | `terraform output deployer_role_arn` | `~/.aws/config` の role_arn |
| クラスタ名とリージョン | `cluster_name`、`region` | update-kubeconfig |
| ECR リポジトリの URL | `ecr_repository_url`(先頭の 1 つ。全部は `ecr_repository_urls`) | push と manifest の image |
| namespace | `deployer_namespaces`(既定 `app`) | デプロイ先 |
| NodePort | `node_port`(30080) | Service に必ずこの番号を書く |
| 公開 URL(HTTPS) | `https_url` | 動作確認 |
| ログのロググループ | `log_group_application` | CloudWatch Logs でのログ参照 |
| できること・できないこと | `docs/permissions.md` | 権限の範囲の確認 |
| 最初に読むページ | `docs/deployer.md` | 開発者向けの手順 |

## 名前を変えるときの注意

- 名前の元になる語は、今は `eks-exp` です。ロール、ポリシー、クラスタ、NLB、バケット、タグに接頭辞として入っています。
- 変えるときは、次の 3 手順を踏みます。
  1. terraform の変数 `cluster_name` を変えます。
  2. `scripts/render-policy.sh <名前>` で、マネージャーに渡す一式(スクリプト 2 本と JSON 3 枚)を作ります。
  3. 以後のスクリプトは `PROJECT=<名前>` を付けて実行します。
- NLB の名前は 32 文字までです。稼働後に変えると、terraform が作り直します。

## ディレクトリ構成

```
terraform/   EKS、ネットワーク、NLB、CloudFront、ECR の terraform(IAM は名前で参照するだけ)
bootstrap/   マネージャーが実行する IAM のスクリプトと、ポリシーの JSON
scripts/     開発者の追加、deployer ページの生成、destroy 前の確認、残骸の検査
app/         サンプルアプリの Dockerfile と manifest
docs/        解説、権限、申請文、実験ログ、設計、計画
```

## 文書の案内

移植に使うもの。

- `docs/porting.md`: 移植ガイド。何をコピーし、何を変え、何を頼み、最初の apply で何を確認するか
- `docs/runbook.md`: マネージャー、builder、deployer が打つコマンドを役割別に順に並べた一覧
- `docs/deployer.md`: 開発者に渡すページ(`scripts/render-deployer-doc.sh` で値を埋めて生成)
- `docs/permissions.md`: builder と deployer の権限、申請向け構成、検証で見つかった Action
- `docs/request.md`: マネージャーへの申請文のたたき台
- `docs/guide.md`: IAM と Kubernetes を知らない人向けの解説

この実験の記録。移植には不要。

- `docs/practice.md`: 個人アカウントで 3 役を演じる練習手順
- `docs/history/experiment-log.md`: 各段の実験ログ
- `docs/history/design.md`: 設計と判断の記録
- `docs/history/plan.md`: 実装の計画
