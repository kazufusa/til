# 通しの練習手順(個人アカウント)

会社で行う流れを、個人アカウントで最初から最後まで再現する手順です。
会社には builder と開発者の個人ロールが最初からありますが、個人アカウントには無いので、
空のロールを 2 つ作って代役にします。それ以外は会社と同じコマンドです。
所要時間は 1 時間弱で、費用は 0.3 USD ほどです。

## 会社と練習の対応

| 会社 | 練習(個人アカウント) |
| --- | --- |
| builder の個人ロール `cli-fl-<名前>` | 空のロール `practice-builder-login`(信頼先は自分の SSO ロール) |
| マネージャーが権限を付ける | 自分が管理者権限で `attach-builder-policy.sh practice-builder-login` |
| builder はログインしたまま terraform | `builder` プロファイルで `practice-builder-login` にスイッチして terraform |
| 開発者の個人ロール | 空のロール `practice-developer-login` |
| terraform が開発者に deployer ロールを許可 | `deployer_trusted_principals` にその ARN を渡す |
| 開発者が deployer ロールにスイッチして deploy | `dev-login` → `deployer` の 2 段スイッチ |

代役のロールは権限ゼロで作ります。builder 役の権限は attach で付けたものだけ、
開発者役の権限は terraform が許可した deployer ロールだけになり、会社と同じ条件で試せます。

## 前提

- `aws sso login` 済みで、`aws sts get-caller-identity` が通ること
- AWS 側に前回の残骸が無いこと(`scripts/check-leftovers.sh` が `RESULT: clean`)
- `~/.aws/config` に次の 3 つのプロファイルがあること

```ini
[profile builder]
role_arn       = arn:aws:iam::<ACCOUNT_ID>:role/practice-builder-login
source_profile = default
region         = ap-northeast-1
[profile dev-login]
role_arn       = arn:aws:iam::<ACCOUNT_ID>:role/practice-developer-login
source_profile = default
region         = ap-northeast-1
[profile deployer]
role_arn       = arn:aws:iam::<ACCOUNT_ID>:role/eks-exp-deployer
source_profile = dev-login
region         = ap-northeast-1
```

## 手順

| # | 役 | やること | 目安 |
| --- | --- | --- | --- |
| 1 | マネージャー | 空のロール `practice-builder-login` と `practice-developer-login` を作る(信頼先は自分の SSO ロール) | 1 分 |
| 2 | マネージャー | `bootstrap/attach-builder-policy.sh practice-builder-login` | 1 分 |
| 3 | builder | `aws sts get-caller-identity --profile builder` でスイッチ確認 | 1 分 |
| 4 | builder | `AWS_PROFILE=builder bootstrap/create-state-bucket.sh` | 1 分 |
| 5 | builder | `terraform init`(`profile=builder` とバケット名を引数で渡す) | 1 分 |
| 6 | builder | `terraform apply -var aws_profile=builder -var 'deployer_trusted_principals=["<開発者役の ARN>"]'`(48 資源) | 15 分 |
| 7 | builder | `terraform output` を見る。`scripts/render-deployer-doc.sh` で developer ページを生成して読む | 2 分 |
| 8 | deployer | `aws sts get-caller-identity --profile deployer` で `eks-exp-deployer` へのスイッチ確認 | 1 分 |
| 9 | deployer | ECR にログイン、`docker build`、`docker push` | 3 分 |
| 10 | deployer | `update-kubeconfig`(`--alias` と `--user-alias`)、manifest を `apply -n app`、`rollout status` | 2 分 |
| 11 | deployer | 確認: HTTPS の URL、`/news`、`kubectl get nodes`、`kubectl logs`、CloudWatch のログ | 5 分 |
| 12 | builder | `scripts/preflight-destroy.sh` → `terraform destroy -var aws_profile=builder`(48 資源) | 15 分 |
| 13 | builder | `bootstrap/delete-state-bucket.sh` → `scripts/check-leftovers.sh` | 2 分 |
| 14 | マネージャー | `bootstrap/detach-builder-policy.sh practice-builder-login`、空のロール 2 つを削除 | 1 分 |

会社では 1 と 14 の空ロールの作成と削除が無く、3 のスイッチも不要です。
6 の `deployer_trusted_principals` は、会社では `variables.tf` に書きます(private リポジトリのため)。

## 各手順の合格の目安

| # | 期待する出力 |
| --- | --- |
| 1 | `aws iam list-attached-role-policies` がどちらのロールも空 |
| 2 | `practice-builder-login` に 4 つ並ぶ |
| 3 | `assumed-role/practice-builder-login/...` |
| 4 | `created: tfstate-<ACCOUNT_ID>-eks-exp` |
| 5 | `Terraform has been successfully initialized!` |
| 6 | `Apply complete! Resources: 48 added, 0 changed, 0 destroyed.`。`not authorized` が無い |
| 7 | 生成したページに `{{` が残っていない |
| 8 | `assumed-role/eks-exp-deployer/...` |
| 9 | `docker push` が完了し、`aws ecr describe-images` に `v1` |
| 10 | `deployment "web" successfully rolled out` |
| 11 | HTTPS で `hello from eks-exp`、`/news` に日本語の見出し、`get nodes` でノード 1 台が `Ready` |
| 12 | `Destroy complete! Resources: 48 destroyed.` |
| 13 | `RESULT: clean`(削除直後はタグ索引の遅れで数件残って見えることがある) |
| 14 | `aws iam get-role` が両方とも `NoSuchEntity`、`tf-builder-policy` も無い |
