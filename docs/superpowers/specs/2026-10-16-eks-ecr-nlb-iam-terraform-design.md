# EKS + ECR + NLB + デプロイ権限の terraform 実験 設計

対象ディレクトリ: `20261016_eks_ecr_nlb_iam_terraform/`

## 目的

AWS 上に次の環境を terraform で組み、何度でも完全に戻せる形で実験します。

- 外部から HTTP で到達できる URL(NLB の DNS 名)
- その URL で応答する EKS 上の Pod
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

実験では、自分の `administrator` プロファイルから `app-deployer` にスイッチして deployer 役を演じます。
本番では、信頼ポリシーの「誰がスイッチできるか」をその人物のログイン identity に変えるだけです。

terraform のコードは実験と本番で同一にします。
差は変数(アカウント、プロファイル、ノード数)だけです。
destroy は実験の操作であり、本番では行いません。

EKS クラスタはこの作業専用です。
そのため deployer には Kubernetes 側の全権(cluster-admin)を渡します。
namespace の作成も deployer が行います。

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
Pod (deployer が作る namespace, image は ECR)
```

NLB、target group、SG は全て terraform が持ちます。
Kubernetes 側はクラウド資源を作りません。
deployer は Service type=NodePort(nodePort 30080)で Pod を公開します。

リージョンは ap-northeast-1、アカウントは個人アカウントです。
認証は IAM Identity Center の `administrator` プロファイルを使います。
`~/.aws/config` に次の 2 プロファイルを足します。
いずれも `source_profile = administrator` からのスイッチロールです。

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
│   ├── variables.tf
│   └── outputs.tf
├── builder/             # 実験専用: 申請候補の権限だけを持つ IAM ロール
├── app/                 # deployer 役が使う Dockerfile と manifest
└── scripts/
    ├── check-leftovers.sh   # destroy 後の残骸チェック
    └── preflight-destroy.sh # destroy 前の k8s 側 LoadBalancer チェック
```

`terraform/` が本番に持っていく本体で、state は 1 つです。
`builder/` だけ別 state です。
builder ロールは builder 自身では作れないため、管理者が先に作ります。
本番ではその役をマネージャーが担います。

state は各ディレクトリのローカルファイルです。
アカウント ID が state に入るため、`*.tfstate*` を `.gitignore` に追加します。
remote state の参照は使いません。

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
- Access Policy の関連付け。`AmazonEKSClusterAdminPolicy`、スコープは cluster

実験では `deployer_trusted_principals` に自分の administrator ロールの ARN を入れます。
本番ではその人物のログイン identity(SSO のロールまたは IAM ユーザー)の ARN に変えます。

deployer の IAM ポリシーは次の 3 文です。

1. `ecr:GetAuthorizationToken` を `*` に許可
2. ECR リポジトリ `app` に限定して push/pull 系を許可
   (`BatchCheckLayerAvailability`, `InitiateLayerUpload`, `UploadLayerPart`,
   `CompleteLayerUpload`, `PutImage`, `BatchGetImage`, `GetDownloadUrlForLayer`,
   `DescribeImages`, `ListImages`, `DescribeRepositories`)
3. `eks:DescribeCluster` を対象クラスタに限定して許可(kubeconfig 生成用)

deployer は AWS 側ではこれ以外の操作ができません。
ノード、NLB、VPC の変更はできません。

Kubernetes 側は cluster-admin のため、Service type=LoadBalancer で ELB を作れてしまいます。
これは terraform 外の資源になり、destroy を妨げます。
対策として、README に禁止事項として明記し、destroy 前に `preflight-destroy.sh` で検出します。

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
- sts: `GetCallerIdentity`

`builder/` ディレクトリでこの候補を持つ IAM ロール `tf-builder` を作ります。
信頼ポリシーは自アカウントの principal からの assume を許可します。
`~/.aws/config` に `role_arn` と `source_profile = administrator` のプロファイル `builder` を足します。

README の申請文は次の形にします。

- 依頼内容: IAM ロール `tf-builder` を 1 つ作り、添付のポリシーを付けて、自分のログイン identity からスイッチロールできるようにしてほしい
- 添付: 検証済みのポリシー JSON
- 範囲の説明: このポリシーで作れるもの、作れないもの、リソース名の prefix による限定
- 期間と撤去: 作業後に自分が terraform destroy し、ロールも削除してよい

## 実験手順

第 1 段は管理者権限での通し確認です。

1. `terraform/` を apply(約 20 分)
2. output の ロール ARN を `~/.aws/config` のプロファイル `deployer` に登録
3. deployer 役として `app/` の image を build して ECR に push
4. deployer 役として kubeconfig を生成し、namespace、Deployment、Service(NodePort 30080)を apply
5. NLB の URL に curl し、Pod の応答を確認

第 2 段は可逆性の確認です。

1. `preflight-destroy.sh` で k8s 側の LoadBalancer が無いことを確認
2. `terraform/` を destroy
3. `check-leftovers.sh` で残骸が無いことを確認

第 3 段は builder 権限の検証です。

1. 管理者で `builder/` を apply し、プロファイル `builder` を用意
2. プロファイル `builder` で第 1 段と第 2 段を繰り返す
3. AccessDenied が出たら候補ポリシーに Action を足して再試行
4. 通ったポリシー JSON を README に確定版として載せる

第 4 段は deployer の境界確認です。
プロファイル `deployer` で次を実行し、全て拒否されることを確認します。

- `aws ec2 describe-instances`
- `aws eks list-clusters`(DescribeCluster は許可、List は不許可)
- `aws ecr create-repository --repository-name other`
- `aws iam list-roles`

最後に全ディレクトリを destroy し、`check-leftovers.sh` を通して終了します。

## 可逆性の規則

触らないもの。

- アカウント設定(S3 パブリックアクセスブロック、EBS 既定暗号化、IAM パスワードポリシー)
- Service Quotas
- IAM Identity Center と Organizations
- KMS カスタマーマネージドキー
- CloudTrail、AWS Config

destroy 後に残ることを許容するもの。

- サービスリンクロール(`AWSServiceRoleForAmazonEKS`、`AWSServiceRoleForAmazonEKSNodegroup`、`AWSServiceRoleForElasticLoadBalancing`、`AWSServiceRoleForAutoScaling`)。自動生成され、課金はありません
- `~/.aws/config` と `~/.aws/credentials` に足したプロファイル。手で消せます

`check-leftovers.sh` は次を確認します。

- タグ `Project=eks-exp` の資源がゼロ(Resource Groups Tagging API)
- EKS クラスタ、ECR リポジトリ、ELB、ASG、NAT Gateway、EIP、VPC(default 以外)がゼロ
- IAM ロール `app-deployer`、`tf-builder`、`eks-exp-*` がゼロ
- CloudWatch ロググループ `/aws/eks/` 配下がゼロ

## 検証項目

- NLB の URL に curl して Pod の応答が返る
- プロファイル `deployer` で ECR push と kubectl apply が成功する
- プロファイル `deployer` で第 4 段の操作が全て AccessDenied になる
- プロファイル `builder` で `terraform/` の apply と destroy が最後まで通る
- destroy 後に `check-leftovers.sh` が異常ゼロで終わる

## 対象外

- HTTPS と独自ドメイン
- AWS Load Balancer Controller、Ingress
- オートスケール、監視、ログ基盤
- 複数環境(dev/prod)の切り替え
- remote state(S3 backend)

## 成果物

- `20261016_eks_ecr_nlb_iam_terraform/` 一式(terraform、builder、scripts、app)
- README.md。構成、手順、builder の確定ポリシー JSON、deployer のポリシー JSON、申請文のたたき台、実験ログ

## コストと所要時間

| 項目 | 単価(USD/時) |
| --- | --- |
| EKS クラスタ | 0.10 |
| t3.medium x1 | 0.054 |
| NAT Gateway | 0.062 |
| NLB | 0.0243 |

1 周あたり作成に約 20 分、destroy に約 15 分かかります。
