# 権限

builder と deployer の権限を、実際のコードに合わせてまとめます。
AWS 側の JSON は、そのまま申請や確認に使えます。
`<cluster_name>` は terraform の変数 `cluster_name` の値で、既定は `eks-exp` です。

## 説明用の要約

### builder(個人ロールに権限を付けてもらう側)

| 付けるもの | 中身 | 一言 |
| --- | --- | --- |
| AmazonVPCFullAccess | AWS 管理ポリシー | ネットワークを作る |
| ElasticLoadBalancingFullAccess | AWS 管理ポリシー | 公開用の入口(NLB)を作る |
| AmazonEC2ContainerRegistryFullAccess | AWS 管理ポリシー | image 置き場(ECR)を作る |
| カスタム `<名前>-builder-policy` | 下の 8 項目 | EKS、踏み台、IAM の最小限の書き込み、state を自前で縛る |

カスタムポリシーの 8 項目は次のとおりです。

1. EKS の全操作(`eks:*`)。書き込みは、名前が `<名前>` のクラスタとその配下の資源に限ります。Auto Scaling は負荷分散先の関連付けだけ
2. CloudFront の作成、更新、削除、タグ(HTTPS の入口用)
3. IAM は、EKS へ渡すロール 2 つ(`<名前>-cluster`、`<名前>-node`)と、
   踏み台のロール(`<名前>-bastion`、渡し先は ec2.amazonaws.com に限定)の PassRole だけ。
   ロールとポリシーの作成、削除、付け外し、信頼先の変更はできません
4. S3 は名前が `tfstate-*-<名前>` のバケットだけ作成、設定、削除、読み書き
5. 各サービスの参照(Describe、List、Get)
6. CloudWatch Logs のロググループの作成と削除(名前が `/aws/containerinsights/<名前>/` で始まるものに限る)
7. 実験で見つかった ec2 の 3 つ。`GetSecurityGroupsForVpc`(NLB 作成時)、`DisassociateAddress`(EIP 解放時)、
   `DescribeAddressesAttribute`(EIP 作成後の読み取り)
8. 踏み台。EC2 インスタンスの起動はタグ `Project=<名前>` 付きの t4g.nano だけ、停止と削除はそのタグのものだけ。
   起動時以外のインスタンスへのタグ付けは Deny し、他のインスタンスに `Project` タグを付けて消す抜け道を塞ぐ。SSM の接続(`ssm:StartSession`)は、
   タグ `Project=<名前>` の付いたインスタンスと、転送先を API サーバーの 443 に固定した自前のドキュメント(`<名前>-api-tunnel`)に限る。
   AWS の汎用ドキュメントは許さない。builder は、このドキュメントの作成と更新もできる(`document/<名前>-*`)

### deployer(開発者の個人ロールに `<名前>-deployer-policy` を付けてもらう側)

| 層 | できること | できないこと |
| --- | --- | --- |
| AWS | ECR の指定リポジトリへの push と pull、クラスタ情報の参照(`eks:DescribeCluster`)、CloudWatch Logs の読み取り(自分のクラスタのロググループ)、踏み台への SSM ポート転送(タグ `Project=<名前>` のインスタンスだけ) | それ以外すべて(EC2、IAM、他の ECR、他のロググループ、ELB の参照も不可) |
| Kubernetes、namespace `app` の中 | 何でも(Deployment、Service、Secret の参照と編集、Role の付与) | ResourceQuota の変更、namespace 自体の削除 |
| Kubernetes、Pod の設定 | Pod Security の baseline に収まる Pod | 特権 Pod、hostPath、hostNetwork(baseline に拒否される) |
| Kubernetes、クラスタ全体 | 読み取り(ノード、namespace 一覧、他 namespace の Pod) | 他 namespace への書き込み、他 namespace の Secret 参照、namespace 作成 |
| クラウド資源 | なし | LoadBalancer 型 Service と PVC(quota で 0 件に固定) |

### マネージャーへの説明

> ネットワーク、ロードバランサ、ECR は AWS 管理ポリシーをそのまま使います。
> EKS は、自分のクラスタ名の資源に限った全権です。
> IAM のロールとポリシーは作れません。できるのは、EKS へのロールの受け渡し(PassRole)だけです。
> 自分の権限を広げる経路はありません。

細かい最小権限の JSON は付録にあり、厳しく見たい場合に示します。

## builder の権限

### 申請向け構成

申請では、AWS 管理ポリシー 3 つとカスタムポリシー 1 つを builder の個人ロールに付けます。
カスタムポリシー `<名前>-builder-policy` の実体は `bootstrap/builder-policy.json` です。
付けるのはマネージャーで、`bootstrap/setup-iam.sh` が行います。

| ポリシー | 種類 | 役割 |
| --- | --- | --- |
| `AmazonVPCFullAccess` | AWS 管理 | VPC、サブネット、NAT、EIP、SG などのネットワーク一式 |
| `ElasticLoadBalancingFullAccess` | AWS 管理 | NLB、target group、listener |
| `AmazonEC2ContainerRegistryFullAccess` | AWS 管理 | ECR リポジトリの作成と削除 |
| `<名前>-builder-policy` | カスタム | 下記の 8 項目 |

カスタムポリシーの内容は、次の 8 項目です。

- EKS: `eks:*`(書き込みはクラスタ名で限定)と、Auto Scaling の負荷分散先の関連付け
- IAM: EKS へ渡すロール 2 つと踏み台のロールの PassRole だけ
- S3: state バケットの名前で限定
- CloudFront: HTTPS の入口の作成と削除
- 参照: 各サービスの Describe、Get、List
- CloudWatch Logs: `/aws/containerinsights/<名前>/` 配下のロググループの作成と削除
- 実験で見つかった ec2 の 3 Action
- 踏み台: EC2 インスタンスの操作と、SSM のポート転送

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
      "Sid": "IamPassRolesToEks",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::*:role/eks-exp-cluster",
        "arn:aws:iam::*:role/eks-exp-node"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "eks.amazonaws.com"
        }
      }
    },
    {
      "Sid": "IamPassRoleToBastion",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::*:role/eks-exp-bastion",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ec2.amazonaws.com"
        }
      }
    },
    {
      "Sid": "BastionDescribe",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceAttribute",
        "ec2:DescribeInstanceTypes",
        "ec2:DescribeInstanceCreditSpecifications",
        "ec2:DescribeImages",
        "ec2:DescribeVolumes",
        "ec2:DescribeTags"
      ],
      "Resource": "*"
    },
    {
      "Sid": "BastionLaunch",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/Project": "eks-exp",
          "ec2:InstanceType": "t4g.nano"
        }
      }
    },
    {
      "Sid": "BastionLaunchResources",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": [
        "arn:aws:ec2:*:*:subnet/*",
        "arn:aws:ec2:*:*:network-interface/*",
        "arn:aws:ec2:*:*:security-group/*",
        "arn:aws:ec2:*:*:volume/*",
        "arn:aws:ec2:*::image/*"
      ]
    },
    {
      "Sid": "BastionTagOnLaunch",
      "Effect": "Allow",
      "Action": "ec2:CreateTags",
      "Resource": [
        "arn:aws:ec2:*:*:instance/*",
        "arn:aws:ec2:*:*:volume/*"
      ],
      "Condition": {
        "StringEquals": {
          "ec2:CreateAction": "RunInstances"
        }
      }
    },
    {
      "Sid": "BastionManage",
      "Effect": "Allow",
      "Action": [
        "ec2:TerminateInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:ModifyInstanceAttribute",
        "ec2:ModifyInstanceMetadataOptions"
      ],
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Project": "eks-exp"
        }
      }
    },
    {
      "Sid": "DenyRetagInstances",
      "Effect": "Deny",
      "Action": "ec2:CreateTags",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringNotEquals": {
          "ec2:CreateAction": "RunInstances"
        }
      }
    },
    {
      "Sid": "BastionTunnel",
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "ssm:resourceTag/Project": "eks-exp"
        },
        "BoolIfExists": {
          "ssm:SessionDocumentAccessCheck": "true"
        }
      }
    },
    {
      "Sid": "BastionTunnelDocument",
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ssm:*:*:document/eks-exp-api-tunnel"
    },
    {
      "Sid": "BastionTunnelEnd",
      "Effect": "Allow",
      "Action": [
        "ssm:TerminateSession",
        "ssm:ResumeSession"
      ],
      "Resource": "arn:aws:ssm:*:*:session/*",
      "Condition": {
        "StringLike": {
          "ssm:resourceTag/aws:ssmmessages:session-id": "${aws:userid}"
        }
      }
    },
    {
      "Sid": "TunnelDocumentAdmin",
      "Effect": "Allow",
      "Action": [
        "ssm:CreateDocument",
        "ssm:DeleteDocument",
        "ssm:UpdateDocument",
        "ssm:UpdateDocumentDefaultVersion",
        "ssm:DescribeDocument",
        "ssm:GetDocument",
        "ssm:DescribeDocumentPermission",
        "ssm:ListDocumentVersions",
        "ssm:AddTagsToResource",
        "ssm:RemoveTagsFromResource",
        "ssm:ListTagsForResource"
      ],
      "Resource": "arn:aws:ssm:*:*:document/eks-exp-*"
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
    }
  ]
}
```

### 自作ポリシーが要る理由

AWS 管理ポリシー 3 つで足りるのはネットワーク、ELB、ECR だけです。
残りは既製品が無いか、既製品では広すぎるため、自作ポリシーに書きます。

| 自作ポリシーに入っているもの | 既製品で代わりになるか |
| --- | --- |
| EKS の操作(`eks-exp` のクラスタ関連に限定) | 無い。作成までできる EKS 用の既製品は無い |
| CloudFront | `CloudFrontFullAccess` はあるが全 distribution が対象 |
| IAM ロールの作成(名前 `eks-exp-*` 限定、付けられるポリシー限定) | `IAMFullAccess` だと何でもできて危険 |
| S3 の state バケット(名前限定) | `AmazonS3FullAccess` だと全バケット |
| CloudWatch Logs のロググループ(名前限定) | 同上 |
| Auto Scaling への target group 紐づけ | 無い |
| 実験で見つかった ec2 の 3 つ | `AmazonVPCFullAccess` に含まれていなかった |
| 踏み台のインスタンス操作と SSM の接続 | `AmazonEC2FullAccess` と `AmazonSSMFullAccess` は全インスタンスが対象で広すぎる |

### 権限一覧

| サービス | 主な Action | 何のために必要か |
| --- | --- | --- |
| EC2(ネットワーク) | VPC、サブネット、IGW、NAT、ルートテーブル、SG、EIP の作成と削除、CloudFront のプレフィックスリストの参照 | クラスタを置くネットワークの構築と、NLB の入口を CloudFront に限る SG ルール |
| EKS | `eks:*`(書き込みはクラスタ名で限定) | クラスタ、ノードグループ、Access Entry の管理 |
| ECR | リポジトリの作成と削除、image の削除 | image の置き場所 |
| ELB | LB、target group、listener の作成と削除 | NLB の構築 |
| Auto Scaling | target group の関連付け | ノードグループと NLB の接続 |
| IAM(ロール) | `<cluster_name>-*` の作成、削除、PassRole | クラスタ、ノード、deployer のロール |
| EC2(インスタンス) | RunInstances(タグ `Project` 付きの t4g.nano だけ)、TerminateInstances など(タグ `Project` のものだけ)、Describe。起動時以外のインスタンスへの CreateTags は Deny | 踏み台の作成と削除。起動時に `<cluster_name>-bastion` の PassRole が要る |
| SSM | `ssm:StartSession`(タグ `Project` のインスタンスと `<cluster_name>-api-tunnel` のドキュメント)、自分が始めたセッションの TerminateSession と ResumeSession(`aws:userid` で判定)。builder はこのドキュメントの作成と更新も(`document/<cluster_name>-*`) | 手元から API サーバーの 443 へのトンネル(builder と deployer の両方)。転送先は固定で、他のホストへは出られない。シェルと SendCommand は使えない |
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

作れるものは、ネットワーク、EKS、ECR、ELB、CloudFront です。
名前が `tfstate-*-<cluster_name>` の S3 バケットの作成、設定、削除もできます。
IAM のロールとポリシーは作れません。

次の 4 点を、申請文でそのまま説明します。

1. IAM の書き込みは `iam:PassRole` だけです。EKS へ渡すロール 2 つ(渡し先は eks.amazonaws.com に限定)と、
   踏み台のロール 1 つ(渡し先は ec2.amazonaws.com に限定)です。
   開発者への権限付与はマネージャーが行い、builder は関与しません。
2. builder は EKS の Access Entry を作れるので、クラスタ内の権限なら任意のロールに付けられます。
   クラスタはこの環境専用なので受け入れます。
3. ネットワーク系の EC2、ELB、ECR、CloudFront は Resource が `*` です。
   builder は自分が作っていない VPC、LB、リポジトリ、ディストリビューションも削除できます。
   EC2 インスタンスだけは、タグ `Project=<名前>` のものに限っています。
4. EKS の書き込みは、クラスタ名で資源を限っています。他のクラスタには Access Entry を作れません。

EKS の資源限定と Pod Security のラベルは、検証済みです(2026-10-19)。
簡易版の builder で apply から destroy まで通り、AccessDenied は出ませんでした。
踏み台とトンネルの権限(EC2 の 13 Action、PassRole、SSM の 3 文)も、2026-10-22 に apply から destroy まで通しました。
その後、EC2 インスタンスの権限をタグ `Project` と t4g.nano に絞り、1 段目の apply と destroy で確かめました。
builder は、他の型やタグ無しのインスタンスを起動できず、タグの無いインスタンスを止めることも消すことも、タグを付けることもできませんでした。
開発者役は、踏み台でシェルを開けず、タグの無いインスタンスへも転送できませんでした。
当時の検証では、AWS の汎用ドキュメントを許していたため、踏み台を経由してインターネットへ転送できました(example.com:443 が 200)。送信元は NAT の固定 IP です。
その後、転送先を API サーバーの 443 に固定した自前のドキュメントへ変え、StartSession をそのドキュメントだけに限りました。
開発者役は、汎用ドキュメントも、`host` の上書きも拒否されました。
セッションの終了と再開は、`aws:userid` で自分が始めたものだけに絞りました。
他人のセッションの終了は AccessDenied になり、builder 役と開発者役のシェルと SendCommand も AccessDenied でした。
防御は IAM に依存します。広い `ssm:StartSession` や汎用ドキュメントを誰かが許すと、穴は再び開きます。
踏み台自体も、SSM エージェントのために NAT 経由でインターネットへ出られます。

### 名前を変える手順

1. terraform の変数 `cluster_name` を変えます。
2. `scripts/render-policy.sh <名前>` で、マネージャーに渡す一式を `bootstrap/rendered/<名前>/` に作ります。
3. 以後のスクリプトは `PROJECT=<名前>` を付けて実行します。

### 付録 検証済みの最小権限

管理ポリシーを使わず、この 1 つのポリシーだけで apply から destroy まで通した JSON です。
実体は `bootstrap/builder-policy.minimal.json` です。
参考資料で、スクリプトはこの版を使いません。
使う場合は、`builder-policy.json` をこの JSON で差し替え、
`setup-iam.sh` の AWS 管理ポリシーを付ける 3 行を消します。
IAM を作らない形への追従は机上で行い、apply での再検証はしていません。
空白を除いて約 7,100 文字あり、管理ポリシー 1 つの上限 6,144 文字を超えます。
使うときは、Statement を 2 つのポリシーに分けて付けます。

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
      "Sid": "IamPassRolesToEks",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::*:role/eks-exp-cluster",
        "arn:aws:iam::*:role/eks-exp-node"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "eks.amazonaws.com"
        }
      }
    },
    {
      "Sid": "IamPassRoleToBastion",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::*:role/eks-exp-bastion",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ec2.amazonaws.com"
        }
      }
    },
    {
      "Sid": "BastionLaunch",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/Project": "eks-exp",
          "ec2:InstanceType": "t4g.nano"
        }
      }
    },
    {
      "Sid": "BastionLaunchResources",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": [
        "arn:aws:ec2:*:*:subnet/*",
        "arn:aws:ec2:*:*:network-interface/*",
        "arn:aws:ec2:*:*:security-group/*",
        "arn:aws:ec2:*:*:volume/*",
        "arn:aws:ec2:*::image/*"
      ]
    },
    {
      "Sid": "BastionTagOnLaunch",
      "Effect": "Allow",
      "Action": "ec2:CreateTags",
      "Resource": [
        "arn:aws:ec2:*:*:instance/*",
        "arn:aws:ec2:*:*:volume/*"
      ],
      "Condition": {
        "StringEquals": {
          "ec2:CreateAction": "RunInstances"
        }
      }
    },
    {
      "Sid": "BastionManage",
      "Effect": "Allow",
      "Action": [
        "ec2:TerminateInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:ModifyInstanceAttribute",
        "ec2:ModifyInstanceMetadataOptions"
      ],
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Project": "eks-exp"
        }
      }
    },
    {
      "Sid": "DenyRetagInstances",
      "Effect": "Deny",
      "Action": "ec2:CreateTags",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringNotEquals": {
          "ec2:CreateAction": "RunInstances"
        }
      }
    },
    {
      "Sid": "BastionTunnel",
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "ssm:resourceTag/Project": "eks-exp"
        },
        "BoolIfExists": {
          "ssm:SessionDocumentAccessCheck": "true"
        }
      }
    },
    {
      "Sid": "BastionTunnelDocument",
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ssm:*:*:document/eks-exp-api-tunnel"
    },
    {
      "Sid": "BastionTunnelEnd",
      "Effect": "Allow",
      "Action": [
        "ssm:TerminateSession",
        "ssm:ResumeSession"
      ],
      "Resource": "arn:aws:ssm:*:*:session/*",
      "Condition": {
        "StringLike": {
          "ssm:resourceTag/aws:ssmmessages:session-id": "${aws:userid}"
        }
      }
    },
    {
      "Sid": "TunnelDocumentAdmin",
      "Effect": "Allow",
      "Action": [
        "ssm:CreateDocument",
        "ssm:DeleteDocument",
        "ssm:UpdateDocument",
        "ssm:UpdateDocumentDefaultVersion",
        "ssm:DescribeDocument",
        "ssm:GetDocument",
        "ssm:DescribeDocumentPermission",
        "ssm:ListDocumentVersions",
        "ssm:AddTagsToResource",
        "ssm:RemoveTagsFromResource",
        "ssm:ListTagsForResource"
      ],
      "Resource": "arn:aws:ssm:*:*:document/eks-exp-*"
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
    }
  ]
}
```

## deployer の権限

AWS 側はマネージャーが `attach-deployer-policy.sh` で開発者の個人ロールに付け、Kubernetes 側は terraform が管理します。
ポリシーの名前は `<cluster_name>-deployer-policy` です。スイッチ先のロールはありません。
開発者の ARN は builder が `deployer_role_arns` に書き、terraform が EKS の Access Entry を作ります。

### AWS 側

実体は `bootstrap/deployer-policy.json` で、8 文からなります。名前の `eks-exp` は `cluster_name` に置き換わります。
ECR はリポジトリ名ではなく、タグ `Project=<cluster_name>` で限定します(terraform が全資源に付けるタグです)。

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
      "Sid": "EcrPushPullProjectRepos",
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
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Project": "eks-exp"
        }
      }
    },
    {
      "Sid": "EksKubeconfig",
      "Effect": "Allow",
      "Action": "eks:DescribeCluster",
      "Resource": "arn:aws:eks:*:*:cluster/eks-exp"
    },
    {
      "Sid": "BastionTunnel",
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "ssm:resourceTag/Project": "eks-exp"
        },
        "BoolIfExists": {
          "ssm:SessionDocumentAccessCheck": "true"
        }
      }
    },
    {
      "Sid": "BastionTunnelDocument",
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ssm:*:*:document/eks-exp-api-tunnel"
    },
    {
      "Sid": "BastionTunnelEnd",
      "Effect": "Allow",
      "Action": [
        "ssm:TerminateSession",
        "ssm:ResumeSession"
      ],
      "Resource": "arn:aws:ssm:*:*:session/*",
      "Condition": {
        "StringLike": {
          "ssm:resourceTag/aws:ssmmessages:session-id": "${aws:userid}"
        }
      }
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
        "arn:aws:logs:*:*:log-group:/aws/containerinsights/eks-exp/*",
        "arn:aws:logs:*:*:log-group:/aws/containerinsights/eks-exp/*:*"
      ]
    }
  ]
}
```

### Kubernetes 側

EKS の Access Entry に、次の 3 つを結びつけています。

- `AmazonEKSAdminPolicy`: namespace `app` に限る。Role や RoleBinding も作れる
- `AmazonEKSViewPolicy`: クラスタ全体。読み取り専用で、Secret の参照は含まれない。
  自分の namespace の Secret は admin 権限で扱えます
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
- IAM のロールとポリシーは管理者が作り、builder は作れないようにする
- EKS の認可は aws-auth ConfigMap ではなく Access Entry で行う
- cluster-admin は platform だけが持ち、アプリ担当は namespace 限定にする
- namespace と ResourceQuota は platform が terraform で管理し、アプリ担当は変更できない
- deployer が terraform 外にクラウド資源を作れないよう、ResourceQuota で LoadBalancer と PVC を 0 にする
- 段 0 でマネージャーに頼むのは `setup-iam.sh` の 1 回だけにし、残りは builder の権限内で完結させる
- 構築先のアカウントを `allowed_account_ids` で固定し、別のアカウントへの誤った構築を防ぐ

## セキュリティの現状

| 領域 | 守れている点 |
| --- | --- |
| ネットワーク | EKS の API サーバーはプライベートだけで、外から直接は届かない。入口は SSM の踏み台で、private subnet にあり、公開 IP も SG の inbound もない。クラスタの SG は踏み台の SG からの 443 だけを許す。ノードは private subnet にあり、パブリック IP を持たない。NLB は内部向けで、CloudFront から VPC origin で届く。NLB の SG は CloudFront が作る SG からの 80 だけを許可する。CloudFront から NLB までの HTTP はインターネットを通らない。外へ出るのは NAT の固定 IP だけ。CloudFront の URL は誰でも開けるため、アプリ側の認証(Slack 署名など)が前提 |
| 人の認証 | 長期のアクセスキーがない。builder も開発者も、ログインした個人ロールのまま作業する |
| builder | IAM のロールとポリシーを作れない。できるのは EKS へのロールの受け渡しだけで、自分の権限を広げる経路がない |
| deployer | 書き込みは namespace `app` の中だけ。他の namespace の Secret の参照、namespace の作成、quota の変更はできない |
| 壊せない設計 | ResourceQuota が LoadBalancer と PVC を拒否するので、terraform 外に資源が残らず、destroy で戻せる |
| Pod の権限 | namespace に Pod Security の baseline を強制し、特権 Pod と hostPath を拒否する |
| ログ | 全 Pod の標準出力を CloudWatch Logs に転送し、30 日間保存する。deployer が読めるのは自分のクラスタのロググループだけ |
| state | S3 のバージョニング、暗号化、パブリックアクセスブロックを有効にしている |

## 移植先で追加を検討する対策

| 対策 | 内容 |
| --- | --- |
| 独自ドメインと証明書 | ACM と独自ドメインを使う。または CloudFront の既定ドメインのまま使う |
| 踏み台の強化 | AMI を固定し、SSM セッションのログを S3 や CloudWatch Logs に残す |
| 申請する権限の絞り込み | 共有アカウントでは、管理ポリシーを使わず最小構成を申請する |
| 監査ログ | CloudTrail と EKS の audit ログを有効にする |
| image の脆弱性検査 | ECR の scan_on_push を有効にする |
| Pod への権限付与 | EKS Pod Identity で、Pod ごとに AWS の権限を分ける |
