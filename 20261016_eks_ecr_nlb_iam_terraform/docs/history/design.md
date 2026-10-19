# EKS + ECR + NLB + デプロイ権限の terraform 実験 設計

この設計書は実装前の記録です。最新の構成は README と permissions.md を正とします。
本文の「移植先」は、社内の dev 環境を指します。

対象ディレクトリ: `20261016_eks_ecr_nlb_iam_terraform/`

## 目的

成果物は 2 つです。

1. ロール。自分が移植先で申請する `tf-builder` の権限 JSON(実験で検証済み)と、その人物に付与する `<cluster_name>-deployer`(terraform 管理)
2. EKS 環境を作る terraform。apply すると次の 5 点が満たされます

- 外部から HTTPS の URL でアプリにアクセスできる(CloudFront の `*.cloudfront.net`、証明書は AWS が自動付与。入口は CloudFront だけで、NLB は CloudFront 以外を拒否する)
- アプリからインターネットへアウトバウンドできる(NAT Gateway 経由、送信元は固定 EIP)
- kubectl でアプリをデプロイできる(EKS、namespace `app`)
- image を置く ECR がある
- `<cluster_name>-deployer` ロールで image の push とデプロイができる

実験は、`tf-builder` の権限だけでこの terraform を apply し、5 点を確認し、destroy で完全に戻せることを証明する工程です。
AWS 上で行い、何度でも完全に戻せる形にします。

## 役割

builder は自分です。terraform apply/destroy で環境を作り、壊します。
移植先ではこの権限をマネージャーに申請します。

deployer はその人物です。ECR に image を push し、kubectl で EKS を操作します。
移植先の組織は SSO ログイン後に作業用ロールへスイッチロールする運用です。
そのため deployer の実体は IAM ロール `<cluster_name>-deployer` にします。
アクセスキーは発行しません。
deployer の権限も同じ terraform で管理します。

実験では、自分の `default` プロファイルから `<cluster_name>-deployer` にスイッチして deployer 役を演じます。
移植先では、信頼ポリシーの「誰がスイッチできるか」をその人物のログイン identity に変えるだけです。

terraform のコードは実験と移植先で同一にします。
差は変数(アカウント、プロファイル、ノード数)だけです。
destroy は実験の操作であり、移植先では行いません。

役割分担は AWS の推奨に合わせます。
cluster-admin は platform(builder)だけが持ちます。
deployer はアプリ開発者です。namespace `app` の中は admin、クラスタ全体は読み取り専用の権限を持ちます。
namespace と ResourceQuota は builder が terraform で作ります。

IAM の方針も推奨に合わせます。
IAM ユーザーではなくロールを使い、長期キーは発行しません。
資源名の接頭辞(`<cluster_name>-*`)で IAM の対象を限定します。
EKS の認可は aws-auth ConfigMap ではなく Access Entry で行います。

## 構成

```
ブラウザ
   │  https://<id>.cloudfront.net
   ▼
CloudFront (HTTPS)
   │  http :80
   ▼
NLB (terraform 管理, public subnet, SG は CloudFront からのみ許可)
   │  listener :80 → target group (instance, port 30080)
   ▼
EKS managed node group (t3.medium x1, private subnet)
   │  NodePort 30080
   ▼
Pod (namespace app, image は ECR)
   │  外向き通信
   ▼
NAT Gateway (固定 IP) → インターネット
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
- `deployer`: `<cluster_name>-deployer` ロール(deployer の権限)

## terraform のレイアウト

```
20261016_eks_ecr_nlb_iam_terraform/
├── README.md            # 手順、権限リスト、申請文
├── terraform/           # 移植先に持っていく本体(1 つの state)
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

`terraform/` が移植先に持っていく本体で、state は 1 つです。

`bootstrap/` は段 0(ブートストラップ)です。
terraform を回すロールとその state の置き場は、terraform 自身では作れません。
マネージャーは terraform を使えないため、段 0 は全て aws コマンドのスクリプトにします。
実験では自分が管理者としてこのスクリプトを実行し、移植先で渡すものと同じ手順を検証します。

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
`deployer_trusted_principals` の既定値は空リストで、空のときは terraform を実行している本人のロール(`aws_iam_session_context` の `issuer_arn`)を信頼します。
実験では自分が deployer 役を兼ねるので、固有値を一切書かずに動きます。
移植先ではその人物の ARN を `default` に書いて commit します。

`.gitignore` に入れるのは `.terraform/` と `*.tfstate*` だけです。

バケットは terraform の管理外です。
作成は `bootstrap/create-state-bucket.sh` で行います。
builder の権限に、名前を `tfstate-*-eks-exp` に限定したバケットの作成・設定・削除を含めます。
そのため移植先でもこのスクリプトは builder 自身が実行します。
マネージャーに実行してもらうのは `create-builder-role.sh` の 1 本だけです。
実験では第 0 段で管理者として作り、第 3 段で builder として同じスクリプトを再実行して権限を検証します。

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
- NLB(internet-facing)、NLB 用 SG(80/tcp を CloudFront のプレフィックスリストから許可)
- ログ転送。CloudWatch Observability アドオン、ロググループ 4 つ(保存 30 日)、ノードロールへの `CloudWatchAgentServerPolicy`
- target group(instance, port 30080, health check は traffic port)、listener 80
- node group の Auto Scaling Group と target group の紐づけ(`aws_autoscaling_attachment`)
- EKS クラスタ SG への ingress ルール(30080/tcp を NLB の SG から許可)

output はクラスタ名、NLB の DNS 名、ECR リポジトリ URL です。

コントロールプレーンのログを無効にするのは、CloudWatch ロググループを残さないためです。
KMS のカスタマーキーは使いません。削除に待機期間があるためです。

## deployer の資源

- IAM ロール `<cluster_name>-deployer`。信頼ポリシーは変数 `deployer_trusted_principals` に列挙した ARN からの `sts:AssumeRole` を許可
- カスタマー管理ポリシー `<cluster_name>-deployer-policy`(下記)をロールにアタッチ
- EKS Access Entry(principal は上記ロール)
- Access Policy の関連付けを 2 つ
  - `AmazonEKSAdminPolicy` を namespace スコープ(変数 `deployer_namespaces`、既定 `["app"]`)。自分の namespace では Role や RoleBinding も作れ、チームメイトを自分で追加できます。ResourceQuota と namespace 自体は変更できません
  - `AmazonEKSViewPolicy` を cluster スコープ。ノード、namespace 一覧、他 namespace の Pod を参照できます。Secret の参照は含まれません
  - ノードの状態が見えないと Pod の Pending の原因を追えないため、読み取りはクラスタ全体にします
- namespace `app`(kubernetes provider で作成。認証は `aws eks get-token` の exec)
- namespace `app` の ResourceQuota。`services.loadbalancers = 0`、`persistentvolumeclaims = 0`

ResourceQuota は、deployer が terraform 外のクラウド資源(ELB、EBS)を作れないようにする仕組みです。
admin 権限では ResourceQuota を変更できません。

実験では `deployer_trusted_principals` を空のままにし、実行者自身のロールを信頼します。
移植先ではその人物のログイン identity(SSO のロールまたは IAM ユーザー)の ARN を `default` に書きます。

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

output は `<cluster_name>-deployer` ロールの ARN です。
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
- s3: 名前 `tfstate-*-eks-exp` のバケットに限定して、作成・削除・バージョニング・公開ブロック・暗号化・タグの設定、`ListBucket`、`ListBucketVersions`、オブジェクトとバージョンの読み書き削除
- sts: `GetCallerIdentity`

`bootstrap/create-builder-role.sh` でこの候補を持つ IAM ロール `tf-builder` を作ります。
引数はスイッチを許可する principal の ARN です。
スクリプトは `tf-builder-policy.json` からカスタマー管理ポリシーを作り、ロールを作り、アタッチします。
`~/.aws/config` に `role_arn` と `source_profile = default` のプロファイル `builder` を足します。

`tf-builder` は実験の道具です。
自分の SSO ユーザーは AdministratorAccess を持つため、候補権限だけで足りるかを試せません。
Identity Center は触らないと決めたので、候補権限だけを持つロールを別に作って検証します。
移植先でロールを作るか、自分の identity に直接付与するかは、マネージャーの流儀に任せます。
terraform のコードはどちらでも同じで、認証プロファイルの設定だけが変わります。

README の申請文は次の形にします。

- 依頼内容: `create-builder-role.sh <自分の identity の ARN>` を実行して `tf-builder` ロールを作ってほしい。ロールを作らず自分の identity に `tf-builder-policy.json` を直接付けてもよい
- 添付: `bootstrap/create-builder-role.sh`、`bootstrap/delete-builder-role.sh`、検証済みの `tf-builder-policy.json`
- 補足: state 用 S3 バケットは、付与された権限の範囲で自分が `create-state-bucket.sh` を実行して作る
- 範囲の説明: このポリシーで作れるもの、作れないもの、リソース名の prefix による限定
- 期間と撤去: 作業後に自分が terraform destroy し、ロールも削除してよい

## 実験手順

管理者(`default`)が行うのは、残骸チェックの基準点取得と `create-builder-role.sh` だけです。
それ以外は最初から `builder`(`tf-builder` にスイッチ)で行い、権限の検証と構築を同時に進めます。
AccessDenied が出たら候補ポリシーに Action を足し、管理者が `create-builder-role.sh` を再実行して続けます。

第 0 段は tf-builder の作成です。

1. 管理者で `check-leftovers.sh` を実行し、基準点が clean であることを確認
2. 管理者で `create-builder-role.sh <自分の SSO ロール ARN>` を実行
3. `~/.aws/config` に `builder` を追加し、`get-caller-identity` でロールが `tf-builder` に替わったことを確認

第 1 段は builder での構築と疎通確認です。

1. builder で `create-state-bucket.sh`(S3 権限の検証)
2. builder で `terraform init` と `terraform apply`(約 20 分)
3. `deployer` プロファイル(`source_profile = builder`)を追加
4. deployer 役で `app/` の image を build して ECR に push
5. deployer 役で kubectl apply(Deployment と Service。NodePort 30080)
6. NLB の URL に curl し、Pod の応答を確認
7. Pod の中から外部サイトに接続し、送信元 IP が NAT Gateway の EIP と一致することを確認

第 2 段は可逆性の確認です。

1. `preflight-destroy.sh` で k8s 側の LoadBalancer が無いことを確認(quota の陰性対照も行う)
2. builder で `terraform destroy`(image を残したまま)
3. `check-leftovers.sh` で、残るのが `tf-builder` と state バケットだけであることを確認

第 3 段は deployer の境界確認です。

1. builder で再 apply
2. プロファイル `deployer` で AWS 側の 5 操作が全て拒否されることを確認
3. Kubernetes 側で、次を確認
   - 読み取りはクラスタ全体で許可される
   - 書き込みは namespace `app` 以外で Forbidden になる
   - quota で LoadBalancer が拒否される
   - namespace 内の Deployment、Service、RoleBinding は許可される

片付けは、builder で destroy、builder で `delete-state-bucket.sh`、管理者で `delete-builder-role.sh`、`check-leftovers.sh` が clean、の順です。
最後に確定版の `tf-builder-policy.json` と申請文を README に載せます。

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
- IAM ロール `<cluster_name>-deployer`、`tf-builder`、`eks-exp-*` がゼロ
- CloudWatch ロググループ `/aws/eks/` と `/aws/containerinsights/<cluster_name>/` 配下がゼロ

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

- 独自ドメインと ACM 証明書(HTTPS は CloudFront の既定ドメインで代替)
- AWS Load Balancer Controller、Ingress
- オートスケール、監視、ログの分析基盤(転送と 30 日間の保存だけ行う)
- 複数環境(dev/prod)の切り替え
- state バケットの terraform 管理(管理者がスクリプトで作る)

## 成果物

- `terraform/` 一式。移植先にそのまま持っていく EKS 環境のコード
- `bootstrap/` 一式。マネージャーに渡す `create-builder-role.sh` と、`tf-builder-policy.json`(管理ポリシー 3 つと組み合わせるカスタム 1 つ)、検証済みの `tf-builder-policy.minimal.json`
- README.md。概要と最短手順を載せた入口
- docs/guide.md。初学者向けの解説と手順の詳細
- docs/permissions.md。builder の申請構成と最小 JSON、deployer のポリシー JSON、セキュリティの現状
- docs/request.md。マネージャーへの申請文のたたき台
- docs/deployer.md と docs/deployer.md.tmpl。開発者向けの手引きと、terraform output から値を埋める雛形
- docs/experiment-log.md。実験ログ
- `scripts/` と `app/`。実験用の残骸チェック、`render-deployer-doc.sh` と `render-policy.sh`、サンプルアプリ

## コストと所要時間

| 項目 | 単価(USD/時) |
| --- | --- |
| EKS クラスタ | 0.10 |
| t3.medium x1 | 0.054 |
| NAT Gateway | 0.062 |
| NLB | 0.0243 |

1 周あたり作成に約 20 分、destroy に約 15 分かかります。
