# 実験ログ

## 第 0〜1 段(2026-10-17 実施)

マネージャー役のユーザーが `create-builder-role.sh` を実行し、`tf-builder` を作りました。
`aws-reserved` パス付きの SSO ロール ARN は、信頼ポリシーの Principal として拒否されませんでした。
そのため、`root` と `PrincipalArn` 条件に切り替える代替案は使っていません。
2 回目の実行は `updated` で成功し、スクリプトが冪等であることも確認できました。

以降の AWS 操作は、すべて `builder` と `deployer` で行いました。
`builder` に切り替えた後は管理者権限が外れており、`sso-admin list-instances` は AccessDenied になりました。
`iam list-users` は成功します。`ReadOnlyDiscovery` に `iam:List*` を含めているためで、手順書の期待値が誤っていました。

state バケットの作成と 2 回目の再実行は、builder で AccessDenied なく通りました。
`init` と `plan` も通り、plan は 38 個の追加でした。
`deployer_trusted_principals` は、実行者の帽子である `tf-builder` になりました。

### 足りなかった Action

| 回 | Action | 追加先の Sid | 発生した操作 |
| --- | --- | --- | --- |
| 1 | `ec2:GetSecurityGroupsForVpc` | `ReadOnlyDiscovery` | セキュリティグループ付き NLB の作成 |

`ec2:Describe*` では `GetSecurityGroupsForVpc` を含められません。
1 回目の apply は 38 個中 36 個を作った時点で止まりました。
Action を足して管理者がロールを更新した後、2 回目の plan は 2 個の追加になり、apply が完了しました。
追加した Action は 1 件だけで、7b の繰り返しは 1 回でした。

### 所要時間

1 回目の apply では、EKS クラスターに約 8 分半、NAT ゲートウェイに約 2 分、ノードグループに約 2 分かかりました。
NLB の作成には約 2 分半かかりました。
2 回目の apply が終わってから第 1 段の確認を始めるまで、環境は十数時間放置されていました。
その間の費用は、片付け時に確認します。

### 疎通結果

- 2 回目の apply 直後の target は 1 台で `unhealthy` でした。Pod がまだ無かったためです。
- `app-deployer` の assume は、`source_profile = builder` の 2 段重ねで成功しました。
- deployer で ECR にログインし、`v1` を push できました。
- `get nodes` は Forbidden になり、`no-cloud-resources` の quota も見えました。
- rollout は成功し、Service は `80:30080/TCP` になりました。
- 少し待つと target は `healthy` になり、NLB 経由の curl は `hello from eks-exp` を返しました。
- Pod から見た外向き IP は NAT ゲートウェイの IP と一致しました。

回避策は使っていません。
kubernetes provider の接続エラーも起きず、NLB の代替ルール(VPC CIDR からの許可)も不要でした。

## 第 2 段(2026-10-18 実施)

builder の権限だけで destroy し、残骸が無いことを確認しました。

### 負の対照

- `app` namespace で `LoadBalancer` の Service を作ると、`no-cloud-resources` の quota に拒否されました。
- `default` namespace では、同じ Service が作れてしまいました。
- destroy 前の確認スクリプトは、その Service を検出して異常終了しました。
- Service と Deployment を消すと、確認スクリプトは通りました。

### destroy の 2 回

1 回目の destroy は、38 個のうち 37 個を消して止まりました。
止まったのは EIP で、`ec2:DisassociateAddress` が許可されていなかったためです。
この Action を `Network` の Statement に追加し、ロールのポリシーを更新して、2 回目の destroy を実行しました。
2 回目は EIP の 1 個だけを消し、約 1 秒で終わりました。

apply では EIP を関連付けるだけなので、この権限は不要でした。
関連付けの解除は、NAT ゲートウェイを消した後の EIP 解放で初めて呼ばれます。
apply では、destroy にだけ必要な権限は見つかりません。
権限の不足を洗い出すには、builder で destroy まで通す必要があります。

### 所要時間

1 回目の destroy は、全体で十数分かかりました。
内訳は、ノードグループが約 8 分、EKS クラスターが約 3 分、NAT ゲートウェイが約 1 分半、NLB が約 30 秒です。
1 回目が止まった時点で、EKS、ノード、NAT、NLB はすでに消えていました。
計算資源の費用は、そこで終わっています。

### 残骸の確認

確認スクリプトで、次の結果になりました。

- EKS、ECR、ロードバランサー、ターゲットグループ、Auto Scaling グループ、NAT ゲートウェイ、EIP は `ok` でした。
- VPC、セキュリティグループ、ログ group、タグ `Project=eks-exp` のリソースも `ok` でした。
- 残ったのは、IAM ロール `tf-builder` と IAM ポリシー `tf-builder-policy` だけです。
- state バケットも残っています。

3 つとも、実験の土台として意図して残したものです。
片付けの手順で、最後に消します。

kubeconfig の `eks-exp-deployer` と `eks-exp-builder` の context、cluster、user も削除しました。
