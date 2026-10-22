# 初学者向けの解説

AWS の IAM も Kubernetes も知らない人を想定して、この環境の仕組みを 10 の話題に分けて説明します。
手順の詳細と構成図は、末尾の付録にまとめています。
この文書のシェルのコマンドは、bash で実行する前提です。

## 1. ロールとスイッチロール

IAM ユーザーは、ログインした本人に固定で紐づく権限の持ち主です。
IAM ロールは、権限をまとめた役割で、人や仕組みが一時的に引き受けて使います。
今の役割から別の役割に切り替えることを、スイッチロールと呼びます。

SSO でログインした時点で、すでに 1 つ目のロール(SSO のロール)を引き受けています。
ロールには ID があり、それが ARN です。
今引き受けているロールの ARN は、次のコマンドで見られます。

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

IAM のロールとポリシーは、terraform では作りません。
builder がロールを作れると、自分に任意の権限を与えられてしまうからです。
そこで、マネージャーが `setup-iam.sh` で、EKS と踏み台用のロール 3 つとポリシー 2 つをまとめて作り、
builder の個人ロールに権限を付けます。開発者の個人ロールには `attach-deployer-policy.sh` で付けます。これが段 0 です。

段 1 では、権限の付いた builder が、残りのすべてを terraform で作ります。
ネットワーク、EKS、踏み台、ECR、NLB、CloudFront です。IAM ロールは名前で参照するだけです。
マネージャーに頼むのは段 0 の 1 回だけで済みます。

## 3. builder と deployer の分担

builder は環境を作る人で、terraform の apply と destroy を担当します。
deployer はアプリの開発者で、image を ECR に置き、kubectl でアプリを動かします。
2 人のロールが違うので、できることも違います。

builder はクラスタそのものとネットワークを作れます。
deployer は、できあがった環境の中でアプリを入れ替えるだけです。
deployer はクラスタの設定や権限を変えられません。

## 4. kubectl の認証と認可

kubectl がクラスタに入るとき、まず認証があります。
`aws eks get-token` が、今引き受けているロールの認証情報で、短時間だけ有効なトークンを作ります。
kubectl は、このトークンをクラスタに見せます。

次に認可があります。
EKS の Access Entry が、IAM ロールと Kubernetes 上の権限を対応づけます。
たとえば `<cluster_name>-deployer` のロールには、namespace `app` の admin という権限が結びついています。

IAM ポリシーには Kubernetes の権限を書けません。
IAM ポリシーは AWS の API の許可であり、Kubernetes の中の操作は別の仕組みで決まるからです。
そのため、`<cluster_name>-deployer` には IAM ポリシーと Access Entry の 2 か所で権限を与えています。

`aws eks update-kubeconfig` には `--user-alias` も付けます。
kubeconfig の user エントリは、名前が同じだと別のプロファイルのものと共有され、上書きされるためです。

## 5. API サーバーへの経路

この環境の API サーバーは、VPC の外へ公開していません。
手元の kubectl は直接つながらないので、SSM Session Manager のポート転送でトンネルを張ります。
行き先は、private subnet にある踏み台(t4g.nano の小さな EC2)です。踏み台は公開 IP も inbound の口も持ちません。

SSH ではなく SSM を使うのは、鍵の配布と 22 番ポートの公開が要らないからです。
接続の許可は IAM ポリシーで決まり、ログインした個人ロールのまま使えます。
`scripts/eks-tunnel.sh` が、kubeconfig の接続先を `https://127.0.0.1:8443` に書き換え、トンネルを前面で動かします。
トンネルを動かす端末とは別の端末で、kubectl と terraform を使います。
転送先は、terraform が作る SSM のドキュメント(`eks-exp-api-tunnel`)で API サーバーの 443 に固定してあります。ポリシーもこのドキュメントだけを許すので、踏み台を経由して他のホストへは出られません(未検証)。

ECR への push は API サーバーを通らないので、トンネルは要りません。

## 6. ノードと Pod

ノードは、Kubernetes が使う EC2 のサーバーです。
Pod は、そのノードの上で動くコンテナの入れ物です。
アプリは Pod の中で動きます。

ノードは builder が terraform で作ります。
Pod は deployer が kubectl で作ります。
ノードの台数を決めるのは builder で、何を動かすかを決めるのは deployer です。

## 7. URL から Pod までの道のり

外から届いたリクエストは、NLB、ノードの 30080 番ポート、Service、Pod の順に進みます。
NLB は builder が terraform で作り、Service と Pod は deployer が作ります。

2 人の作業は、30080 という 1 つの数字だけでつながっています。
terraform の NLB は、全ノードの 30080 に転送します。
deployer の Service は、`nodePort` を 30080 に固定して受けます。
この数字がずれると、NLB のヘルスチェックが通らず、URL に届きません。
NLB はクロスゾーン負荷分散を有効にしています。
ノードが 1 つの AZ にしか無くても、どの AZ の入口からも届くようにするためです。

ノードは private subnet にあり、パブリック IP を持ちません。
NLB は内部向けで、インターネットからは届きません。CloudFront は VPC origin という仕組みで VPC の中に入って NLB に届きます。
外へ出るのは NAT の固定 IP だけです。

Pod から外へ出る通信は、NAT Gateway を通ります。
送信元の IP は NAT Gateway の固定 EIP になるので、通信先の許可リストに入れられます。

## 8. HTTPS の入口

ELB の既定ドメインには、証明書を発行できません。
そのため、CloudFront の既定ドメイン(`*.cloudfront.net`)で HTTPS にしています。
キャッシュは無効にしてあり、HTTP で来たリクエストは HTTPS へ転送します。
CloudFront の後ろは、これまでどおり NLB です。
CloudFront から NLB へは、VPC origin を通って HTTP で届きます。
この区間はインターネットを通りません。NLB は内部向けなので、NLB の URL を直接開いても届きません。
CloudFront は VPC origin を作るときに、VPC に `CloudFront-VPCOrigins-Service-SG` という SG を作ります。
NLB の SG はこの SG からの 80 番だけを許可します。VPC の CIDR を許可しても VPC origin の通信は通りません。

ログも、入口と同じく最初から用意します。
`kubectl logs` で見えるのは動いている Pod のログだけで、Pod が作り直されると消えます。
開発環境でもログを転送しておくのが普通です。
AWS 公式のアドオンが全 Pod の標準出力を CloudWatch Logs に送り、30 日間残します。
保存日数の目安は、開発が 7〜14 日、検証が 30 日、本番が 90 日以上です。
変数 `log_retention_days` で変えます。
読み取りの権限は deployer に付けてあります。

## 9. namespace の権限と ResourceQuota

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

## 10. ECR と Pod の紐付け

ECR は、コンテナの image を置く AWS の倉庫です。
deployer が manifest に書くのは、image の名前だけです。
Pod を起こすときは、ノードが ECR から image を引いてきます。

pull の権限は、ノードのロール(`<cluster_name>-node`)にあります。
push の権限は、開発者の個人ロールに付けた `<cluster_name>-deployer-policy` にあります。
どちらもマネージャーがスクリプトで付けています。builder は変更できません。
deployer 自身は、どちらの権限も変更できません。

## 11. マネージャーへの頼み方

マネージャーに渡すのは、スクリプト 4 本とポリシーの JSON 3 枚です。
作成用の `setup-iam.sh` と撤去用の `teardown-iam.sh`、
開発者用の `attach-deployer-policy.sh` と `detach-deployer-policy.sh` です。
JSON は builder 用の `builder-policy.json`、deployer 用の `deployer-policy.json`、参考の最小権限版です。
頼むのは、`setup-iam.sh <自分のロール名>` の実行 1 回だけです。

ポリシーは、実験で apply から destroy まで通して検証したものです。
builder は IAM のロールとポリシーを作れないので、自分の権限を広げることはできません。
builder にできる IAM の書き込みは、EKS と踏み台へロールを渡す PassRole だけです。
詳細は `docs/permissions.md` と `docs/request.md` にあります。

## 付録 構成と手順の詳細

### 構成図

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
deployer は Service type=NodePort で nodePort を 30080 に固定します。
この番号が terraform と manifest の約束です。

Pod の外向き通信は、private subnet のルートテーブルで NAT Gateway に向けます。
その IP は `terraform output nat_public_ip` で確認します。

### 前提ツール

terraform 1.11 以上、aws cli v2、session-manager-plugin、kubectl、docker、jq を使います。
リージョンは ap-northeast-1 です。

### 手順(builder)

以降の builder の操作は、実験では `AWS_PROFILE=builder` で実行します。
移植先(dev 環境)では、マネージャーが付与した identity で実行します。

#### 0-a. IAM の作成(マネージャー)

```bash
bootstrap/setup-iam.sh <builder の個人ロール名>
```

ロール 3 つ(クラスタ用、ノード用、踏み台用)とポリシー 2 つができ、builder の個人ロールに権限が付きます。
実験では、自分が管理者としてこのスクリプトを実行します。

#### 0-b. state バケット作成(builder)

builder は `~/.aws/config` に `builder` プロファイルを足します。

```ini
[profile builder]
role_arn       = <builder 役のロールの ARN(実験では代役の空ロール)>
source_profile = default
region         = ap-northeast-1
```

プロファイルを切り替えてから、付与された権限で state 用のバケットを作ります。

```bash
export AWS_PROFILE=builder
bootstrap/create-state-bucket.sh
```

#### 1. 固有値と init

移植先(dev 環境)では、構築先のアカウント ID を書いて commit します。
書く場所は `terraform/variables.tf` の `allowed_account_ids` の `default` です。
空のままだとどのアカウントでも動きます(実験用)。
開発者の個人ロールの ARN は `deployer_role_arns` に書きます。terraform はその ARN に EKS の Access Entry を作ります。
tfvars と backend.hcl は使いません。

```bash
cd terraform
terraform init -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
```

#### 2. apply

API サーバーはプライベートだけなので、新規構築は 2 段で進めます。
1 段目で VPC、クラスタ、踏み台だけを作ります。

```bash
terraform apply -target=aws_instance.bastion -target=aws_vpc_security_group_ingress_rule.cluster_from_bastion
```

別の端末で、トンネルを張ったままにします。

```bash
scripts/eks-tunnel.sh eks-exp "$(terraform -chdir=terraform output -raw bastion_instance_id)"
```

元の端末に戻り、2 段目で残りを作ります。

```bash
terraform apply
terraform output
```

作成に約 20 分かかります。2 回目以降の plan、apply、destroy も、先にトンネルを張ります。

#### 3. deployer への引き渡し

`scripts/render-deployer-doc.sh` を実行し、値が埋まった `docs/deployer.md` を渡します。
渡す値の一覧は README にあります。

### 手順(deployer)

deployer の手順は、値が埋まった `docs/deployer.md` にまとめています。

### 片付け(実験のみ)

destroy は実験の操作で、移植先(dev 環境)では行いません。

```bash
# builder(別の端末でトンネルを張ったまま)
scripts/eks-tunnel.sh eks-exp "$(terraform -chdir=terraform output -raw bastion_instance_id)"
scripts/preflight-destroy.sh
(cd terraform && terraform destroy)
bootstrap/delete-state-bucket.sh   # 最後の周回だけ
# 管理者
bootstrap/teardown-iam.sh <builder の個人ロール名>
scripts/check-leftovers.sh
```

destroy に約 15 分かかります。
state バケットは周回の間は残し、最後に一度だけ削除します。
`delete-state-bucket.sh` は builder の権限で実行するので、builder ロールの削除より先に行います。
`teardown-iam.sh` は管理者の操作です。
`check-leftovers.sh` は個人アカウント専用で、共有アカウントではタグ検索の結果だけを見ます。

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
IAM ロール 3 つ(`eks-exp-cluster`、`eks-exp-node`、`eks-exp-bastion`)と instance profile、ポリシー 2 つも対象です。
`/aws/eks/` 配下のロググループも確かめます。
