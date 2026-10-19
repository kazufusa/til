# EKS + ECR + NLB + IAM ロールの terraform

## 概要

このディレクトリには、EKS 環境と、その周りの 2 つの IAM ロールを作る terraform が入っています。
個人のアカウントで何度も作って壊し、完全に戻せることを確かめました。
移植先(dev 環境)のリポジトリへ移す前提で作っています。

## できること

- HTTPS の URL(CloudFront)で、アプリにアクセスできる(入口は CloudFront だけで、NLB には直接届かない)
- Pod から、NAT Gateway と固定 EIP を通ってアウトバウンド通信できる
- kubectl で、サンプルの Slack アプリ(署名検証、メンション返信)をデプロイできる
- 全 Pod のログが CloudWatch Logs に転送され、30 日間残る
- image を置く ECR がある(リポジトリは複数指定できる)
- deployer ロール(既定は `eks-exp-deployer`)で、image の push とデプロイができる

## 2 つのロール

| 役割 | 誰 | ロール | 作る人 | できること |
| --- | --- | --- | --- | --- |
| builder | 環境を作る人 | `tf-builder` | マネージャー | terraform の apply と destroy |
| deployer | アプリ開発者 | `eks-exp-deployer` | terraform | ECR への push、namespace `app` の admin、クラスタ全体の読み取り |

## 最短手順

マネージャーが、builder のロールを 1 回作ります。

```bash
bootstrap/attach-builder-policy.sh <builder の個人ロール名>   # 例: cli-fl-taro.yamada
# 共有の作業ロールを新設する場合は bootstrap/create-builder-role.sh <builder の ARN>
```

builder が、state バケットを作って terraform を回します。

```bash
bootstrap/create-state-bucket.sh
cd terraform
terraform init -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
terraform apply
terraform output
```

deployer は、`docs/deployer.md` の手順で image を push してデプロイします。
役割ごとの実施コマンドを順に並べた一覧は `docs/runbook.md` にあります。

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

- 名前の元になる語は、今は `eks-exp` です。deployer ロールの名前も `cluster_name` から決まります。
  クラスタ、ロール、NLB、バケット、タグ、ポリシー JSON に接頭辞として入っています。
- 変えるときは、次の 3 手順を踏みます。
  1. terraform の変数 `cluster_name` を変えます。
  2. `scripts/render-policy.sh <名前>` で、builder のポリシー JSON を作ります。
  3. 以後のスクリプトは `PROJECT=<名前>` を付けて実行します。
- NLB の名前は 32 文字までです。稼働後に変えると、terraform が作り直します。

## ディレクトリ構成

```
terraform/   EKS、ネットワーク、NLB、ECR、deployer ロールの terraform
bootstrap/   マネージャーが実行するスクリプトと builder のポリシー JSON
scripts/     destroy 前の確認と残骸の検査(実験用)
app/         サンプルアプリの Dockerfile と manifest
docs/        解説、権限、申請文、実験ログ、設計、計画
```

## 文書の案内

- `docs/practice.md`: 1 人で 3 役を演じて作成から撤去まで通す練習手順
- `docs/runbook.md`: マネージャー、builder、deployer が打つコマンドを役割別に順に並べた一覧
- `docs/guide.md`: IAM と Kubernetes を知らない人向けの解説と、手順の詳細
- `docs/deployer.md`: アプリ開発者が最初に読む手順書(雛形は `docs/deployer.md.tmpl`)
- `docs/permissions.md`: builder と deployer の権限、検証で見つかった Action
- `docs/request.md`: マネージャーへの申請文のたたき台
- `docs/experiment-log.md`: 各段の実験ログ
- `docs/design.md`: 設計と判断の記録
- `docs/plan.md`: 実装の計画
