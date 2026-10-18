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

## 第 3 段 deployer の境界確認

### 再構築

builder で apply を流し直しました。
追加は 39 リソースで、AccessDenied は 1 件も出ませんでした。
前回までに確定した権限だけで通ったので、新しい権限の追加はありません。
所要時間は十数分でした。EKS クラスターの作成が約 8 分半、ノードグループが約 2 分、NLB が約 3 分です。

### AWS 側の境界

deployer の profile で 5 つの操作を試すと、すべて拒否されました。

| 操作 | 結果 |
| --- | --- |
| ec2 describe-instances | UnauthorizedOperation |
| eks list-clusters | AccessDenied |
| ecr create-repository | AccessDenied |
| iam list-roles | AccessDenied |
| elbv2 describe-load-balancers | AccessDenied |

`eks describe-cluster` だけは通り、`ACTIVE` が返りました。

### Kubernetes 側の境界

権限は、namespace `app` の `AmazonEKSAdminPolicy` と、クラスター全体の `AmazonEKSViewPolicy` です。
`auth can-i` の結果は次のとおりでした。

| 確認 | 期待 | 結果 |
| --- | --- | --- |
| app で create deployments | yes | yes |
| app で create services | yes | yes |
| app で delete pods | yes | yes |
| app で create rolebindings | yes | yes |
| list nodes | yes | no |
| list namespaces | yes | yes |
| kube-system で list pods | yes | yes |
| create namespaces | no | no |
| kube-system で delete pods | no | no |
| kube-system で get secrets | no | no |
| app で update resourcequotas | no | no |
| app で delete namespaces | no | no |

期待と違ったのは `list nodes` だけです。
`kubectl get nodes` も Forbidden になり、終了コードは 1 でした。
`AmazonEKSViewPolicy` は、ノードの参照を含まないことが分かりました。
ノードを見せたい場合は、別の ClusterRole を deployer のグループに結び付ける必要があります。

### quota による拒否

app で Deployment を作る操作は通りました。
`type=LoadBalancer` の Service を作ろうとすると、次のとおり拒否されました。

```
exceeded quota: no-cloud-resources, requested: services.loadbalancers=1, used: services.loadbalancers=0, limited: services.loadbalancers=0
```

確認に使った Deployment は、その後で削除しました。

### 確認時の落とし穴

builder 用の context を `update-kubeconfig` で作ると、deployer の context も builder の認証を使うようになりました。
2 つの context が、同じ user エントリを共有するためです。
このとき `auth can-i` はすべて yes を返し、権限が広すぎるように見えました。
`kubectl auth whoami` でユーザーを確かめ、deployer の profile で作り直してから、上の表を取り直しました。

### サンプルアプリの再配備

ECR リポジトリは作り直されていたので、イメージを build し直して push しました。
deployer の権限だけでマニフェストを適用でき、rollout も完了しました。
NLB の URL に curl すると、1 回目で `hello from eks-exp` が返りました。
環境は稼働したままです。

### 第 3 段の追補: get nodes

deployer が `kubectl get nodes` を実行すると、Forbidden になっていました。
AmazonEKSViewPolicy は Kubernetes の view ClusterRole に対応します。
view は namespace 内の資源だけを対象にし、クラスタ直下の nodes を含みません。

そこで、nodes の get・list・watch だけを許す ClusterRole を terraform で追加しました。
deployer の access entry には Kubernetes グループ app-deployers を設定し、
このグループに ClusterRoleBinding で ClusterRole を結び付けています。
access entry は作り直しにならず、policy association も維持されました。
plan は 2 add、1 change、0 destroy で、builder の権限不足はありませんでした。

deployer の profile で確認した結果は次のとおりです。

| 確認 | 結果 |
| --- | --- |
| auth whoami | app-deployer のロールと、グループ app-deployers が表示された |
| get nodes | 1 ノードが Ready で、終了コード 0 |
| auth can-i list nodes | yes |
| auth can-i delete nodes | no |
| kube-system で auth can-i get secrets | no(変更なし) |
| get namespaces | 一覧を取得できた |

確認時の落とし穴は、前節と同じく user エントリの共有です。
`update-kubeconfig` に `--user-alias` を付けないと、profile ごとの認証が上書きされます。
`--alias eks-exp-deployer --user-alias eks-exp-deployer` のように、
context と user の両方に別名を付けると、profile が混ざりません。

## 片付けと検証周回

### 旧環境の destroy

名前の一元化の前に作った環境(クラスター名 eks-exp)を、粗い権限の builder で destroy しました。
粗い権限とは、AWS 管理ポリシー 3 つとカスタムポリシーを組み合わせた構成です。
結果は 41 リソースの削除で、AccessDenied は 1 件も出ませんでした。
権限の追加はありません。所要時間は約 12 分 40 秒でした。
内訳は、ノードグループが約 8 分、EKS クラスターが約 3 分、NAT ゲートウェイが約 1 分、NLB が約 30 秒です。

state 用バケットを削除し、作り直し、もう一度削除する往復は、記録が残っていないため未確認です。
バケットの削除そのものは、後述の eks-exp2 の片付けで確認できました。
バージョニングされた 16 個のオブジェクトを消してから、バケットが削除されています。

### 名前を変えた周回

名前の一元化が効いているかを確かめるため、cluster_name を eks-exp2 にして最初から作り直しました。
変わった名前は次のとおりです。
cluster_name だけを渡して、残りは派生しました。

| 対象 | 旧 | 新 |
| --- | --- | --- |
| クラスター | eks-exp | eks-exp2 |
| 付随するロール | eks-exp-* | eks-exp2-* |
| deployer ロール | eks-exp-deployer | eks-exp2-deployer |
| state バケット | tfstate-(アカウント)-eks-exp | 同 eks-exp2 |
| タグ Project | eks-exp | eks-exp2 |

builder のカスタムポリシーは render-policy.sh で eks-exp2 向けに描画し直しました。
新しい名前のまま、AccessDenied は apply でも destroy でも 0 件でした。

### apply

apply は 42 リソースの追加で、所要時間は約 10 分 30 秒でした。
内訳は、EKS クラスターが約 8 分、NAT ゲートウェイが約 2 分、ノードグループが約 2 分です。
NLB は約 2 分 40 秒、CloudFront は約 2 分 50 秒でした。

### 動作確認

deployer のロールに切り替えて、ECR への push から確認しました。

| 確認 | 結果 |
| --- | --- |
| docker push | ECR に v1 を push できた |
| get nodes | 1 ノードが Ready |
| Deployment の rollout | 成功 |
| NLB への HTTP | 応答に hello from eks-exp が含まれた |
| CloudFront への HTTPS | 1 回目の確認で成功 |
| CloudFront への HTTP | 301 Moved Permanently |
| app で Secret を作成、参照、削除 | すべてできた |
| kube-system の Secret 一覧 | Forbidden |

HTTPS は、NLB の確認が済んだ時点で既に配信されていました。
待ち時間は発生していません。

Secret は、自分の namespace では admin 権限で扱えます。
他の namespace では、AmazonEKSViewPolicy が Secret を含まないため参照できません。
この結果に合わせて、deployer.md と permissions.md の Secret の行を書き直しました。

引き渡し用の文書は、実環境の output から render-deployer-doc.sh で生成できました。
未置換のプレースホルダーは 0 件です。

### destroy と残骸の確認

preflight は、LoadBalancer の Service も PVC もないことを確認して通りました。
destroy は 42 リソースの削除で、所要時間は約 12 分 45 秒でした。
CloudFront の削除が約 2 分 40 秒、ノードグループが約 8 分、EKS クラスターが約 3 分です。

直後の check-leftovers.sh は、タグ検索で NAT ゲートウェイとサブネットを残骸として報告しました。
EC2 を直接調べると、NAT ゲートウェイは deleted 状態で、サブネットも VPC も SG もありません。
タグ検索の索引に、削除済みの資源が遅れて残っているだけです。
旧環境の名前でも、同じ索引の遅れが数時間後まで残っていました。
サービスごとの確認は、すべて ok でした。

そのあと、state 用バケットと tf-builder のロールとポリシーを削除しました。
builder のポリシーからは、旧名の撤去用に置いた Legacy の 3 文も外しました。
最終状態は、state 用バケットが 0 個、tf-builder が 0 件です。
kubeconfig の eks-exp と eks-exp2 のエントリも消しました。

### 費用の見積もり

構成のうち時間課金が支配的なのは、EKS コントロールプレーンと NAT ゲートウェイと NLB、ノードです。
合計はおよそ 0.24 USD/時間です。
環境が存在していた時間は、ログとコミットの時刻から次のように見積もりました。

| 周回 | 存在していた時間 |
| --- | --- |
| 第 1 段の環境(放置を含む) | 約 20 時間 |
| 第 2 段の再構築から旧環境の destroy まで | 約 1.7 時間 |
| eks-exp2 の apply 開始から destroy 完了まで | 約 0.4 時間 |

合計は約 22 時間です。
22 時間 × 0.24 USD/時間 ≈ 5.3 USD で、およそ 5 USD になります。
時間の内訳は時刻からの概算なので、誤差は 1 USD 程度です。
データ転送と CloudFront、ECR の保管料は、この規模では無視できる額でした。

## 最終検証周回

縮約したポリシー、ログ転送、CloudFront 専用の入口、複数 ECR の変数、
Slack と news のサンプルアプリを、既定の名前 eks-exp で 1 周まとめて確かめました。
管理者でビルダーのロールを作り直し、ポリシーの Statement が 14 個あることを確認してから始めました。

### EIP の読み取り権限の欠落

最初の apply は約 42 分かかり、失敗しました。
ポリシーを縮約したときに ec2:Describe* を外しましたが、
EIP の作成直後に呼ばれる ec2:DescribeAddressesAttribute は AmazonVPCFullAccess にもありません。
プロバイダーが読み取りを繰り返して先へ進まず、NAT と private ルートができませんでした。
ノードは出口がないまま起動し、ノードグループが NodeCreationFailure になりました。

Action を追加してロールを更新し、2 回目の apply で約 7 分で完了しました。
12 個を追加し、2 個を作り直しています。
再発を防ぐために、ノードグループが private ルートテーブルの関連付けを待つ依存も足しました。
実験で見つかった権限は、これで 3 件になりました。

### 間欠的な 504

HTTPS で /news を繰り返すと、12 回に 1 回ほど 30 秒待って 504 になりました。
NLB のクロスゾーン負荷分散が無効で、ノードのいない AZ の入口に当たると、
接続が先へ進まないためです。
有効にして適用すると、40 回続けて 200 が返りました。

### 確認した項目

- a 根のパスが hello from eks-exp を返す
- b /news が NHK の見出し 5 件を JSON で返す(外向き通信の証明)
- c /slack/events が challenge の値をそのまま返す
- d HTTP は 301 で HTTPS へ転送される
- e NLB の DNS 名へ直接つなぐと応答がなく、8 秒で打ち切りになる(CloudFront 専用の証明)
- f ノードは 1 台が Ready で、Pod のログが読める
- g ログ転送のアドオンは ACTIVE で、4 つのロググループの保存期間が 30 日になっている
- g deployer はアプリのログを読め、無関係なロググループは AccessDenied になる
- h deployer 向けの文書を描画すると、置換し忘れが 0 件になる

ログの検索では、件数だけを指定した filter-log-events が空のページを返しました。
時刻の指定か最大件数の指定を使うと、行が返ります。
文書に載せている aws logs tail は、そのまま動きます。

### 後片付けと費用

destroy は約 12 分で 48 個を削除し、AccessDenied はありませんでした。
状態バケットとビルダーのロールも消し、残りがないことを確認しました。
この周回の追加費用は、約 0.3 USD です。
