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

ネットワーク、ロードバランサ、ECR は AWS 管理ポリシーをそのまま使います。
EKS は全権です。
自分でロールを作る権限は名前で縛ってあり、管理者権限を付けることはできません。

カスタムポリシーの 6 項目は次のとおりです。

1. EKS の全操作(`eks:*`)
2. CloudFront の作成、更新、削除、タグ(HTTPS の入口用)
3. IAM ロールは名前が `<名前>-*` のものだけ作成と削除ができ、
   付けられるポリシーは EKS 用の AWS 管理ポリシー 4 つと `<名前>-deployer-policy` に限る。
   `AdministratorAccess` は付けられない
4. S3 は名前が `tfstate-*-<名前>` のバケットだけ作成、設定、削除、読み書き
5. 各サービスの参照(Describe、List、Get)
6. 実験で見つかった 2 つ: `ec2:GetSecurityGroupsForVpc`(NLB 作成時)、`ec2:DisassociateAddress`(EIP 解放時)

検証済みの最小権限の JSON は、`docs/permissions.md` の付録にあります。

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
