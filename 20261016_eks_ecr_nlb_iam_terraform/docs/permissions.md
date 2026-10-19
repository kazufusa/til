# 権限

builder と deployer の権限を、実際のコードに合わせてまとめます。
AWS 側の JSON は、そのまま申請や確認に使えます。
`<cluster_name>` は terraform の変数 `cluster_name` の値で、既定は `eks-exp` です。

## 説明用の要約

### builder(tf-builder、申請する側)

| 付けるもの | 中身 | 一言 |
| --- | --- | --- |
| AmazonVPCFullAccess | AWS 管理ポリシー | ネットワークを作る |
| ElasticLoadBalancingFullAccess | AWS 管理ポリシー | 公開用の入口(NLB)を作る |
| AmazonEC2ContainerRegistryFullAccess | AWS 管理ポリシー | image 置き場(ECR)を作る |
| カスタム tf-builder-policy | 下の 7 項目 | EKS と、危険になりうる IAM と state だけ自前で縛る |

カスタムポリシーの 7 項目は次のとおりです。

1. EKS の全操作(`eks:*`)。書き込みは、名前が `<名前>` のクラスタとその配下の資源に限ります。Auto Scaling は負荷分散先の関連付けだけ
2. CloudFront の作成、更新、削除、タグ(HTTPS の入口用)
3. IAM ロールは名前が `<名前>-*` のものだけ作成と削除ができ、
   付けられるポリシーは、AWS 管理ポリシー 5 つと `<名前>-deployer-policy` に限ります。
   5 つは、EKS 用の 4 つと CloudWatchAgentServerPolicy です。
   管理者ポリシーを直接付けることはできません。
   deployer のポリシー内容と信頼先は builder が書けるため、完全な境界にするには Permissions Boundary が必要です
4. S3 は名前が `tfstate-*-<名前>` のバケットだけ作成、設定、削除、読み書き
5. 各サービスの参照(Describe、List、Get)と、CloudFront のプレフィックスリストの参照
6. CloudWatch Logs のロググループの作成と削除(名前が `/aws/containerinsights/<名前>/` で始まるものに限る)
7. 実験で見つかった 3 つ: `ec2:GetSecurityGroupsForVpc`(NLB 作成時)、`ec2:DisassociateAddress`(EIP 解放時)、`ec2:DescribeAddressesAttribute`(EIP 作成後の読み取り)

### deployer(<名前>-deployer、terraform で作って渡す側)

| 層 | できること | できないこと |
| --- | --- | --- |
| AWS | ECR の指定リポジトリへの push と pull、クラスタ情報の参照(`eks:DescribeCluster`)、CloudWatch Logs の読み取り(自分のクラスタのロググループ) | それ以外すべて(EC2、IAM、他の ECR、他のロググループ、ELB の参照も不可) |
| Kubernetes、namespace `app` の中 | 何でも(Deployment、Service、Secret の参照と編集、Role の付与) | ResourceQuota の変更、namespace 自体の削除 |
| Kubernetes、Pod の設定 | Pod Security の baseline に収まる Pod | 特権 Pod、hostPath、hostNetwork(baseline に拒否される) |
| Kubernetes、クラスタ全体 | 読み取り(ノード、namespace 一覧、他 namespace の Pod) | 他 namespace への書き込み、他 namespace の Secret 参照、namespace 作成 |
| クラウド資源 | なし | LoadBalancer 型 Service と PVC(quota で 0 件に固定) |

### マネージャーへの説明

> ネットワーク、ロードバランサ、ECR は AWS 管理ポリシーをそのまま使います。
> EKS は、自分のクラスタ名の資源に限った全権です。
> 自分でロールを作る権限は名前で縛ってあり、管理者ポリシーを直接付けることはできません。
> deployer のポリシー内容と信頼先は builder が書けるため、完全な境界にするには Permissions Boundary が必要です。

細かい最小権限の JSON は付録にあり、厳しく見たい場合に示します。

## builder の権限

### 申請向け構成

申請では、AWS 管理ポリシー 3 つとカスタムポリシー 1 つを `tf-builder` に付けます。
カスタムポリシー `tf-builder-policy` の実体は `bootstrap/tf-builder-policy.json` です。

| ポリシー | 種類 | 役割 |
| --- | --- | --- |
| `AmazonVPCFullAccess` | AWS 管理 | VPC、サブネット、NAT、EIP、SG などのネットワーク一式 |
| `ElasticLoadBalancingFullAccess` | AWS 管理 | NLB、target group、listener |
| `AmazonEC2ContainerRegistryFullAccess` | AWS 管理 | ECR リポジトリの作成と削除 |
| `tf-builder-policy` | カスタム | 下記の 7 項目 |

カスタムポリシーの内容は、次の 7 項目です。

- EKS: `eks:*`(書き込みはクラスタ名で限定)と、Auto Scaling の負荷分散先の関連付け
- IAM: 資源名と PolicyARN で限定
- S3: state バケットの名前で限定
- CloudFront: HTTPS の入口の作成と削除
- 参照: 各サービスの Describe、Get、List と、CloudFront のプレフィックスリスト
- CloudWatch Logs: `/aws/containerinsights/<名前>/` 配下のロググループの作成と削除
- 実験で見つかった ec2 の 3 Action

管理ポリシーは AWS が更新するので、申請の手間が減ります。
その代わり、権限は検証済みの最小構成より広くなります。
共有アカウントでは、付録の最小構成を申請します。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOnlyDiscovery",
      "Effect": "Allow",
      "Action": [
        "eks:Describe*",
        "eks:List*",
        "autoscaling:Describe*",
        "iam:Get*",
        "iam:List*",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Eks",
      "Effect": "Allow",
      "Action": "eks:*",
      "Resource": [
        "arn:aws:eks:*:*:cluster/eks-exp",
        "arn:aws:eks:*:*:nodegroup/eks-exp/*",
        "arn:aws:eks:*:*:addon/eks-exp/*",
        "arn:aws:eks:*:*:access-entry/eks-exp/*",
        "arn:aws:eks:*:*:podidentityassociation/eks-exp/*",
        "arn:aws:eks:*:*:access-policy/*"
      ]
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
        "arn:aws:iam::*:role/eks-exp-deployer"
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
        "arn:aws:iam::*:role/eks-exp-deployer"
      ],
      "Condition": {
        "ArnEquals": {
          "iam:PolicyARN": [
            "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
            "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
            "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
            "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly",
            "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
            "arn:aws:iam::*:policy/eks-exp-deployer-policy"
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
      "Resource": "arn:aws:iam::*:policy/eks-exp-deployer-policy"
    },
    {
      "Sid": "ServiceLinkedRoles",
      "Effect": "Allow",
      "Action": "iam:CreateServiceLinkedRole",
      "Resource": "*"
    },
    {
      "Sid": "StateBucket",
      "Effect": "Allow",
      "Action": [
        "s3:*"
      ],
      "Resource": [
        "arn:aws:s3:::tfstate-*-eks-exp",
        "arn:aws:s3:::tfstate-*-eks-exp/*"
      ]
    },
    {
      "Sid": "StateBucketDiscovery",
      "Effect": "Allow",
      "Action": "s3:ListAllMyBuckets",
      "Resource": "*"
    },
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": [
        "cloudfront:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "FoundByExperiment",
      "Effect": "Allow",
      "Action": [
        "ec2:GetSecurityGroupsForVpc",
        "ec2:DisassociateAddress",
        "ec2:DescribeAddressesAttribute"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:PutRetentionPolicy",
        "logs:DeleteRetentionPolicy",
        "logs:DescribeLogGroups",
        "logs:ListTagsForResource",
        "logs:TagResource",
        "logs:UntagResource",
        "logs:ListTagsLogGroup",
        "logs:TagLogGroup",
        "logs:UntagLogGroup"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/containerinsights/eks-exp/*"
    },
    {
      "Sid": "LogsDescribe",
      "Effect": "Allow",
      "Action": "logs:DescribeLogGroups",
      "Resource": "*"
    },
    {
      "Sid": "PrefixList",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeManagedPrefixLists",
        "ec2:GetManagedPrefixListEntries"
      ],
      "Resource": "*"
    }
  ]
}
```

### 権限一覧

| サービス | 主な Action | 何のために必要か |
| --- | --- | --- |
| EC2(ネットワーク) | VPC、サブネット、IGW、NAT、ルートテーブル、SG、EIP の作成と削除、CloudFront のプレフィックスリストの参照 | クラスタを置くネットワークの構築と、NLB の入口を CloudFront に限る SG ルール |
| EKS | `eks:*`(書き込みはクラスタ名で限定) | クラスタ、ノードグループ、Access Entry の管理 |
| ECR | リポジトリの作成と削除、image の削除 | image の置き場所 |
| ELB | LB、target group、listener の作成と削除 | NLB の構築 |
| Auto Scaling | target group の関連付け | ノードグループと NLB の接続 |
| IAM(ロール) | `<cluster_name>-*` の作成、削除、PassRole | クラスタ、ノード、deployer のロール |
| IAM(ポリシー) | 既知の 6 ポリシーの Attach と Detach、deployer のポリシーの作成 | ロールへの権限付与 |
| IAM(サービスリンクロール) | `CreateServiceLinkedRole` | EKS、ELB、Auto Scaling が最初に使うロール |
| S3 | `tfstate-*-<cluster_name>` の管理と読み書き | terraform の state |
| CloudFront | `cloudfront:*` | HTTPS の入口 |
| CloudWatch Logs | `/aws/containerinsights/<cluster_name>/` 配下のロググループの作成、削除、保存期間、タグ | Pod のログの転送先 |

### 実験で見つかった権限

初版の JSON では足りず、実験で AccessDenied になって追加した Action は次の 3 件です。

| Action | 何のために必要か |
| --- | --- |
| `ec2:GetSecurityGroupsForVpc` | セキュリティグループ付き NLB の作成 |
| `ec2:DisassociateAddress` | NAT 用 EIP の解放(destroy 時) |
| `ec2:DescribeAddressesAttribute` | NAT 用 EIP の作成直後の読み取り |

最初の 2 つは `ec2:Describe*` には含まれません。
`Describe*` は、名前が Describe で始まる Action だけに一致するためです。
`DisassociateAddress` は、apply では呼ばれません。
destroy にだけ必要な権限は、apply を通しただけでは見つかりません。

`DescribeAddressesAttribute` は、縮約で `ec2:Describe*` を外したときに漏れました。
`AmazonVPCFullAccess` にも含まれないためです。
欠けると、プロバイダーが EIP の作成後に読み取りを繰り返して先へ進まず、
NAT ができないまま、ノードも出口がなくて起動に失敗します。

### 作れるものと作れないもの

作れるものは、ネットワーク、EKS、ECR、ELB、CloudFront、`<cluster_name>-*` の IAM ロールです。
名前が `tfstate-*-<cluster_name>` の S3 バケットの作成、設定、削除もできます。

次の 5 点を、申請文でそのまま説明します。

1. `iam:AttachRolePolicy` は `iam:PolicyARN` 条件で、付けられるポリシーを限っています。
   AWS 管理の EKS、ECR、CloudWatch のポリシー 5 つと、deployer のポリシーだけです。
   builder が作るロールに `AdministratorAccess` を直接付けることはできません。
2. builder は deployer のポリシーの中身(`CreatePolicyVersion`)を書き換えられます。
   deployer ロールの信頼ポリシーも書き換えられます。
   この候補は厳密な境界ではありません。
3. 境界が必要な組織では、マネージャーに Permissions Boundary の付与を依頼します。
4. EC2、ELB、ECR、CloudFront は Resource が `*` です。builder は自分が作っていない VPC、LB、リポジトリ、ディストリビューションも削除できます。
5. EKS の書き込みは、クラスタ名で資源を限っています。他のクラスタには Access Entry を作れません。

EKS の資源限定と Pod Security のラベルは、検証済みです(2026-10-19)。
簡易版の builder で apply から destroy まで通り、AccessDenied は出ませんでした。

### 名前を変える手順

1. terraform の変数 `cluster_name` を変えます。
2. `scripts/render-policy.sh <名前>` で、builder 用の JSON を `bootstrap/rendered/<名前>/` に作ります。
3. 以後のスクリプトは `PROJECT=<名前>` を付けて実行します。

### 付録 検証済みの最小権限

管理ポリシーを使わず、この 1 つのポリシーだけで apply から destroy まで通した JSON です。
実体は `bootstrap/tf-builder-policy.minimal.json` です。
参考資料で、スクリプトはこの版を使いません。
使う場合は、`tf-builder-policy.json` をこの JSON で差し替え、
`create-builder-role.sh` の AWS 管理ポリシーを付ける 3 行を消します。

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
        "sts:GetCallerIdentity",
        "ec2:GetSecurityGroupsForVpc"
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
        "ec2:DisassociateAddress",
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
        "eks:DisassociateAccessPolicy",
        "eks:CreateAddon",
        "eks:DescribeAddon",
        "eks:UpdateAddon",
        "eks:DeleteAddon",
        "eks:DescribeAddonVersions",
        "eks:ListAddons",
        "eks:DescribeAddonConfiguration"
      ],
      "Resource": [
        "arn:aws:eks:*:*:cluster/eks-exp",
        "arn:aws:eks:*:*:nodegroup/eks-exp/*",
        "arn:aws:eks:*:*:addon/eks-exp/*",
        "arn:aws:eks:*:*:access-entry/eks-exp/*",
        "arn:aws:eks:*:*:podidentityassociation/eks-exp/*",
        "arn:aws:eks:*:*:access-policy/*"
      ]
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
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:GetDistributionConfig",
        "cloudfront:UpdateDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:TagResource",
        "cloudfront:UntagResource",
        "cloudfront:ListTagsForResource"
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
        "arn:aws:iam::*:role/eks-exp-deployer"
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
        "arn:aws:iam::*:role/eks-exp-deployer"
      ],
      "Condition": {
        "ArnEquals": {
          "iam:PolicyARN": [
            "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
            "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
            "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
            "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly",
            "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
            "arn:aws:iam::*:policy/eks-exp-deployer-policy"
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
      "Resource": "arn:aws:iam::*:policy/eks-exp-deployer-policy"
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
    },
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:PutRetentionPolicy",
        "logs:DeleteRetentionPolicy",
        "logs:DescribeLogGroups",
        "logs:ListTagsForResource",
        "logs:TagResource",
        "logs:UntagResource",
        "logs:ListTagsLogGroup",
        "logs:TagLogGroup",
        "logs:UntagLogGroup"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/containerinsights/eks-exp/*"
    },
    {
      "Sid": "LogsDescribe",
      "Effect": "Allow",
      "Action": "logs:DescribeLogGroups",
      "Resource": "*"
    },
    {
      "Sid": "PrefixList",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeManagedPrefixLists",
        "ec2:GetManagedPrefixListEntries"
      ],
      "Resource": "*"
    }
  ]
}
```

## deployer の権限

terraform が管理する権限で、AWS 側と Kubernetes 側があります。
ロールの名前は `<cluster_name>-deployer` で、ポリシーの名前は `<cluster_name>-deployer-policy` です。

### AWS 側

`terraform/deployer.tf` の 5 文を JSON にしたものです。
`<ACCOUNT_ID>` は実際のアカウント ID に、`<cluster_name>` はクラスタ名に置き換わります。

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
      "Resource": [
        "arn:aws:ecr:ap-northeast-1:<ACCOUNT_ID>:repository/app"
      ]
    },
    {
      "Sid": "EksKubeconfig",
      "Effect": "Allow",
      "Action": "eks:DescribeCluster",
      "Resource": "arn:aws:eks:ap-northeast-1:<ACCOUNT_ID>:cluster/<cluster_name>"
    },
    {
      "Sid": "LogsRead",
      "Effect": "Allow",
      "Action": "logs:DescribeLogGroups",
      "Resource": "*"
    },
    {
      "Sid": "LogsReadClusterGroups",
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "logs:FilterLogEvents",
        "logs:StartQuery",
        "logs:GetQueryResults",
        "logs:StopQuery"
      ],
      "Resource": [
        "arn:aws:logs:ap-northeast-1:<ACCOUNT_ID>:log-group:/aws/containerinsights/<cluster_name>/*",
        "arn:aws:logs:ap-northeast-1:<ACCOUNT_ID>:log-group:/aws/containerinsights/<cluster_name>/*:*"
      ]
    }
  ]
}
```

### Kubernetes 側

EKS の Access Entry に、次の 3 つを結びつけています。

- `AmazonEKSAdminPolicy`: namespace `app` に限る。Role や RoleBinding も作れる
- `AmazonEKSViewPolicy`: クラスタ全体。読み取り専用で、Secret の参照は含まれない(自分の namespace の Secret は admin 権限で扱えます)
- ClusterRole `node-viewer`: nodes の get、list、watch だけ。
  Kubernetes グループ `<cluster_name>-deployers` に結びつく

`AmazonEKSViewPolicy` はクラスタ直下の nodes を含みません。
そのため、ノードの参照は `node-viewer` が補っています。

| 操作 | 可否 |
| --- | --- |
| namespace `app` の中の操作 | できる |
| `get nodes` | できる |
| namespace の一覧 | できる |
| 他の namespace の Pod の参照 | できる |
| 自分の namespace(`app`)の Secret の参照と編集 | できる |
| ログの参照 | できる(`kubectl logs` と CloudWatch Logs の両方) |
| 他の namespace の Secret の参照 | できない |
| `delete nodes` | できない |
| namespace の作成 | できない |
| ResourceQuota の変更 | できない |
| 他の namespace への書き込み | できない |
| Service type=LoadBalancer の作成 | できない(ResourceQuota が 0 に制限) |

## 設計の方針

AWS の推奨に合わせた点は次のとおりです。

- IAM ユーザーではなくロールを使い、長期のアクセスキーを発行しない
- 権限は最小にし、IAM の対象は資源名の接頭辞(`<cluster_name>-*`)で限定する
- EKS の認可は aws-auth ConfigMap ではなく Access Entry で行う
- cluster-admin は platform だけが持ち、アプリ担当は namespace 限定にする
- namespace と ResourceQuota は platform が terraform で管理し、アプリ担当は変更できない
- deployer が terraform 外にクラウド資源を作れないよう、ResourceQuota で LoadBalancer と PVC を 0 にする
- 段 0 でマネージャーに頼むのは terraform 実行ロールの作成 1 件だけにし、残りは builder の権限内で完結させる

## セキュリティの現状

| 領域 | 守れている点 |
| --- | --- |
| ネットワーク | ノードは private subnet にあり、パブリック IP を持たない。外から届くのは CloudFront 経由の HTTPS だけで、NLB はセキュリティグループで CloudFront 以外を拒否する。外へ出るのは NAT の固定 IP だけ。プレフィックスリストは他人の CloudFront も含むため、アプリ側の認証(Slack 署名など)が前提 |
| 人の認証 | 長期のアクセスキーがない。SSO ログインの後にスイッチロールで作業する |
| builder | IAM の対象を資源名で限り、付けられるポリシーを PolicyARN 条件で限っている。管理者ポリシーは直接付けられない。ただし deployer のポリシーの書き換えで迂回できる |
| deployer | 書き込みは namespace `app` の中だけ。他の namespace の Secret の参照、namespace の作成、quota の変更はできない |
| 壊せない設計 | ResourceQuota が LoadBalancer と PVC を拒否するので、terraform 外に資源が残らず、destroy で戻せる |
| Pod の権限 | namespace に Pod Security の baseline を強制し、特権 Pod と hostPath を拒否する |
| ログ | 全 Pod の標準出力を CloudWatch Logs に転送し、30 日間保存する。deployer が読めるのは自分のクラスタのロググループだけ |
| state | S3 のバージョニング、暗号化、パブリックアクセスブロックを有効にしている |

## 移植先で追加を検討する対策

| 対策 | 内容 |
| --- | --- |
| 独自ドメインと証明書 | ACM と独自ドメインを使う。または CloudFront の既定ドメインのまま使う |
| EKS endpoint の制限 | API サーバーに接続できる CIDR を限定する |
| Permissions Boundary | builder が作るロールの権限に上限を設ける |
| 申請する権限の絞り込み | 共有アカウントでは、管理ポリシーを使わず最小構成を申請する |
| 監査ログ | CloudTrail と EKS の audit ログを有効にする |
| image の脆弱性検査 | ECR の scan_on_push を有効にする |
| Pod への権限付与 | EKS Pod Identity で、Pod ごとに AWS の権限を分ける |
