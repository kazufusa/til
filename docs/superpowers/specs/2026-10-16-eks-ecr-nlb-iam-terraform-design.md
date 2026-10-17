# EKS + ECR + NLB + デプロイ権限の terraform 実験 設計

対象ディレクトリ: `20261016_eks_ecr_nlb_iam_terraform/`

## 目的

AWS 上に次の環境を terraform で組み、何度でも完全に戻せる形で実験します。

- 外部から HTTP で到達できる URL(NLB の DNS 名)
- その URL で応答する EKS 上の Pod
- Pod からインターネットへのアウトバウンド通信(NAT Gateway 経由、送信元は固定 EIP)
- Pod の image を置く ECR リポジトリ
- 特定の人物が image を push し、kubectl でデプロイできる権限

この実験から、2 つの権限リストを確定させます。
自分が本番で申請する権限と、その人物に terraform で付与する権限です。

## 役割

builder は自分です。terraform apply/destroy で環境を作り、壊します。
本番ではこの権限をマネージャーに申請します。

deployer はその人物です。ECR に image を push し、kubectl で EKS を操作します。
本番の組織は SSO ログイン後に作業用ロールへスイッチロールする運用です。
そのため deployer の実体は IAM ロール `app-deployer` にします。
アクセスキーは発行しません。
deployer の権限も同じ terraform で管理します。

実験では、自分の `default` プロファイルから `app-deployer` にスイッチして deployer 役を演じます。
本番では、信頼ポリシーの「誰がスイッチできるか」をその人物のログイン identity に変えるだけです。

terraform のコードは実験と本番で同一にします。
差は変数(アカウント、プロファイル、ノード数)だけです。
destroy は実験の操作であり、本番では行いません。

役割分担は AWS の推奨に合わせます。
cluster-admin は platform(builder)だけが持ちます。
deployer は namespace `app` に限定した edit 権限を持ちます。
namespace と ResourceQuota は builder が terraform で作ります。

IAM の方針も推奨に合わせます。
IAM ユーザーではなくロールを使い、長期キーは発行しません。
資源名の接頭辞(`eks-exp-*`、`app-*`)で IAM の対象を限定します。
EKS の認可は aws-auth ConfigMap ではなく Access Entry で行います。

## 構成

```
インターネット
   │  http://<nlb>.elb.ap-northeast-1.amazonaws.com
   ▼
NLB (terraform 管理, public subnet, SG 付き)
   │  listener :80 → target group (instance, port 30080)
   ▼
EKS managed node group (t3.medium x1, private subnet)
   │  NodePort 30080
   ▼
Pod (namespace app, image は ECR)
```

NLB、target group、SG は全て terraform が持ちます。
Kubernetes 側はクラウド資源を作りません。

Pod の外向き通信は private subnet のルートテーブルで NAT Gateway に向けます。
送信元 IP は NAT Gateway の EIP に固定されるため、通信先で許可リストに入れられます。
deployer は Service type=NodePort(nodePort 30080)で Pod を公開します。

リージョンは ap-northeast-1、アカウントは個人アカウントです。
認証は IAM Identity Center の `default` プロファイル(SSO、AdministratorAccess)を使います。
`~/.aws/config` に次の 2 プロファイルを足します。
いずれも `source_profile = default` からのスイッチロールです。

- `builder`: `tf-builder` ロール(申請候補の権限)
- `deployer`: `app-deployer` ロール(deployer の権限)

## terraform のレイアウト

```
20261016_eks_ecr_nlb_iam_terraform/
├── README.md            # 手順、権限リスト、申請文
├── terraform/           # 本番に持っていく本体(1 つの state)
│   ├── network.tf       # VPC, subnet, IGW, NAT, route table
│   ├── eks.tf           # EKS cluster, node group, IAM role
│   ├── ecr.tf           # ECR repository
│   ├── nlb.tf           # NLB, target group, listener, SG
│   ├── deployer.tf      # deployer の IAM role, policy, Access Entry
│   ├── namespace.tf     # namespace app と ResourceQuota(kubernetes provider)
│   ├── variables.tf     # 固有値は default にべた書きする(tfvars は使わない)
│   ├── outputs.tf
│   └── backend.tf       # backend "s3"。バケット名だけ init の引数で渡す
├── bootstrap/           # マネージャーに渡す一式。aws コマンドだけで terraform を使わない
│   ├── tf-builder-policy.json  # builder に付与する権限(実験で確定した JSON)
│   ├── create-state-bucket.sh  # state 用 S3 バケット作成
│   ├── create-builder-role.sh  # ポリシー作成、tf-builder ロール作成、信頼ポリシー、アタッチ
│   ├── delete-builder-role.sh  # ロールとポリシーの撤去
│   └── delete-state-bucket.sh  # バケットを全バージョンごと削除
├── app/                 # deployer 役が使う Dockerfile と manifest
└── scripts/             # 実験専用
    ├── check-leftovers.sh      # destroy 後の残骸チェック
    └── preflight-destroy.sh    # destroy 前の k8s 側 LoadBalancer チェック
```

`terraform/` が本番に持っていく本体で、state は 1 つです。

`bootstrap/` は段 0(ブートストラップ)です。
terraform を回すロールとその state の置き場は、terraform 自身では作れません。
マネージャーは terraform を使えないため、段 0 は全て aws コマンドのスクリプトにします。
実験では自分が管理者としてこのスクリプトを実行し、本番で渡すものと同じ手順を検証します。

state は S3 に置きます。
ロックは `use_lockfile = true`(Terraform 1.10 以降)で S3 だけで完結させます。
DynamoDB は使いません。

key、region、`use_lockfile` は `backend.tf` に直書きします。
バケット名だけはアカウント ID を含むため、init の引数で渡します。

```bash
terraform init -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
```

変数の値は `variables.tf` の `default` にべた書きします。
tfvars は使いません。
`deployer_trusted_principals` の既定値は空リストで、空のときは terraform を実行している本人の帽子(`aws_iam_session_context` の `issuer_arn`)を信頼します。
実験では自分が deployer 役を兼ねるので、固有値を一切書かずに動きます。
本番ではその人物の ARN を `default` に書いて commit します。

`.gitignore` に入れるのは `.terraform/` と `*.tfstate*` だけです。

バケットは terraform の管理外です。
作成は `bootstrap/create-state-bucket.sh` で行います。
本番ではこのスクリプトをマネージャーに渡して実行してもらいます。
実験では自分が `default` プロファイルで実行します。

バケットの設定は、バージョニング有効、パブリックアクセス全遮断、SSE-S3 です。
名前は `tfstate-<アカウントID>-eks-exp` とします。
apply と destroy を何周してもバケットは残します。
実験の最後にだけ `bootstrap/delete-state-bucket.sh` で全バージョンを含めて削除します。

全資源に共通タグ `Project = eks-exp` を付けます。
残骸チェックはこのタグで検索します。

## 基盤の資源

- VPC(10.0.0.0/16)、public subnet 2 つ、private subnet 2 つ、IGW、NAT Gateway 1 台、route table
- EKS クラスタ。認証モードは `API`。クラスタ作成者への管理者権限自動付与は有効。コントロールプレーンのログは全て無効
- EKS クラスタ用 IAM ロール(`AmazonEKSClusterPolicy`)
- managed node group。t3.medium、desired 1、private subnet 配置。実験目的のため冗長化しません
- node 用 IAM ロール(`AmazonEKSWorkerNodePolicy`, `AmazonEKS_CNI_Policy`, `AmazonEC2ContainerRegistryPullOnly`)
- ECR リポジトリ `app`。`force_delete = true`。イメージスキャンは無効
- NLB(internet-facing)、NLB 用 SG(80/tcp を 0.0.0.0/0 から許可)
- target group(instance, port 30080, health check は traffic port)、listener 80
- node group の Auto Scaling Group と target group の紐づけ(`aws_autoscaling_attachment`)
- EKS クラスタ SG への ingress ルール(30080/tcp を NLB の SG から許可)

output はクラスタ名、NLB の DNS 名、ECR リポジトリ URL です。

コントロールプレーンのログを無効にするのは、CloudWatch ロググループを残さないためです。
KMS のカスタマーキーは使いません。削除に待機期間があるためです。

## deployer の資源

- IAM ロール `app-deployer`。信頼ポリシーは変数 `deployer_trusted_principals` に列挙した ARN からの `sts:AssumeRole` を許可
- カスタマー管理ポリシー `app-deployer-policy`(下記)をロールにアタッチ
- EKS Access Entry(principal は上記ロール)
- Access Policy の関連付け。`AmazonEKSEditPolicy`、スコープは namespace(変数 `deployer_namespaces`、既定 `["app"]`)
- namespace `app`(kubernetes provider で作成。認証は `aws eks get-token` の exec)
- namespace `app` の ResourceQuota。`services.loadbalancers = 0`、`persistentvolumeclaims = 0`

ResourceQuota は、deployer が terraform 外のクラウド資源(ELB、EBS)を作れないようにする仕組みです。
edit 権限では ResourceQuota を変更できません。

実験では `deployer_trusted_principals` を空のままにし、実行者本人の帽子を信頼します。
本番ではその人物のログイン identity(SSO のロールまたは IAM ユーザー)の ARN を `default` に書きます。

deployer の IAM ポリシーは次の 3 文です。

1. `ecr:GetAuthorizationToken` を `*` に許可
2. ECR リポジトリ `app` に限定して push/pull 系を許可
   (`BatchCheckLayerAvailability`, `InitiateLayerUpload`, `UploadLayerPart`,
   `CompleteLayerUpload`, `PutImage`, `BatchGetImage`, `GetDownloadUrlForLayer`,
   `DescribeImages`, `ListImages`, `DescribeRepositories`)
3. `eks:DescribeCluster` を対象クラスタに限定して許可(kubeconfig 生成用)

deployer は AWS 側ではこれ以外の操作ができません。
ノード、NLB、VPC の変更はできません。

Service type=LoadBalancer は ResourceQuota で namespace `app` では作れません。
cluster-admin である builder 自身が他の namespace で作る事故に備え、destroy 前に `preflight-destroy.sh` で検出します。

output は `app-deployer` ロールの ARN です。
deployer にはこの ARN を渡し、スイッチロール先として設定してもらいます。

## builder の権限

builder の申請権限は「候補を作る」「実験で検証する」「確定する」の 3 段で決めます。

候補はサービス単位で次の範囲です。
最終的な Action 単位のリストは検証(実験手順の第 3 段)で確定し、README に JSON で載せます。

- ec2: VPC、subnet、IGW、NAT Gateway、EIP、route table、SG の作成・削除・タグ付け・参照
- eks: cluster、nodegroup、access entry、access policy の作成・削除・参照
- ecr: repository の作成・削除・参照、イメージの一括削除
- elasticloadbalancing: load balancer、target group、listener の作成・削除・属性変更・参照
- autoscaling: target group の attach/detach、ASG の参照
- iam: role、policy の作成・削除・参照、信頼ポリシーの更新、`iam:PassRole`(EKS 用ロールに限定)、`iam:CreateServiceLinkedRole`
- s3: state バケットに限定して `ListBucket`、`GetObject`、`PutObject`、`DeleteObject`
- sts: `GetCallerIdentity`

`bootstrap/create-builder-role.sh` でこの候補を持つ IAM ロール `tf-builder` を作ります。
引数はスイッチを許可する principal の ARN です。
スクリプトは `tf-builder-policy.json` からカスタマー管理ポリシーを作り、ロールを作り、アタッチします。
`~/.aws/config` に `role_arn` と `source_profile = default` のプロファイル `builder` を足します。

`tf-builder` は実験の道具です。
自分の SSO ユーザーは AdministratorAccess を持つため、候補権限だけで足りるかを試せません。
Identity Center は触らないと決めたので、候補権限だけを持つロールを別に作って検証します。
本番でロールを作るか、自分の identity に直接付与するかは、マネージャーの流儀に任せます。
terraform のコードはどちらでも同じで、認証プロファイルの設定だけが変わります。

README の申請文は次の形にします。

- 依頼内容 1: `create-state-bucket.sh` を実行してバケットを作ってほしい
- 依頼内容 2: `create-builder-role.sh <自分の identity の ARN>` を実行して `tf-builder` ロールを作ってほしい。ロールを作らず自分の identity に `tf-builder-policy.json` を直接付けてもよい
- 添付: `bootstrap/` 一式(スクリプト 4 本と検証済みのポリシー JSON)
- 範囲の説明: このポリシーで作れるもの、作れないもの、リソース名の prefix による限定
- 期間と撤去: 作業後に自分が terraform destroy し、ロールも削除してよい

## 実験手順

第 0 段は state バケットの作成です。
`default` プロファイルで `create-state-bucket.sh` を 1 回実行します。
以後の全ての周回でこのバケットを使い回します。

第 1 段は管理者権限での通し確認です。

1. `terraform/` をバケット名付きで init し、apply(約 20 分)
2. output の ロール ARN を `~/.aws/config` のプロファイル `deployer` に登録
3. deployer 役として `app/` の image を build して ECR に push
4. deployer 役として kubeconfig を生成し、namespace、Deployment、Service(NodePort 30080)を apply
5. NLB の URL に curl し、Pod の応答を確認
6. Pod の中から外部サイトに接続し、送信元 IP が NAT Gateway の EIP と一致することを確認

第 2 段は可逆性の確認です。

1. `preflight-destroy.sh` で k8s 側の LoadBalancer が無いことを確認
2. `terraform/` を destroy
3. `check-leftovers.sh` で残骸が無いことを確認

第 3 段は builder 権限の検証です。

1. 管理者で `bootstrap/create-builder-role.sh` を実行し、プロファイル `builder` を用意
2. プロファイル `builder` で第 1 段と第 2 段を繰り返す
3. AccessDenied が出たら候補ポリシーに Action を足して再試行
4. 通ったポリシー JSON を README に確定版として載せる

第 4 段は deployer の境界確認です。
プロファイル `deployer` で次を実行し、全て拒否されることを確認します。

- `aws ec2 describe-instances`
- `aws eks list-clusters`(DescribeCluster は許可、List は不許可)
- `aws ecr create-repository --repository-name other`
- `aws iam list-roles`
- `kubectl get namespaces`、`kubectl create namespace x`
- `kubectl -n kube-system get pods`
- `kubectl -n app expose deploy web --type=LoadBalancer`(ResourceQuota 超過で拒否)

同時に、namespace `app` での Deployment と Service(NodePort)の作成は許可されることを確認します。

最後に `terraform/` を destroy し、`delete-builder-role.sh` でロールを消し、`check-leftovers.sh` を通します。
その後 `delete-state-bucket.sh` でバケットを削除して終了します。

## 可逆性の規則

触らないもの。

- アカウント設定(S3 パブリックアクセスブロック、EBS 既定暗号化、IAM パスワードポリシー)
- Service Quotas
- IAM Identity Center と Organizations
- KMS カスタマーマネージドキー
- CloudTrail、AWS Config

destroy 後に残ることを許容するもの。

- サービスリンクロール(`AWSServiceRoleForAmazonEKS`、`AWSServiceRoleForAmazonEKSNodegroup`、`AWSServiceRoleForElasticLoadBalancing`、`AWSServiceRoleForAutoScaling`)。自動生成され、課金はありません
- `~/.aws/config` に足したプロファイル。手で消せます
- state 用 S3 バケット。実験の周回中は意図して残し、最後に `delete-state-bucket.sh` で消します

`check-leftovers.sh` は次を確認します。

- タグ `Project=eks-exp` の資源がゼロ(Resource Groups Tagging API)
- EKS クラスタ、ECR リポジトリ、ELB、ASG、NAT Gateway、EIP、VPC(default 以外)がゼロ
- IAM ロール `app-deployer`、`tf-builder`、`eks-exp-*` がゼロ
- CloudWatch ロググループ `/aws/eks/` 配下がゼロ

state バケットは周回中は残すため、`check-leftovers.sh` の対象から除きます。
`delete-state-bucket.sh` は全オブジェクトバージョンと削除マーカーを消してからバケットを削除します。

## 検証項目

- NLB の URL に curl して Pod の応答が返る
- Pod の中から `checkip.amazonaws.com` に到達でき、返る IP が NAT Gateway の EIP と一致する
- プロファイル `deployer` で ECR push と kubectl apply が成功する
- プロファイル `deployer` で第 4 段の AWS 操作が全て AccessDenied、Kubernetes 操作が Forbidden または quota 超過になる
- プロファイル `builder` で `terraform/` の apply と destroy が最後まで通る
- destroy 後に `check-leftovers.sh` が異常ゼロで終わる

## 対象外

- HTTPS と独自ドメイン
- AWS Load Balancer Controller、Ingress
- オートスケール、監視、ログ基盤
- 複数環境(dev/prod)の切り替え
- state バケットの terraform 管理(管理者がスクリプトで作る)

## 成果物

- `20261016_eks_ecr_nlb_iam_terraform/` 一式(terraform、bootstrap、scripts、app)
- README.md。構成、手順、builder の確定ポリシー JSON、deployer のポリシー JSON、申請文のたたき台(バケット作成スクリプトの渡し方を含む)、実験ログ

## コストと所要時間

| 項目 | 単価(USD/時) |
| --- | --- |
| EKS クラスタ | 0.10 |
| t3.medium x1 | 0.054 |
| NAT Gateway | 0.062 |
| NLB | 0.0243 |

1 周あたり作成に約 20 分、destroy に約 15 分かかります。
