# 申請文のたたき台

マネージャーへの申請に貼り付けられる形でまとめます。
権限の中身は `docs/permissions.md` にあります。

## 依頼

依頼は 1 件です。
`create-builder-role.sh <自分の identity の ARN>` を実行して、ロール `tf-builder` を作ってください。
スクリプトは、AWS 管理ポリシー 3 つとカスタムポリシー 1 つをこのロールに付けます。

代案として、ロールを作らず、私の identity に同じポリシーを直接付けても構いません。

## 添付

- `create-builder-role.sh`
- `delete-builder-role.sh`
- `tf-builder-policy.json`(本文は、管理ポリシー 3 つと組み合わせるカスタム 1 つ)
- 付録として `tf-builder-policy.minimal.json`(管理ポリシーを使わない、検証済みの最小権限)

## 範囲の説明

このポリシーで作れるものは、ネットワーク、EKS、ECR、ELB、CloudFront、`<cluster_name>-*` の IAM ロールです。
IAM の対象は、資源名の接頭辞で限定しています。
次の 4 点を、あらかじめ説明します。

1. `iam:AttachRolePolicy` は `iam:PolicyARN` 条件で、付けられるポリシーを限っています。
   AWS 管理の EKS と ECR のポリシー 4 つと、deployer のポリシーだけです。
   builder が作るロールに `AdministratorAccess` は付けられません。
2. builder は deployer のポリシーの中身と、deployer ロールの信頼ポリシーを書き換えられます。
   この候補は厳密な境界ではありません。
3. 境界が必要な場合は、Permissions Boundary の付与をお願いします。
4. EC2 のネットワーク系 Action は Resource が `*` です。builder は自分が作っていない VPC も削除できます。

## 撤去

作業後に、私が terraform destroy を実行します。
ロールの削除は `delete-builder-role.sh` で行うので、マネージャーが削除しても構いません。

state 用のバケットは、付与された権限で私が作ります。
マネージャーは terraform を使えない前提なので、この依頼で使うのは aws コマンドのスクリプトだけです。

## 自分の ARN の調べ方

今ログインしている identity の ARN は、次のコマンドで見られます。

```bash
aws sts get-caller-identity --query Arn --output text
```

SSO でログインしている場合、ARN は次の形です。

```text
arn:aws:sts::<ACCOUNT_ID>:assumed-role/AWSReservedSSO_<名前>_<ハッシュ>/<ユーザー名>
```

依頼に書く ARN は、次のように直します。

```text
arn:aws:iam::<ACCOUNT_ID>:role/aws-reserved/sso.amazonaws.com/<リージョン>/AWSReservedSSO_<名前>_<ハッシュ>
```

`sts` を `iam` に、`assumed-role` を `role` に変えます。
末尾のユーザー名は落とし、ロール名の前に `aws-reserved/sso.amazonaws.com/<リージョン>/` を足します。
