# 移植ガイド

このディレクトリの成果を、会社のリポジトリと dev 環境へ持っていく手順です。
順番どおりに進めれば、設定の見落としなく移せます。

## 1. コピーするもの

| コピーする | 役目 |
| --- | --- |
| `terraform/` | 環境を作る本体。そのまま使う |
| `bootstrap/` | マネージャーに渡すスクリプトと権限 JSON |
| `scripts/` | builder の補助(残骸チェック、destroy 前チェック、developer ページ生成、名前置換) |
| `app/` | サンプルアプリ。自分のアプリに差し替えてよい |
| `README.md`、`docs/`(`history/` と `practice.md` を除く) | 文書 |

コピーしないもの: `docs/history/`(この実験の経緯)、`docs/practice.md`(個人アカウント向けの練習)、
`.terraform/`、`*.tfstate*`、`bootstrap/rendered/`。

## 2. 変える値

| 場所 | 値 | 決め方 |
| --- | --- | --- |
| `terraform/variables.tf` の `cluster_name` | 環境の名前(例: `dev-web`) | 2〜20 文字、英小文字と数字とハイフン。全資源の接頭辞になる |
| `terraform/variables.tf` の `region`、`terraform/backend.tf` の `region` | リージョン | 両方を同じ値にする |
| `terraform/variables.tf` の `allowed_account_ids` | 構築先のアカウント ID | `["123456789012"]` の形で直書きする。別のアカウントでは plan の段階で止まる |
| `terraform/variables.tf` の `ecr_repository_names` | ECR の名前 | サービスごとに 1 つ |
| `terraform/variables.tf` の `log_retention_days` | ログの保存日数 | dev は 30 日 |
| `terraform/variables.tf` の `node_count` | ノード数 | dev は 1 |

名前を変えたら、`scripts/render-policy.sh <名前>` を実行します。
`bootstrap/rendered/<名前>/` に、名前を置き換えた JSON 3 枚とスクリプト 2 本がそろいます。
マネージャーに渡すのはこのフォルダです。

## 3. 自分の権限を頼む

自分のロール名を調べます。

```bash
aws sts get-caller-identity --query Arn --output text
# arn:aws:sts::<ACCOUNT_ID>:assumed-role/<ここがロール名>/<セッション名>
```

`docs/request.md` の文面で、マネージャーに `setup-iam.sh <ロール名>` の実行を頼みます。
渡すのは `bootstrap/rendered/<名前>/` の中身です。
実行すると、ロール 3 つとポリシー 2 つができ、自分の個人ロールに権限が付きます。
付くのは AWS 管理ポリシー 3 つと `<名前>-builder-policy` で、内容は `docs/permissions.md` にあります。

## 4. 作る

`docs/runbook.md` の builder の手順どおりに進めます。

```bash
PROJECT=<名前> bootstrap/create-state-bucket.sh
cd terraform
terraform init -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-<名前>"
terraform apply
terraform output
```

apply は 15〜20 分です。

## 5. 最初の apply で確認すること

この実験で検証済みでも、名前やリージョンが変わると差が出る点です。

| 確認 | 方法 |
| --- | --- |
| AccessDenied が出ない | apply のログに `not authorized to perform` が無い。出たら JSON に足し、マネージャーに付け直してもらう(`docs/permissions.md`) |
| HTTPS の URL が応答する | `curl -s $(terraform output -raw https_url)` |
| Pod から外に出られる | `curl -s $(terraform output -raw https_url)news` |
| NLB に外から届かない | `curl --max-time 8 http://$(terraform output -raw nlb_dns_name)/` が失敗する(内部向け NLB) |
| ログが届く | `aws logs tail /aws/containerinsights/<名前>/application --since 10m` |
| 戻せる | `scripts/preflight-destroy.sh` → `terraform destroy` → `PROJECT=<名前> scripts/check-leftovers.sh` |

## 6. 開発者に渡す

```bash
scripts/render-deployer-doc.sh terraform docs/deployer.md
```

値が埋まった `docs/deployer.md` を渡します。会社のリポジトリ(private)なら、そのまま commit して構いません。
開発者を足すときは、`scripts/set-deployers.sh <ARN> ...` に全員分の ARN を渡します。terraform は触りません。

## 7. 本番へ持っていくとき(dev の後)

| 項目 | dev | 本番で検討 |
| --- | --- | --- |
| ノード数 | 1 | 2 以上(2 AZ に分散) |
| NAT Gateway | 1 台 | AZ ごと |
| ログ保存 | 30 日 | 90 日以上 |
| HTTPS | CloudFront の既定ドメイン | ACM 証明書と独自ドメイン |
| EKS の API エンドポイント | パブリック | 社内 IP に限定 |
| builder の権限 | 管理ポリシー 3 つ + 自作 1 つ(IAM は作れない) | 共有アカウントなら最小権限版(`docs/permissions.md` の付録) |

詳細は `docs/permissions.md` の「本番で追加を検討する対策」にあります。
