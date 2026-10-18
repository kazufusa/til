# 初学者向けの解説

AWS の IAM も Kubernetes も知らない人を想定して、この環境の仕組みを 10 の話題に分けて説明します。
手順の詳細と構成図は、末尾の付録にまとめています。
この文書のシェルのコマンドは、bash で実行する前提です。

## 1. ロールと帽子

IAM ユーザーは、ログインした本人に固定で紐づく権限の持ち主です。
IAM ロールは、人に付けたり外したりできる帽子のようなものです。
帽子をかぶり替えることを、スイッチロールと呼びます。

SSO でログインした時点で、すでに 1 つ目の帽子(SSO のロール)をかぶっています。
帽子には ID があり、それが ARN です。
今かぶっている帽子の ARN は、次のコマンドで見られます。

```bash
aws sts get-caller-identity --query Arn --output text
```

SSO の場合、ここで出る ARN は次の形です。

```text
arn:aws:sts::<ACCOUNT_ID>:assumed-role/AWSReservedSSO_<名前>_<ハッシュ>/<ユーザー名>
```

信頼ポリシーに書く ARN は、これを次の形に直したものです。

```text
arn:aws:iam::<ACCOUNT_ID>:role/aws-reserved/sso.amazonaws.com/<リージョン>/AWSReservedSSO_<名前>_<ハッシュ>
```

`assumed-role` を `role` に変え、`sts` を `iam` に変え、末尾のユーザー名を落とします。
`aws-reserved/sso.amazonaws.com/<リージョン>/` の道筋を、ロール名の前に足します。

## 2. 段 0 と段 1

terraform を回すための帽子は、terraform 自身では作れません。
帽子がなければ terraform を動かせず、帽子を作るのに terraform が要るからです。
そこで、この最初の 1 個だけは、マネージャーがスクリプトで作ります。
これが段 0 です。

段 1 では、その帽子(`tf-builder`)をかぶった builder が、残りのすべてを terraform で作ります。
ネットワーク、EKS、ECR、NLB、そして `<cluster_name>-deployer` の帽子まで含みます。
マネージャーに頼むのは段 0 の 1 回だけで済みます。

## 3. builder と deployer の分担

builder は環境を作る人で、terraform の apply と destroy を担当します。
deployer はアプリの開発者で、image を ECR に置き、kubectl でアプリを動かします。
2 人の帽子が違うので、できることも違います。

builder はクラスタそのものとネットワークを作れます。
deployer は、できあがった環境の中でアプリを入れ替えるだけです。
deployer はクラスタの設定や権限を変えられません。

## 4. kubectl の認証と認可

kubectl がクラスタに入るとき、まず認証があります。
`aws eks get-token` が、今かぶっている帽子の鍵を使って、短時間だけ有効なトークンを作ります。
kubectl は、このトークンをクラスタに見せます。

次に認可があります。
EKS の Access Entry が、帽子と Kubernetes 上の権限を対応づけます。
たとえば `<cluster_name>-deployer` の帽子には、namespace `app` の admin という権限が結びついています。

IAM ポリシーには Kubernetes の権限を書けません。
IAM ポリシーは AWS の API の許可であり、Kubernetes の中の操作は別の仕組みで決まるからです。
そのため、`<cluster_name>-deployer` には IAM ポリシーと Access Entry の 2 か所で権限を与えています。

`aws eks update-kubeconfig` には `--user-alias` も付けます。
kubeconfig の user エントリは、名前が同じだと別のプロファイルのものと共有され、上書きされるためです。

## 5. ノードと Pod

ノードは、Kubernetes が使う EC2 のサーバーです。
Pod は、そのノードの上で動くコンテナの入れ物です。
アプリは Pod の中で動きます。

ノードは builder が terraform で作ります。
Pod は deployer が kubectl で作ります。
ノードの台数を決めるのは builder で、何を動かすかを決めるのは deployer です。

## 6. URL から Pod までの道のり

外から届いたリクエストは、NLB、ノードの 30080 番ポート、Service、Pod の順に進みます。
NLB は builder が terraform で作り、Service と Pod は deployer が作ります。

2 人の作業は、30080 という 1 つの数字だけでつながっています。
terraform の NLB は、全ノードの 30080 に転送します。
deployer の Service は、`nodePort` を 30080 に固定して受けます。
この数字がずれると、NLB のヘルスチェックが通らず、URL に届きません。

ノードは private subnet にあり、パブリック IP を持ちません。
外から届くのは CloudFront 経由の通信だけで、NLB は CloudFront 以外からの接続を受けません。
外へ出るのは NAT の固定 IP だけです。

Pod から外へ出る通信は、NAT Gateway を通ります。
送信元の IP は NAT Gateway の固定 EIP になるので、通信先の許可リストに入れられます。

## 7. HTTPS の入口

ELB の既定ドメインには、証明書を発行できません。
そのため、CloudFront の既定ドメイン(`*.cloudfront.net`)で HTTPS にしています。
キャッシュは無効にしてあり、HTTP で来たリクエストは HTTPS へ転送します。
CloudFront の後ろは、これまでどおり NLB です。
CloudFront から NLB へは HTTP で届きます。
NLB のセキュリティグループは CloudFront のプレフィックスリストだけを許すので、NLB の URL を直接開いても届きません。

ログも、入口と同じく最初から用意します。
`kubectl logs` で見えるのは動いている Pod のログだけで、Pod が作り直されると消えます。
開発環境でもログを転送しておくのが普通です。
AWS 公式のアドオンが全 Pod の標準出力を CloudWatch Logs に送り、7 日間残します。
読み取りの権限は deployer に付けてあります。

## 8. namespace の権限と ResourceQuota

namespace は、クラスタを区切る名前の箱です。
deployer は、namespace `app` の中では admin です。
クラスタ全体では読み取りだけができ、ノードや他の namespace の Pod の状態を見て、Pending の原因を追えます。

cluster-admin は platform(builder)だけが持ちます。
アプリ担当に配ると、namespace の作成や権限の書き換えまでできてしまうからです。

namespace `app` には、ResourceQuota を置いています。
Service の LoadBalancer と PVC(ディスクの要求)を 0 個に制限する設定です。
これらは Kubernetes から ELB や EBS をクラウド側に作らせるため、terraform の管理外に資源が増えます。
quota で塞いでおけば、destroy で必ず元に戻せます。
quota の変更は deployer にはできません。

## 9. ECR と Pod の紐付け

ECR は、コンテナの image を置く AWS の倉庫です。
deployer が manifest に書くのは、image の名前だけです。
Pod を起こすときは、ノードが ECR から image を引いてきます。

pull の権限は、ノードの帽子(ノードロール)にあります。
これは builder が terraform で付けています。
push の権限は、`<cluster_name>-deployer` の帽子にあります。
こちらも builder が terraform で付けています。
deployer 自身は、どちらの権限も変更できません。

## 10. マネージャーへの頼み方

マネージャーに渡すのは、スクリプト 2 本とポリシーの JSON 1 つです。
作成用の `create-builder-role.sh` と、撤去用の `delete-builder-role.sh` です。
ポリシーは `tf-builder-policy.json` です。
頼むのは、`create-builder-role.sh` の実行 1 回だけです。

ポリシーは、実験で apply から destroy まで通して検証した候補です。
ただし、硬い境界ではありません。
builder が `<cluster_name>-deployer` の権限を書き換えられるなど、限界があります。
その限界は、申請文で説明します。
詳細は `docs/permissions.md` と `docs/request.md` にあります。

## 付録 構成と手順の詳細

### 構成図

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
その IP は `terraform output nat_public_ip` で確認します。

### 前提ツール

terraform 1.10 以上、aws cli v2、kubectl、docker、jq を使います。
リージョンは ap-northeast-1 です。

### 手順(builder)

以降の builder の操作は、実験では `AWS_PROFILE=builder` で実行します。
本番では、マネージャーが付与した identity で実行します。

#### 0-a. ロール作成(マネージャー)

```bash
bootstrap/create-builder-role.sh <builder のログイン identity の ARN>
```

マネージャーは、できあがったロールの ARN を builder に伝えます。
実験では、自分が管理者としてこのスクリプトを実行します。

#### 0-b. state バケット作成(builder)

builder は `~/.aws/config` に `builder` プロファイルを足します。

```ini
[profile builder]
role_arn       = <tf-builder のロール ARN>
source_profile = default
region         = ap-northeast-1
```

プロファイルを切り替えてから、付与された権限で state 用のバケットを作ります。

```bash
export AWS_PROFILE=builder
bootstrap/create-state-bucket.sh
```

#### 1. 固有値と init

本番では、その人物の identity の ARN を書いて commit します。
書く場所は `terraform/variables.tf` の `deployer_trusted_principals` の `default` です。
空のままだと terraform を実行した本人が deployer になります(実験用)。
tfvars と backend.hcl は使いません。

```bash
cd terraform
terraform init -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
```

#### 2. apply

```bash
terraform apply
terraform output
```

作成に約 20 分かかります。

#### 3. deployer への引き渡し

渡すものは次の 6 つです。

- `deployer_role_arn`
- `ecr_repository_url`
- `cluster_name`
- `region`
- `node_port`
- `nlb_dns_name`

### 手順(deployer)

deployer の手順は、値が埋まった `docs/deployer.md` にまとめています。

### 片付け(実験のみ)

destroy は実験の操作で、本番では行いません。

```bash
aws eks update-kubeconfig --name eks-exp --alias <alias> --user-alias <alias>
scripts/preflight-destroy.sh
(cd terraform && terraform destroy)
bootstrap/delete-builder-role.sh
scripts/check-leftovers.sh
bootstrap/delete-state-bucket.sh
```

destroy に約 15 分かかります。
state バケットは周回の間は残し、最後に一度だけ削除します。
`delete-state-bucket.sh` は builder の権限で実行できます。

### 実験用プロファイル

実験では、管理者の `default` プロファイル(SSO)を使います。
`builder` と `deployer` の 2 プロファイルは、`default` からスイッチロールします。
どちらも `role_arn` と `source_profile = default` で定義します。

### 可逆性

次のものには触りません。

- アカウント設定(S3 パブリックアクセスブロック、EBS 既定暗号化、IAM パスワードポリシー)
- Service Quotas
- IAM Identity Center と Organizations
- KMS のカスタマーマネージドキー
- CloudTrail と AWS Config

destroy 後に残ることを許容するものは 3 種類です。
1 つ目は、次の 4 つのサービスリンクロールです。

- `AWSServiceRoleForAmazonEKS`
- `AWSServiceRoleForAmazonEKSNodegroup`
- `AWSServiceRoleForElasticLoadBalancing`
- `AWSServiceRoleForAutoScaling`

どれも自動生成され、課金されません。
2 つ目は、`~/.aws/config` に足したプロファイルです。手で消せます。
3 つ目は、state 用 S3 バケットです。周回中は残し、最後に `delete-state-bucket.sh` で消します。

`scripts/check-leftovers.sh` は、タグ `Project=eks-exp` の資源がゼロかを確かめます。
EKS、ECR、ELB、ASG、NAT Gateway、EIP、default 以外の VPC もゼロであることを確かめます。
IAM ロール(`eks-exp-deployer`、`tf-builder`、`eks-exp-*`)と、`/aws/eks/` 配下のロググループも対象です。
