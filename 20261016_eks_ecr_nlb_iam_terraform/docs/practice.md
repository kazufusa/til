# 通しの練習手順(個人アカウント)

移植前に、1 人で 3 役(マネージャー、builder、deployer)を順に演じて、作成から撤去までを通す手順です。
コマンドの詳細は `docs/runbook.md`、値の意味は `docs/guide.md` にあります。
所要時間は 1 時間弱で、費用は 0.3 USD ほどです。

## 前提

- `aws sso login` 済みで、`aws sts get-caller-identity` が通ること
- AWS 側に前回の残骸が無いこと(`scripts/check-leftovers.sh` が `RESULT: clean`)
- 個人アカウントでは、ログイン直後のロールは許可セット共用の `AWSReservedSSO_...` です。
  会社の個人ロール(`cli-fl-<名前>`)に相当します

## 手順

| # | 役 | やること | 目安 |
| --- | --- | --- | --- |
| 1 | マネージャー | 個人アカウントでは省略。ログイン用のロール(`AWSReservedSSO_...`)が管理者権限を持っており、会社の個人ロールに権限を付けた後の状態に相当する | 0 分 |
| 2 | builder | 省略。スイッチは不要で、ログインした権限のまま打つ(`aws sts get-caller-identity` で `AWSReservedSSO_...` を確認) | 0 分 |
| 3 | builder | `bootstrap/create-state-bucket.sh` | 1 分 |
| 4 | builder | `terraform init`(バケット名を引数で渡す) | 1 分 |
| 5 | builder | `terraform plan` → `terraform apply`(48 資源) | 15 分 |
| 6 | builder | `terraform output` を見る。`scripts/render-deployer-doc.sh` で developer ページを生成して読む | 2 分 |
| 7 | deployer | `~/.aws/config` の `deployer` プロファイルの `role_arn` を output の値にして、スイッチ確認 | 2 分 |
| 8 | deployer | ECR にログイン、`docker build`、`docker push` | 3 分 |
| 9 | deployer | `update-kubeconfig`(`--alias` と `--user-alias`)、manifest を `apply -n app`、`rollout status` | 2 分 |
| 10 | deployer | 確認: HTTPS の URL、`/news`、`kubectl get nodes`、`kubectl logs`、CloudWatch のログ | 5 分 |
| 11 | builder | `scripts/preflight-destroy.sh` → `terraform destroy`(48 資源) | 15 分 |
| 12 | builder | `bootstrap/delete-state-bucket.sh` → `scripts/check-leftovers.sh`(残骸ゼロ) | 2 分 |
| 13 | マネージャー | 省略(付けていないので外すものがない) | 0 分 |

## 会社との違い

会社では、個人ロールに権限を付ける手順が増えます。それ以外は同じです。

| # | 個人アカウント(練習) | 会社 |
| --- | --- | --- |
| 1 | 省略(ログイン用ロールが管理者) | マネージャーに `attach-builder-policy.sh <自分の個人ロール名>` を頼む |
| 2 | 省略 | 省略(スイッチ不要) |
| 13 | 省略 | マネージャーに `detach-builder-policy.sh <自分の個人ロール名>` を頼む |

個人アカウントは管理者権限で動くため、この練習では「権限が足りるか」は確かめられません。
権限の検証は `docs/history/experiment-log.md` のとおり、`tf-builder` ロールで済んでいます。

## 各手順の合格の目安

| # | 期待する出力 |
| --- | --- |
| 1 | (省略) |
| 2 | `assumed-role/AWSReservedSSO_.../<自分の名前>` |
| 3 | `created: tfstate-<ACCOUNT_ID>-eks-exp` |
| 4 | `Terraform has been successfully initialized!` |
| 5 | `Apply complete! Resources: 48 added, 0 changed, 0 destroyed.` |
| 6 | 生成したページに `{{` が残っていない |
| 7 | `assumed-role/eks-exp-deployer/...` |
| 8 | `docker push` が完了し、`aws ecr describe-images` に `v1` |
| 9 | `deployment "web" successfully rolled out` |
| 10 | HTTPS で `hello from eks-exp`、`/news` に日本語の見出し、`get nodes` でノード 1 台が `Ready` |
| 11 | `Destroy complete! Resources: 48 destroyed.` |
| 12 | `RESULT: clean`(削除直後はタグ索引の遅れで数件残って見えることがある) |
| 13 | (省略) |
