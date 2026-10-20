# 申請文のたたき台

マネージャーへの依頼に貼り付けられる形でまとめます。
権限の中身は `docs/permissions.md` にあります。

## 依頼

依頼は 1 件です。次のスクリプトを、管理者権限で 1 回実行してほしい。

```bash
# <リポジトリ> のブランチ <ブランチ名> で
cd <terraform を置いたディレクトリ>
bootstrap/setup-iam.sh <私の個人ロール名>
```

これで、ロール 3 つ(EKS 用 2 つ、アプリ開発者用 1 つ)とポリシー 2 つができ、私の個人ロールに権限が付きます。
その後のマネージャーの作業は、撤去時の 1 回(`bootstrap/teardown-iam.sh <私の個人ロール名>`)だけです。

## 作られるもの

| 名前 | 種類 | 用途 |
| --- | --- | --- |
| `<名前>-cluster` | ロール | EKS のコントロールプレーン用。AmazonEKSClusterPolicy |
| `<名前>-node` | ロール | ノード用。EKS のワーカー 3 つと CloudWatchAgentServerPolicy |
| `<名前>-deployer` | ロール | アプリ開発者がスイッチする。信頼先の初期値は私のロール |
| `<名前>-builder-policy` | ポリシー | 私の個人ロールに付ける。AWS 管理ポリシー 3 つ(VPC、ELB、ECR の FullAccess)と組み合わせる |
| `<名前>-deployer-policy` | ポリシー | `<名前>-deployer` に付ける。ECR の push、クラスタ情報の参照、ログの読み取り |

## 設計の要点

- IAM のロールとポリシーは、私(builder)が terraform で作らず、すべてマネージャーが作ります。
  私はロールとポリシーを作れません。作れると、自分に任意の権限を与えられてしまうためです
- アプリ開発者の追加は、私がスクリプトで `<名前>-deployer` の信頼先を書き換えます。
  マネージャーの作業は要りません
- NLB はインターネットに出さず、CloudFront から VPC origin で届きます
- アカウント ID を terraform に直書きし、ほかのアカウントでは止まります
- HTTPS の入口(CloudFront の既定ドメイン)、EKS の構成、アプリ開発者の権限の範囲は、個人アカウントでの検証時のままです

## 私に付く権限の範囲

ネットワーク、ロードバランサ、ECR は AWS 管理ポリシーをそのまま使います。
EKS は、自分のクラスタ名の資源に限った全権です。
IAM は、参照と、EKS へ渡すロール 2 つの PassRole と、`<名前>-deployer` の信頼先の書き換えだけです。
S3 は名前が `tfstate-*-<名前>` のバケットだけ、CloudWatch Logs は `/aws/containerinsights/<名前>/` 配下だけです。
この権限で apply から destroy まで通ることは、個人アカウントで検証済みです。

## 受け入れているリスク

チームだけが使う検証環境なので、次の 2 点は受け入れています。

- 私は VPC、ELB、ECR、CloudFront をアカウント全体で操作できる
- Pod からノードロールの権限(ネットワークインターフェースの操作、ロググループの作成)を使える

## 撤去

作業後に、私が terraform destroy と state バケットの削除を行います。
最後にマネージャーに `bootstrap/teardown-iam.sh <私の個人ロール名>` を頼みます。
ロール 3 つとポリシー 2 つが消え、私のロールから権限が外れます。

## 自分のロール名の調べ方

今ログインしている identity は、次のコマンドで見られます。

```bash
aws sts get-caller-identity --query Arn --output text
# arn:aws:sts::<ACCOUNT_ID>:assumed-role/<ここがロール名>/<セッション名>
```

依頼に書くのは `assumed-role/` の直後のロール名です。
ロール名が `AWSReservedSSO_` で始まる場合は、許可セットの共用ロールです。
そこに権限を付けると同じ許可セットの全員に付くので、共有の作業ロールを別に作る方式を相談します。
