# EKS + ECR + NLB + デプロイ権限の terraform 実験

## 目的

AWS 上に EKS、ECR、NLB を terraform で組み、何度でも完全に戻せる形で実験します。
外部から HTTP で届く URL と、Pod から NAT Gateway を通るアウトバウンド通信を確かめます。
特定の人物が image を push し、kubectl でデプロイできる権限も同じ terraform で管理します。
実験の成果は 2 つの権限リストです。
本番でマネージャーに申請する builder の権限と、その人物に付与する deployer の権限です。

## 役割

| 役割 | 誰 | やること | AWS 側の権限 | Kubernetes 側の権限 |
| --- | --- | --- | --- | --- |
| platform(builder) | 自分 | terraform の apply と destroy、namespace と quota の管理 | 申請した権限(実験では `tf-builder`) | cluster-admin(クラスタ作成者) |
| deployer | その人物 | ECR への push、namespace `app` への kubectl apply | ECR `app` への push と `eks:DescribeCluster` | namespace `app` の edit(`AmazonEKSEditPolicy`) |

deployer の実体は IAM ロール `app-deployer` で、アクセスキーは発行しません。
本番の組織は SSO ログイン後にスイッチロールする運用なので、信頼ポリシーの相手をその人物のログイン identity にするだけで移せます。

実験では管理者の `default` プロファイル(SSO)を使い、`builder` と `deployer` の 2 プロファイルがそこからスイッチロールします。
どちらも `role_arn` と `source_profile = default` で定義します。

## 設計の方針

AWS の推奨に合わせた点は次のとおりです。

- IAM ユーザーではなくロールを使い、長期のアクセスキーを発行しない
- 権限は最小にし、IAM の対象は資源名の接頭辞(`eks-exp-*`、`app-*`)で限定する
- EKS の認可は aws-auth ConfigMap ではなく Access Entry で行う
- cluster-admin は platform だけが持ち、アプリ担当は namespace 限定にする
- namespace と ResourceQuota は platform が terraform で管理し、アプリ担当は変更できない
- deployer が terraform 外にクラウド資源を作れないよう、ResourceQuota で LoadBalancer と PVC を 0 にする
- 段 0 でマネージャーに頼むのは terraform 実行ロールの作成 1 件だけにし、残りは builder の権限内で完結させる

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
deployer は Service type=NodePort で nodePort を 30080 に固定します。
この番号が terraform と manifest の約束です。

Pod の外向き通信は、private subnet のルートテーブルで NAT Gateway に向けます。
送信元 IP は NAT Gateway の EIP に固定されるので、通信先の許可リストに入れられます。
その IP は `terraform output nat_public_ip` で確認します。

## 前提ツール

terraform 1.10 以上、aws cli v2、kubectl、docker、jq を使います。
リージョンは ap-northeast-1 です。

## 手順(builder)

### 0. 段 0(マネージャーが実行)

terraform を回すロールは、terraform 自身では作れません。
そのため、マネージャーが aws コマンドのスクリプトで 1 本だけ実行します。
実験では自分が管理者として同じスクリプトを実行します。

```bash
bootstrap/create-builder-role.sh <SSO_ROLE_ARN>
```

ロール ARN を builder に伝えてもらいます。
その後、builder が付与された権限で state 用のバケットを作ります。

```bash
bootstrap/create-state-bucket.sh
```

### 1. 固有値と init

本番では `terraform/variables.tf` の `deployer_trusted_principals` の `default` に、その人物の identity の ARN を書いて commit します。
空のままだと terraform を実行した本人が deployer になります(実験用)。
tfvars と backend.hcl は使いません。

```bash
cd terraform
terraform init -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
```

### 2. apply

```bash
terraform apply
terraform output
```

作成に約 20 分かかります。

### 3. deployer への引き渡し

渡すものは `deployer_role_arn`、`ecr_repository_url`、`cluster_name`、`region`、`node_port` の 5 つです。

## 手順(deployer)

### 1. プロファイル

`~/.aws/config` に次のプロファイルを足します。
実験では `source_profile` に `default` を指定します。

```ini
[profile deployer]
role_arn       = <deployer_role_arn>
source_profile = <自分のログインプロファイル>
region         = ap-northeast-1
```

### 2. image の push

```bash
export AWS_PROFILE=deployer
ECR=<ecr_repository_url>
aws ecr get-login-password | docker login --username AWS --password-stdin "${ECR%/*}"
docker build -t "${ECR}:v1" app/
docker push "${ECR}:v1"
```

### 3. デプロイ

```bash
aws eks update-kubeconfig --name eks-exp
sed "s|IMAGE_PLACEHOLDER|${ECR}:v1|" app/k8s.yaml | kubectl apply -f -
kubectl -n app rollout status deploy/web
```

NLB の DNS 名は builder が `terraform output nlb_dns_name` で確認できます。
`http://<nlb_dns_name>/` に curl すると Pod の応答が返ります。

### 4. できないこと

deployer が見えるのは namespace `app` の中だけです。
namespace の作成、ノードの参照、他 namespace の Pod の参照は Forbidden になります。
RBAC と ResourceQuota も変更できません。

Service type=LoadBalancer と PersistentVolumeClaim は、ResourceQuota が 0 に制限しています。
terraform の外にクラウド資源ができるのを防ぐためです。

## 片付け(実験のみ)

destroy は実験の操作で、本番では行いません。

```bash
aws eks update-kubeconfig --name eks-exp
scripts/preflight-destroy.sh
(cd terraform && terraform destroy)
bootstrap/delete-builder-role.sh
scripts/check-leftovers.sh
bootstrap/delete-state-bucket.sh
```

destroy に約 15 分かかります。
state バケットは周回の間は残し、最後に一度だけ削除します。
`delete-state-bucket.sh` は builder の権限で実行できます。

## builder の権限(申請用)

初版であり、実験での検証前です。
検証で AccessDenied が出た Action を足し、確定版に差し替えます。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOnlyDiscovery",
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "eks:Describe*",
        "eks:List*",
        "ecr:Describe*",
        "ecr:List*",
        "ecr:GetLifecyclePolicy",
        "ecr:GetRepositoryPolicy",
        "elasticloadbalancing:Describe*",
        "autoscaling:Describe*",
        "iam:Get*",
        "iam:List*",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Network",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateVpc",
        "ec2:DeleteVpc",
        "ec2:ModifyVpcAttribute",
        "ec2:CreateSubnet",
        "ec2:DeleteSubnet",
        "ec2:ModifySubnetAttribute",
        "ec2:CreateInternetGateway",
        "ec2:DeleteInternetGateway",
        "ec2:AttachInternetGateway",
        "ec2:DetachInternetGateway",
        "ec2:AllocateAddress",
        "ec2:ReleaseAddress",
        "ec2:CreateNatGateway",
        "ec2:DeleteNatGateway",
        "ec2:CreateRouteTable",
        "ec2:DeleteRouteTable",
        "ec2:CreateRoute",
        "ec2:DeleteRoute",
        "ec2:AssociateRouteTable",
        "ec2:DisassociateRouteTable",
        "ec2:CreateSecurityGroup",
        "ec2:DeleteSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:AuthorizeSecurityGroupEgress",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:RevokeSecurityGroupEgress",
        "ec2:ModifySecurityGroupRules",
        "ec2:CreateTags",
        "ec2:DeleteTags"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Eks",
      "Effect": "Allow",
      "Action": [
        "eks:CreateCluster",
        "eks:DeleteCluster",
        "eks:UpdateClusterConfig",
        "eks:UpdateClusterVersion",
        "eks:TagResource",
        "eks:UntagResource",
        "eks:CreateNodegroup",
        "eks:DeleteNodegroup",
        "eks:UpdateNodegroupConfig",
        "eks:UpdateNodegroupVersion",
        "eks:CreateAccessEntry",
        "eks:DeleteAccessEntry",
        "eks:UpdateAccessEntry",
        "eks:AssociateAccessPolicy",
        "eks:DisassociateAccessPolicy"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Ecr",
      "Effect": "Allow",
      "Action": [
        "ecr:CreateRepository",
        "ecr:DeleteRepository",
        "ecr:TagResource",
        "ecr:UntagResource",
        "ecr:PutImageScanningConfiguration",
        "ecr:PutImageTagMutability",
        "ecr:BatchDeleteImage"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Elb",
      "Effect": "Allow",
      "Action": [
        "elasticloadbalancing:CreateLoadBalancer",
        "elasticloadbalancing:DeleteLoadBalancer",
        "elasticloadbalancing:ModifyLoadBalancerAttributes",
        "elasticloadbalancing:SetSecurityGroups",
        "elasticloadbalancing:SetSubnets",
        "elasticloadbalancing:CreateTargetGroup",
        "elasticloadbalancing:DeleteTargetGroup",
        "elasticloadbalancing:ModifyTargetGroup",
        "elasticloadbalancing:ModifyTargetGroupAttributes",
        "elasticloadbalancing:CreateListener",
        "elasticloadbalancing:DeleteListener",
        "elasticloadbalancing:ModifyListener",
        "elasticloadbalancing:AddTags",
        "elasticloadbalancing:RemoveTags"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AutoScalingAttach",
      "Effect": "Allow",
      "Action": [
        "autoscaling:AttachLoadBalancerTargetGroups",
        "autoscaling:DetachLoadBalancerTargetGroups",
        "autoscaling:AttachTrafficSources",
        "autoscaling:DetachTrafficSources"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IamRolesScoped",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:UpdateRole",
        "iam:UpdateRoleDescription",
        "iam:UpdateAssumeRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:PassRole"
      ],
      "Resource": [
        "arn:aws:iam::*:role/eks-exp-*",
        "arn:aws:iam::*:role/app-deployer"
      ]
    },
    {
      "Sid": "IamAttachOnlyKnownPolicies",
      "Effect": "Allow",
      "Action": [
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy"
      ],
      "Resource": [
        "arn:aws:iam::*:role/eks-exp-*",
        "arn:aws:iam::*:role/app-deployer"
      ],
      "Condition": {
        "ArnEquals": {
          "iam:PolicyARN": [
            "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
            "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
            "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
            "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly",
            "arn:aws:iam::*:policy/app-deployer-policy"
          ]
        }
      }
    },
    {
      "Sid": "IamPoliciesScoped",
      "Effect": "Allow",
      "Action": [
        "iam:CreatePolicy",
        "iam:DeletePolicy",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicyVersion",
        "iam:TagPolicy",
        "iam:UntagPolicy"
      ],
      "Resource": "arn:aws:iam::*:policy/app-deployer-policy"
    },
    {
      "Sid": "ServiceLinkedRoles",
      "Effect": "Allow",
      "Action": "iam:CreateServiceLinkedRole",
      "Resource": "*"
    },
    {
      "Sid": "StateBucketAdmin",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:ListBucket",
        "s3:ListBucketVersions",
        "s3:GetBucketLocation",
        "s3:GetBucketVersioning",
        "s3:PutBucketVersioning",
        "s3:GetBucketPublicAccessBlock",
        "s3:PutBucketPublicAccessBlock",
        "s3:GetEncryptionConfiguration",
        "s3:PutEncryptionConfiguration",
        "s3:GetBucketTagging",
        "s3:PutBucketTagging"
      ],
      "Resource": "arn:aws:s3:::tfstate-*-eks-exp"
    },
    {
      "Sid": "StateBucketObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion"
      ],
      "Resource": "arn:aws:s3:::tfstate-*-eks-exp/*"
    },
    {
      "Sid": "StateBucketDiscovery",
      "Effect": "Allow",
      "Action": "s3:ListAllMyBuckets",
      "Resource": "*"
    }
  ]
}
```

### 作れるものと作れないもの

作れるものは、ネットワーク、EKS、ECR、ELB、`eks-exp-*` と `app-deployer` の IAM ロールです。
名前が `tfstate-*-eks-exp` の S3 バケットの作成、設定、削除もできます。

次の 3 点を、申請文でそのまま説明します。

1. `iam:AttachRolePolicy` は `iam:PolicyARN` 条件で、AWS 管理の EKS と ECR のポリシー 4 つと `app-deployer-policy` に限っています。builder が作るロールに `AdministratorAccess` を付けることはできません。
2. builder は `app-deployer-policy` の中身(`CreatePolicyVersion`)と、`app-deployer` の信頼ポリシーを書き換えられます。この候補は厳密な境界ではありません。組織が境界を求めるなら、マネージャーに Permissions Boundary の付与を依頼します。
3. EC2 のネットワーク系 Action は Resource が `*` です。builder は自分が作っていない VPC も削除できます。

## deployer の権限(terraform 管理)

`terraform/deployer.tf` の 3 文を JSON にしたものです。
`<ACCOUNT_ID>` は実際のアカウント ID に置き換わります。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "EcrPushPullAppRepo",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:DescribeImages",
        "ecr:ListImages",
        "ecr:DescribeRepositories"
      ],
      "Resource": "arn:aws:ecr:ap-northeast-1:<ACCOUNT_ID>:repository/app"
    },
    {
      "Sid": "EksKubeconfig",
      "Effect": "Allow",
      "Action": "eks:DescribeCluster",
      "Resource": "arn:aws:eks:ap-northeast-1:<ACCOUNT_ID>:cluster/eks-exp"
    }
  ]
}
```

Kubernetes 側の権限は、Access Policy `AmazonEKSEditPolicy` を namespace `app` に限って関連付けています。
この権限では ResourceQuota と RBAC を変更できません。

## 申請文のたたき台

マネージャーへの依頼は 1 件です。

- 依頼内容: `bootstrap/create-builder-role.sh <自分の identity の ARN>` を実行して、`tf-builder` ロールを作ってほしい。ロールを作らず、自分の identity に `tf-builder-policy.json` を直接付けてもかまわない
- 添付: `create-builder-role.sh`、`delete-builder-role.sh`、`tf-builder-policy.json` の 3 つ
- 範囲の説明: このポリシーで作れるもの、作れないもの、資源名の接頭辞による限定。上の「作れるものと作れないもの」の 3 点を含める
- 期間と撤去: 作業後に自分が terraform destroy し、ロールも削除してよい

state 用のバケットは、付与された権限で自分が作ります。
マネージャーは terraform を使えない前提なので、段 0 は aws コマンドのスクリプトにしています。

## 可逆性

次のものには触りません。

- アカウント設定(S3 パブリックアクセスブロック、EBS 既定暗号化、IAM パスワードポリシー)
- Service Quotas
- IAM Identity Center と Organizations
- KMS のカスタマーマネージドキー
- CloudTrail と AWS Config

destroy 後に残ることを許容するものは次のとおりです。
サービスリンクロール(`AWSServiceRoleForAmazonEKS`、`AWSServiceRoleForAmazonEKSNodegroup`、`AWSServiceRoleForElasticLoadBalancing`、`AWSServiceRoleForAutoScaling`)は自動生成され、課金されません。
`~/.aws/config` に足したプロファイルは、手で消せます。
state 用 S3 バケットは周回中は残し、最後に `delete-state-bucket.sh` で消します。

`scripts/check-leftovers.sh` は、タグ `Project=eks-exp` の資源と、EKS、ECR、ELB、ASG、NAT Gateway、EIP、default 以外の VPC がゼロかを確かめます。
IAM ロール(`app-deployer`、`tf-builder`、`eks-exp-*`)と、`/aws/eks/` 配下のロググループも対象です。

## 実験ログ

第 1 段以降で追記します。
