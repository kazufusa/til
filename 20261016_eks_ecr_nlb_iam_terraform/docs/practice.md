# 通しの練習手順(個人アカウント)

会社で行う流れを、個人アカウントで最初から最後まで再現する手順です。
会社には builder と開発者の個人ロールが最初からありますが、個人アカウントには無いので、
空のロールを 2 つ作って代役にします。それ以外は会社と同じコマンドです。
所要時間は 1 時間強で、費用は 0.3 USD ほどです。

## 会社と練習の対応

| 会社 | 練習(個人アカウント) |
| --- | --- |
| builder の個人ロール `cli-fl-<名前>` | 空のロール `practice-builder-login`(信頼先は自分の SSO ロール) |
| マネージャーが IAM を作り権限を付ける | 自分が管理者権限で `setup-iam.sh practice-builder-login` と `attach-deployer-policy.sh practice-developer-login` |
| builder はログインしたまま terraform | `builder` プロファイルで `practice-builder-login` にスイッチして terraform |
| 開発者の個人ロール | 空のロール `practice-developer-login` |
| builder が開発者の ARN を terraform に書く | `-var 'deployer_role_arns=["<開発者役の ARN>"]'` で apply |
| 開発者がログインしたまま deploy | `dev-login` プロファイルで開発者役にスイッチして deploy |

代役のロールは権限ゼロで作ります。builder 役の権限は `setup-iam.sh` が付けたものだけ、
開発者役の権限は `attach-deployer-policy.sh` と Access Entry で付けたものだけになり、会社と同じ条件で試せます。

## 前提

- `aws sso login` 済みで、`aws sts get-caller-identity` が通ること
- AWS 側に前回の残骸が無いこと(`scripts/check-leftovers.sh` が `RESULT: clean`)
- `~/.aws/config` に次の 2 つのプロファイルがあること

```ini
[profile builder]
role_arn       = arn:aws:iam::<ACCOUNT_ID>:role/practice-builder-login
source_profile = default
region         = ap-northeast-1
[profile dev-login]
role_arn       = arn:aws:iam::<ACCOUNT_ID>:role/practice-developer-login
source_profile = default
region         = ap-northeast-1
```

## 手順

| # | 役 | やること | 目安 |
| --- | --- | --- | --- |
| 1 | マネージャー | 空のロール `practice-builder-login` と `practice-developer-login` を作る(信頼先は自分の SSO ロール) | 1 分 |
| 2 | マネージャー | `bootstrap/setup-iam.sh practice-builder-login`、`bootstrap/attach-deployer-policy.sh practice-developer-login` | 1 分 |
| 3 | builder | `aws sts get-caller-identity --profile builder` でスイッチ確認。`aws iam create-role` が拒否されることも確認 | 1 分 |
| 4 | builder | `AWS_PROFILE=builder bootstrap/create-state-bucket.sh` | 1 分 |
| 5 | builder | `terraform init`(`profile=builder` とバケット名を引数で渡す) | 1 分 |
| 6 | builder | `terraform apply -var aws_profile=builder -var 'deployer_role_arns=["<開発者役の ARN>"]'` | 20 分 |
| 7 | builder | `terraform output` を見る。`scripts/render-deployer-doc.sh` で developer ページを生成して読む | 2 分 |
| 8 | deployer | `aws sts get-caller-identity --profile dev-login` で開発者役になっていることを確認(スイッチ先のロールは無い) | 1 分 |
| 9 | deployer | ECR にログイン、`docker build`、`docker push`(`--profile dev-login`) | 3 分 |
| 10 | deployer | `update-kubeconfig`(`--alias` と `--user-alias`)、manifest を `apply -n app`、`rollout status` | 2 分 |
| 11 | deployer | 確認: HTTPS の URL、`/news`、NLB に外から届かない、`kubectl get nodes`、`kubectl logs`、CloudWatch のログ | 5 分 |
| 12 | builder | `scripts/preflight-destroy.sh` → `terraform destroy -var aws_profile=builder -var 'deployer_role_arns=[...]'` | 20 分 |
| 13 | builder | `bootstrap/delete-state-bucket.sh` | 1 分 |
| 14 | マネージャー | `bootstrap/teardown-iam.sh practice-builder-login`、空のロール 2 つを削除、`scripts/check-leftovers.sh` | 2 分 |

会社では 1 と 14 の空ロールの作成と削除が無く、3 と 8 のスイッチも不要です。
そのため builder の `AWS_PROFILE=builder` と `-backend-config="profile=builder"` と
`-var aws_profile=builder` も付けません。
開発者も会社では `--profile dev-login` を付けず、ログインしたまま打ちます。
会社では `variables.tf` の `allowed_account_ids` にアカウント ID を書きます(この練習では空のまま)。

## 各手順の合格の目安

| # | 期待する出力 |
| --- | --- |
| 1 | `aws iam list-attached-role-policies` がどちらのロールも空 |
| 2 | ロール `eks-exp-cluster`、`eks-exp-node` とポリシー 2 つができ、`practice-builder-login` に 4 つ、`practice-developer-login` に 1 つ並ぶ |
| 3 | `assumed-role/practice-builder-login/...`。`create-role` は AccessDenied |
| 4 | `created: tfstate-<ACCOUNT_ID>-eks-exp` |
| 5 | `Terraform has been successfully initialized!` |
| 6 | `Apply complete!`。`not authorized` が無い。Access Entry が開発者役の ARN で 1 つできている |
| 7 | 生成したページに `{{` が残っていない |
| 8 | `assumed-role/practice-developer-login/...` |
| 9 | `docker push` が完了し、`aws ecr describe-images` に `v1` |
| 10 | `deployment "web" successfully rolled out` |
| 11 | HTTPS で `hello from eks-exp`、`/news` に日本語の見出し、NLB の直叩きは失敗、`get nodes` でノード 1 台が `Ready` |
| 12 | `Destroy complete!` |
| 13 | `deleted bucket: ...` |
| 14 | ロール 2 つとポリシー 2 つが `NoSuchEntity`、`RESULT: clean`(タグ索引の遅れで数件残って見えることがある) |
