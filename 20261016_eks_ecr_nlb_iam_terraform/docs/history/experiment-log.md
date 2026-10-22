# 実験ログ

この時点の名前 `app-deployer` は、後に `<cluster_name>-deployer` に変わりました。

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
`deployer_trusted_principals` は、実行者のロールである `tf-builder` になりました。

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
- VPC、セキュリティグループ、ロググループ、タグ `Project=eks-exp` のリソースも `ok` でした。
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
- h deployer はアプリのログを読め、無関係なロググループは AccessDenied になる
- i deployer 向けの文書を描画すると、置換し忘れが 0 件になる

ログの検索では、件数だけを指定した filter-log-events が空のページを返しました。
時刻の指定か最大件数の指定を使うと、行が返ります。
文書に載せている aws logs tail は、そのまま動きます。

### 後片付けと費用

destroy は約 12 分で 48 個を削除し、AccessDenied はありませんでした。
状態バケットとビルダーのロールも消し、残りがないことを確認しました。
この周回の追加費用は、約 0.3 USD です。

### 最終検証周回の後の変更

builder のポリシーで EKS の資源をクラスタ名で限定したことと、namespace に Pod Security の
ラベル(enforce は baseline)を付けたことは、次の周回で検証済みです(2026-10-19)。
詳細は「簡易版での再検証(現行コード)」にあります。

## 簡易版での再検証(現行コード)

2026-10-19 に、現行のコードを簡易版の builder(管理ポリシー 3 つと独自ポリシー)で再検証しました。
目的は、最終検証周回の後に入れた 2 つの変更が、apply と destroy を通ることの確認です。
変更の 1 つは、独自ポリシーで EKS の操作をクラスタ名で限定したことです。
もう 1 つは、namespace に Pod Security のラベルを付けたことです。

### 結果

apply は 48 リソースの追加で、所要時間は約 10 分でした。
内訳は、EKS クラスターが約 7 分半、CloudFront とロードバランサーが約 3 分、
NAT ゲートウェイが約 1 分半、ノードグループが約 2 分です。
AccessDenied は出ず、権限の追加もありませんでした。
EKS の限定に使ったクラスタ名の ARN パターンは、作成側で正しく働きました。

destroy は 48 リソースの削除で、所要時間は 12 分でした。
こちらも AccessDenied は出ませんでした。

### 確認した項目

- a 根のパスが hello from eks-exp を返す
- b /news が NHK の見出しを JSON で返す(外向き通信の証明)
- c /slack/events が challenge の値をそのまま返す
- d HTTP は 301 で HTTPS へ転送される
- e NLB の DNS 名へ直接つなぐと応答がなく、8 秒で打ち切りになる
- f ノードは 1 台が Ready で、Pod のログが読める
- g ログ転送のアドオンは ACTIVE で、4 つのロググループの保存期間が 30 日になっている
- h namespace のラベルは enforce が baseline で、特権 Pod は作成を拒否される
- i deployer は EC2 の参照と kube-system の Pod 削除ができない
- j deployer 向けの文書を描画すると、置換し忘れが 0 件になる

特権 Pod の拒否メッセージは、baseline の基準に反する特権コンテナだと示しました。
アプリ本体の Pod は baseline で受理され、restricted への違反は警告だけでした。

### 想定と違った点

deployer は EKS のアドオン一覧を読めません。設計どおりで、アドオンの状態は builder で確認しました。
存在しないロググループ名の前方一致で describe を呼ぶと、拒否されず空の一覧が返ります。
一覧の参照は許可されていますが、無関係なロググループの中身を読む操作は拒否されます。

### 後片付けと費用

状態バケットとビルダーのロールを削除し、残りはタグ索引の遅れだけでした。
この周回の追加費用は、約 0.3 USD です。

## 個人ロール直付け方式の再現(2026-10-20)

### 目的

会社の builder は、個人ロール `cli-fl-<名前>` にマネージャーが権限を付ける方式だと分かりました。
これまでの検証は、新設した `tf-builder` にスイッチする方式で行っています。
この周回では、`attach-builder-policy.sh` で既存のロールに付けた権限だけで
apply から destroy まで通ることと、開発者が自分のロールから deployer ロールに
スイッチして deploy できることを確かめます。

### 配役

| 会社 | 再現 |
| --- | --- |
| builder の個人ロール | 空のロール `practice-builder-login` |
| マネージャーの権限付与 | 管理者権限で `attach-builder-policy.sh practice-builder-login` |
| 開発者の個人ロール | 空のロール `practice-developer-login` |
| 開発者の deploy | `practice-developer-login` から `eks-exp-deployer` へスイッチ |

### 初期状態

- AWS 側は前回の撤去後で残骸なし
- 計画を書く前に、空のロール 2 つの作成と attach まで進めてしまったため、
  その時点を初期状態として記録します。`check-leftovers.sh` は `tf-builder-policy` だけを報告

### 手順と合否

`docs/practice.md` の 14 手に従います。合否の基準も同じ表に書いてあります。
apply と destroy は背景で実行し、15 分ごとの見張りと、開始 3 時間後の自動 destroy を仕掛けます。

### 結果

14 手すべて合格でした。所要時間は apply が 11 分、destroy が 12 分で、どちらも AccessDenied は 0 件です。
費用は約 0.3 USD です。

| # | 結果 |
| --- | --- |
| 1 | 空のロール 2 つを作成。どちらもポリシー 0 |
| 2 | `attach-builder-policy.sh` で builder 役にポリシー 4 つが付いた。既存のロールへの付与が動いた |
| 3 | `builder`、`dev-login` ともスイッチ成功。開発者役は VPC 参照が AccessDenied |
| 4 | state バケットを builder 役で作成 |
| 5 | init 成功 |
| 6 | 48 資源の追加。`deployer_trusted_principals` は開発者役の ARN を `-var` で渡した |
| 7 | developer ページの置換し忘れ 0 |
| 8 | 開発者役から `eks-exp-deployer` への 2 段スイッチ(SSO → 個人ロール → deployer)成功 |
| 9 | ECR へ `v1` を push |
| 10 | `app` namespace に deploy、rollout 完了。restricted の警告は出るが baseline で受理 |
| 11 | 公開 URL が応答、`/news` が NHK の見出しを返す、HTTP は 301、NLB 直叩きは 8 秒で打ち切り、ノード 1 台 Ready、Pod ログ、CloudWatch 4 群が 30 日、Secret は `app` で作成でき `kube-system` は forbidden |
| 12 | 48 資源の削除 |
| 13 | バケット削除。残骸チェックはタグ索引の遅れで 5 件を報告したが、直接参照すると NAT は deleted、subnet は NotFound、VPC は 0 |
| 14 | detach でポリシー 4 つを外して `tf-builder-policy` を削除、空のロール 2 つを削除。どちらも NoSuchEntity |

### 確かめられたこと

- 既存のロールに `attach-builder-policy.sh` で付けた権限だけで、apply から destroy まで通る
- 会社で builder が自分の個人ロールのまま terraform を回す形は、この権限で足りる
- 開発者は自分のロールから deployer ロールにスイッチすれば deploy できる。
  開発者のロール自体に権限は要らない

### 手順上の反省

計画を書く前に空のロール作成と attach まで進めてしまい、やり直しになりました。
次からは、計画の記録と見張りの用意を済ませてから最初のコマンドを打ちます。

## 第 2 期の設計での再検証(2026-10-20)

### 目的

移植先の設計変更(IAM はマネージャーが作る、NLB 内部化と VPC origin、アカウント固定)を入れたコードが、
IAM を作れない builder の権限で apply から destroy まで通ることを確かめます。
あわせて、`set-deployers.sh` で足した開発者が deployer ロールにスイッチして deploy できることと、
内部向け NLB に外から届かないことを確かめます。

### 手順と合否

`docs/practice.md` の 15 手に従います。配役は前回と同じく、空のロール 2 つを代役にします。
apply と destroy は背景で実行し、15 分ごとの見張りと、開始 3 時間後の自動 destroy を仕掛けます。

### 結果

3 周しました。1 周目は設計変更直後のコード、2 周目はレビュー対応後のコード(途中で NLB の SG の不具合を発見して修正)、
3 周目は最終のコード(3eefd09)でゼロから通しました。3 周目の結果は次のとおりです。

| 本番行動 | 結果 |
| --- | --- |
| 1 マネージャー `setup-iam.sh` | ロール 3 つとポリシー 2 つができ、builder の個人ロール(代役)に 4 つが付いた |
| 2 builder | スイッチ成功。`create-role` と `create-policy` は AccessDenied。state バケット作成 |
| 3 builder apply | 39 資源、16 分、AccessDenied 0。VPC origin の作成に約 10 分 |
| 4 builder output | 11 個の値。developer ページの置換し忘れ 0 |
| 5 builder `set-deployers.sh` | 信頼先が builder 役 + 開発者役の 2 つになった。builder は deployer ロールにポリシーを付けられない(AccessDenied) |
| 6 deployer | 2 段スイッチ成功。ECR へ push(タグ条件)、deploy 完了 |
| 6 動作確認 | HTTPS で 12 回連続 200、`/news` が NHK の見出し、HTTP は 301、NLB は private IP に解決され外から不達、ノード 1 台 Ready、CloudWatch 4 群 30 日でログ到達、Pod に計測エージェントの注入なし、Secret は `app` のみで `kube-system` は forbidden、EC2 は UnauthorizedOperation、特権 Pod は baseline で拒否 |
| 7 builder destroy | 39 資源、13 分、AccessDenied 0。バケット削除 |
| 8 マネージャー `teardown-iam.sh` | ロール 3 つとポリシー 2 つが NoSuchEntity。代役ロール 2 つも削除 |
| 残骸 | VPC 0、VPC origin 0、CloudFront の SG 0。タグ索引の遅れ以外は無し |

### 見つかった不具合と修正

NLB の SG を「VPC の CIDR から 80」にしていたところ、CloudFront 経由の HTTPS が 504 になりました。
ターゲットは healthy、VPC origin は Deployed、Reachability Analyzer も到達可能と判定しましたが、
NLB の新規フロー数が 0 で、CloudFront の ENI からの接続が NLB に届いていませんでした。
ノード SG への追加許可、クライアント IP 保持の無効化では変わらず、
NLB の SG に `CloudFront-VPCOrigins-Service-SG` からの 80 を SG 参照で足した直後に 200 が返りました。
terraform では、VPC origin の作成後にこの SG を名前で引き、SG 参照の ingress にしました。
あわせて NLB の SG に `create_before_destroy` を付け、NLB に付いたまま差し替えられるようにしました。
3 周目のゼロからの apply で、この構成がそのまま作られることを確認しました。

### レビュー指摘の反映

移植先でのレビュー 7 点(apne1-az3 の除外、Application Signals の自動計測の無効化、terraform 1.11 以上、
kubernetes リソースの `_v1`、API エンドポイントの CIDR 変数、`set-deployers.sh` のロール ARN 解決、再検証の記録)は
2 周目の前に反映し、3 周目で apply から destroy まで通りました。
アドオンの設定値は `describe-addon` で `monitorAllServices=false` を確認し、Pod には init コンテナが注入されていません。

### 手順上の反省

- SG の説明文を変えたら SG の作り直しになり、NLB に付いたままの旧 SG を消せず apply が止まりました。
  LB に付く SG には最初から `create_before_destroy` を付けます
- 代役ロールを作り直したあと、CLI のキャッシュに旧ロールの一時資格が残り、スイッチが失敗しました。
  ロールを作り直したら `~/.aws/cli/cache` を消します

### 費用

3 周で約 1 USD です。

## 第 3 期の設計での検証(2026-10-20)

### 目的

deployer ロールを廃止し、開発者の個人ロールに `eks-exp-deployer-policy` を直接付ける形(a82fca9)で、
ゼロから撤去まで通ることを確かめます。

### 確かめること

- マネージャーの `setup-iam.sh` と `attach-deployer-policy.sh` で IAM がそろう
- builder は IAM の書き込みが PassRole だけでも apply と destroy が通る
- terraform が `deployer_role_arns` の ARN に EKS の Access Entry を作る
- 開発者役がスイッチ無しで push、deploy、動作確認できる
- `teardown-iam.sh` で開発者のロールからもポリシーが外れ、残骸が残らない

### 結果

すべて合格でした。費用は約 0.3 USD です。

| 段階 | 結果 |
| --- | --- |
| 準備 | 残骸ゼロを確認し、代役の空ロール 2 つを作成 |
| マネージャー | `setup-iam.sh` で EKS 用ロール 2 つとポリシー 2 つ、builder 役に 4 つ。`attach-deployer-policy.sh` で開発者役に `eks-exp-deployer-policy`。deployer ロールは作られない |
| builder の境界 | `create-role`、`attach-role-policy`、`update-assume-role-policy` はすべて AccessDenied |
| builder apply | 39 資源、16 分、AccessDenied 0。Access Entry が開発者役の個人ロールにできた |
| developer ページ | 置換し忘れ 0、`--profile` の記述 0 |
| 開発者役 | スイッチ先ロール無しで ECR へ push、`app` へ deploy |
| 動作確認 | HTTPS 12 回連続 200、`/news` が NHK の見出し、HTTP は 301、NLB は外から不達、ノード Ready、CloudWatch 4 群 30 日でログ到達、計測エージェントの注入なし |
| 開発者役の境界 | `app` の Secret は作れる、`kube-system` は forbidden、EC2 は拒否、自分のロールへの IAM 付与は AccessDenied、特権 Pod は baseline で拒否 |
| builder destroy | 39 資源、12 分、AccessDenied 0。バケット削除 |
| マネージャー撤去 | `teardown-iam.sh` で開発者役のロールからもポリシーが外れた(1 → 0)。ロール 2 つとポリシー 2 つが NoSuchEntity |
| 残骸 | VPC、VPC origin、CloudFront の SG、バケット、EKS、ECR、CloudFront すべて 0 |

### 確かめられたこと

- builder の IAM の書き込みは PassRole だけで、apply から destroy まで通る
- 開発者は個人ロールに `eks-exp-deployer-policy` と Access Entry があれば、スイッチ無しで作業できる
- 開発者の追加はマネージャー 1 回(IAM)と builder の apply 1 回(EKS)で済む

## 第 4 期の設計(SSM の踏み台)での検証(2026-10-22)

### 目的

EKS の API サーバーをプライベートだけにし、SSM の踏み台を経由する形で、ゼロから撤去まで通ることを確かめます。

### 確かめること

- `setup-iam.sh` で踏み台用のロールと instance profile ができ、`teardown-iam.sh` で消える
- builder の権限で、2 段の apply と destroy が AccessDenied 無しで通る
- builder と開発者役が `eks-tunnel.sh` でトンネルを張り、kubectl を使える
- API サーバーに外から直接は届かない(`endpointPublicAccess` が false)
- 開発者役の `ssm:StartSession` は、踏み台以外のインスタンスに対しては拒否される
- t4g.nano の踏み台で、トンネルが実用に足りる

### 準備と本番行動

準備は個人アカウントだけの都合で、代役の空ロール 2 つの作成と削除です。
本番行動は `docs/practice.md` の手順 2 から 13 で、移植先でも同じ順に打ちます。

### 見張り

- 開始から 3 時間で、builder の権限でトンネルを張って destroy する期限スクリプトを nohup で置く
- 15 分ごとに cron で進み具合を確かめる

### 結果

すべての確認項目が通りました。途中で不具合を 1 つ見つけ、直したうえで 1 段目をゼロから回し直しました。

| 段階 | 結果 |
| --- | --- |
| 準備 | 残骸ゼロを確認し、代役の空ロール 2 つを作成 |
| マネージャー | `setup-iam.sh` で `eks-exp-bastion` のロールと instance profile ができた。builder 役に 4 つ、開発者役に 1 つ |
| builder の境界 | `create-role` は AccessDenied |
| 1 段目の apply | 14 資源、9 分、AccessDenied 0。公開エンドポイントは無効で、名前は VPC 内の IP に解決され、手元からは届かない |
| 踏み台の SSM 登録 | 1 回目は Online にならなかった(下の不具合)。修正後のゼロからの 1 段目では、起動の 10 秒後に Online |
| builder のトンネル | `eks-tunnel.sh` で kubectl が builder 役として通り、証明書はホスト名で検証できた |
| 2 段目の apply | 24 資源、16 分、AccessDenied 0 |
| developer ページ | 置換し忘れ 0、踏み台の ID が入った |
| 開発者役 | スイッチ無しで push。別の kubeconfig でトンネルを張り、`app` へ deploy |
| 動作確認 | HTTPS 5 回連続 200、`/news` が NHK の見出し、NLB は外から不達、ノード Ready、CloudWatch にログ到達 |
| 開発者役の SSM の境界 | 踏み台でのシェルは AccessDenied。ノード(`Project` タグ無し)への転送も AccessDenied。EC2 の参照は拒否 |
| 踏み台経由の転送先 | 内部 NLB の 80 とノードの NodePort には届かない(SG)。インターネットの 443 には届く |
| セッションの終了 | 自分のセッションの `terminate-session` は通る。セッション ID の先頭はロールのセッション名 |
| destroy | 42 資源、12 分、AccessDenied 0。k8s の資源が踏み台より先に消えた |
| 撤去 | `teardown-iam.sh` でロール 3 つと instance profile とポリシー 2 つが消えた。代役ロールも削除 |
| 残骸 | タグの索引以外はすべて 0。索引に残った資源は、直接引くと terminated、deleted、NotFound |

### 見つかった不具合と修正

1 段目の `-target` では、public subnet のルートテーブルとその関連付けが作られませんでした。
踏み台からたどる依存が、NAT Gateway と IGW までで止まっていたためです。
NAT が外に出られず、SSM エージェントは `ssm.ap-northeast-1.amazonaws.com` への接続がタイムアウトしました。
`aws_nat_gateway` の `depends_on` に `aws_route_table_association.public` を足して直しました。
失敗が続いたエージェントは再試行の間隔を延ばすので、その場は builder の権限で踏み台を止めて起動し直しました。

### 見つかったリスク

開発者は、踏み台を経由してインターネットの任意の宛先へ転送できます。
送信元は NAT の固定 IP になるので、この IP を許可している相手には手元から届いてしまいます。
VPC の中は、NLB とクラスタの SG で止まります。

### 手順上の反省

- builder のトンネルを閉じるときに `pgrep -f` のパターンで kill し、ユーザーが別に張っていた無関係の SSM 転送まで止めた。以後は `setsid` で起動して PGID で止める
- `delete-state-bucket.sh` は確認の入力を待つので、入力無しで打つと何もせずに終わる。builder 役のロールを消した後に気づき、バケットは管理者の権限で消した

### 費用

約 0.3 USD です。

## 転送先を固定するドキュメントでの検証(2026-10-22)

### 目的

踏み台を経由した転送先を、自前の SSM ドキュメント `eks-exp-api-tunnel` で API サーバーの 443 に固定します。
前の検証で見つかった「開発者がインターネットへ転送できる」穴が塞がることを確かめます。
SSM 用の VPC エンドポイントは、月 30 USD 前後かかるため採りませんでした。

### 確かめること

- builder の権限で、ドキュメントの作成と削除が AccessDenied 無しで通る
- 1 段目の `-target` で、ドキュメントも作られる
- builder と開発者役が、このドキュメントでトンネルを張り、kubectl を使える
- 開発者役は、汎用ドキュメント `AWS-StartPortForwardingSessionToRemoteHost` を使えない
- 開発者役は、このドキュメントの `host` と `portNumber` を上書きできない
- 開発者役は、ドキュメントを指定しないシェルのセッションを開けない

### 見張り

前回と同じく、開始から 3 時間の期限 destroy と、15 分ごとの cron を置きます。
