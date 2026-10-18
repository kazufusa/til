# EKS + ECR + NLB + デプロイ権限の terraform 実験 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** terraform で EKS、ECR、NLB、deployer ロールを作る本番同等のコードと、実験で検証済みの権限リスト 2 つ(builder の申請用、deployer の付与用)を作ります。

**Architecture:** 1 つの terraform ルート(`terraform/`)が VPC、EKS、node group、ECR、NLB、deployer の IAM ロール、Access Entry、namespace と ResourceQuota を持ちます。段 0(state バケットと、terraform を回す `tf-builder` ロール)は terraform を使えないマネージャー向けに aws コマンドのスクリプト(`bootstrap/`)にし、実験では自分が管理者として同じスクリプトを実行して検証します。`tf-builder` で本体を apply/destroy して申請権限を確定させます。

**Tech Stack:** Terraform 1.15(backend s3 + use_lockfile)、hashicorp/aws provider 6 系、hashicorp/kubernetes provider 2 系、AWS CLI v2(SSO)、kubectl 1.34、docker、jq、bash

**Spec:** `20261016_eks_ecr_nlb_iam_terraform/docs/design.md`

## Global Constraints

- リージョンは `ap-northeast-1`、管理者プロファイルは `default`(SSO、AdministratorAccess)
- 追加プロファイルは `builder`(`tf-builder` ロール)と `deployer`(`app-deployer` ロール)、どちらも `source_profile = default`
- 全資源に `Project = eks-exp` タグ(provider の `default_tags`)
- クラスタ名 `eks-exp`、IAM ロール名は `eks-exp-cluster`、`eks-exp-node`、`app-deployer`、`tf-builder`、ポリシー名は `app-deployer-policy`、`tf-builder-policy`
- ECR リポジトリ名 `app`、NodePort は `30080`、ノードは `t3.medium` x1
- deployer の Kubernetes 権限は `AmazonEKSAdminPolicy` を namespace `app` に限定、加えて `AmazonEKSViewPolicy` を cluster スコープ(読み取り専用)。namespace と ResourceQuota(`services.loadbalancers=0`、`persistentvolumeclaims=0`)は terraform が作る
- cluster-admin は builder(クラスタ作成者)だけ。deployer に cluster スコープの権限を付けない
- state バケット名は `tfstate-<アカウントID>-eks-exp`、タグは `Project = eks-exp-state`(残骸チェックの対象外にするため値を変える)
- `bootstrap/` は aws コマンドだけで書く(マネージャーは terraform を使えない)。`terraform/` は本番と実験で同一
- EKS コントロールプレーンログは全て無効、KMS カスタマーキーは使わない、アカウント設定・Service Quotas・Identity Center・Organizations・CloudTrail・AWS Config は触らない
- 日本語文書は `~/.claude/CLAUDE.md` の規約(ですます調、一文 60 字目安、強調表現なし、見出しは体言止め)に従う
- tfvars と backend.hcl は使わない。変数の値は `variables.tf` の `default` にべた書きする。固有値(アカウント ID、ARN)はコードに書かず、`aws_caller_identity` と `aws_iam_session_context` から導く。バケット名だけ init の引数で渡す
- README と実験ログにもアカウント ID と ARN を生で書かない。`<ACCOUNT_ID>`、`<SSO_ROLE_ARN>` の形にする。commit 前に `grep -rn <ACCOUNT_ID>` が空であることを確認する
- commit に Co-Authored-By と Generated with は書かない
- AWS に課金が発生するタスク(Task 10 以降)は、着手前に `aws sts get-caller-identity` で `default` プロファイルが生きていることを確認する

## Review Focus

- Pod からの外向き通信が失敗する(private route table の既定経路漏れ、NAT が `available` になる前にノードが起動)。期待は Pod から `checkip.amazonaws.com` に到達し NAT の EIP が返ること。Task 10 の Step 11b で確認する
- NLB のヘルスチェックが node SG の「NLB SG 参照」ルールで通らず、curl がタイムアウトする。期待は target が `healthy` になること。Task 10 の Step 7 で `describe-target-health` を確認し、`unhealthy` のときは Task 4 の代替ルール(VPC CIDR からの 30080 許可)に切り替える
- `deployer_trusted_principals` に `arn:aws:sts::...:assumed-role/...` を書くと IAM が `Invalid principal` で失敗する。期待は plan 時に分かりやすく落ちること。Task 1 の変数 validation で `arn:aws:iam::` 始まりを強制し、Task 10 の Step 5 で確認する。空リストのときは `aws_iam_session_context.issuer_arn`(実行者の帽子)を使う
- `create-state-bucket.sh` を 2 回実行すると `BucketAlreadyOwnedByYou` で落ちる。期待は冪等に成功すること。Task 6 の Step 2 で `head-bucket` による存在確認を入れる
- `preflight-destroy.sh` が別クラスタの kubeconfig を見て「問題なし」と答える。期待は対象クラスタ以外なら拒否すること。Task 7 の Step 2 で current-context の ARN にクラスタ名が含まれることを確認する
- ECR に image が残ったまま destroy すると `RepositoryNotEmptyException` で止まる。期待は `force_delete = true` で消えること。Task 11 の Step 3 は image を push したまま destroy して確認する
- kubernetes provider がクラスタ作成前の plan で接続先不明のまま namespace を計画し、apply 中に認証エラーで止まる。期待は 1 回の apply で通ること。Task 10 の Step 6 に、失敗時は `-target=aws_eks_cluster.main` で先にクラスタだけ作ってから全体を apply する回避手順を置く

---

### Task 1: ディレクトリと terraform の骨組み

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/.gitignore`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/versions.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/backend.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/variables.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/main.tf`

**Interfaces:**
- Consumes: なし
- Produces: 変数 `region`、`cluster_name`、`node_count`、`ecr_repository_name`、`deployer_trusted_principals`、`deployer_namespaces`。`locals.name_prefix`、`local.deployer_trusted_principals`(空なら実行者の帽子)。data `aws_caller_identity.current`、`aws_iam_session_context.current`、`aws_availability_zones.available`。provider `kubernetes` は Task 3 で追記

- [ ] **Step 1: .gitignore を作る**

```gitignore
# 20261016_eks_ecr_nlb_iam_terraform/.gitignore
.terraform/
*.tfstate
*.tfstate.*
kubeconfig*
```

- [ ] **Step 2: versions.tf を作る**

```hcl
# terraform/versions.tf
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.35"
    }
  }
}
```

- [ ] **Step 3: backend.tf を作る**

```hcl
# terraform/backend.tf
# バケット名はアカウント ID を含むので init の引数で渡す:
#   terraform init -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
terraform {
  backend "s3" {
    key          = "terraform/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
  }
}
```

- [ ] **Step 4: variables.tf を作る**

```hcl
# terraform/variables.tf
variable "region" {
  description = "AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "cluster_name" {
  description = "EKS クラスタ名。IAM ロールなどの名前の接頭辞にも使う"
  type        = string
  default     = "eks-exp"
}

variable "node_count" {
  description = "managed node group の desired サイズ"
  type        = number
  default     = 1

  validation {
    condition     = var.node_count >= 1 && var.node_count <= 3
    error_message = "node_count は 1 から 3 の範囲にしてください。"
  }
}

variable "ecr_repository_name" {
  description = "ECR リポジトリ名"
  type        = string
  default     = "app"
}

variable "deployer_trusted_principals" {
  description = "app-deployer ロールにスイッチできる IAM principal の ARN。空なら terraform を実行している本人の帽子(ロール)を信頼する。本番ではその人物の ARN を default に書く。sts の assumed-role ARN ではなく iam のロール/ユーザー ARN を書く"
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for arn in var.deployer_trusted_principals :
      can(regex("^arn:aws:iam::[0-9]{12}:(role|user)/", arn))
    ])
    error_message = "各要素は arn:aws:iam::<account>:role/... または :user/... の形式にしてください。"
  }
}

variable "deployer_namespaces" {
  description = "deployer が edit 権限を持つ namespace。terraform がこの namespace と ResourceQuota を作る"
  type        = list(string)
  default     = ["app"]

  validation {
    condition     = length(var.deployer_namespaces) >= 1
    error_message = "deployer_namespaces は 1 つ以上必要です。"
  }
}
```

- [ ] **Step 5: main.tf を作る**

```hcl
# terraform/main.tf
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project = "eks-exp"
    }
  }
}

data "aws_caller_identity" "current" {}

# 実行者が assumed-role セッションなら、その帽子(IAM ロール)の ARN を issuer_arn で得る
data "aws_iam_session_context" "current" {
  arn = data.aws_caller_identity.current.arn
}

data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  name_prefix = var.cluster_name
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)

  # 空なら実行者本人の帽子を信頼する(実験で自分が deployer 役を兼ねるため)
  deployer_trusted_principals = (
    length(var.deployer_trusted_principals) > 0
    ? var.deployer_trusted_principals
    : [data.aws_iam_session_context.current.issuer_arn]
  )
}
```

kubernetes provider のブロックは `aws_eks_cluster.main` を参照するため、Task 3 で eks.tf と同時に main.tf に追記します(この Task では書かない)。

- [ ] **Step 6: init(backend なし)と validate を通す**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/terraform
terraform init -backend=false
terraform fmt -check -recursive
terraform validate
```
Expected: `Success! The configuration is valid.`。`terraform fmt -check` は差分なしで終了コード 0。

- [ ] **Step 7: commit**

```bash
cd /home/kazufusa/src/github.com/kazufusa/til
git add 20261016_eks_ecr_nlb_iam_terraform/.gitignore 20261016_eks_ecr_nlb_iam_terraform/terraform/
git commit -m "20261016_eks_ecr_nlb_iam_terraform: terraformの骨組み(provider, backend, variables)を追加"
```

---

### Task 2: ネットワーク

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/network.tf`

**Interfaces:**
- Consumes: `local.name_prefix`、`local.azs`
- Produces: `aws_vpc.main`、`aws_subnet.public[*]`、`aws_subnet.private[*]`

- [ ] **Step 1: network.tf を作る**

```hcl
# terraform/network.tf
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${local.name_prefix}-vpc"
  }
}

resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.name_prefix}-public-${local.azs[count.index]}"
  }
}

resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, 10 + count.index)
  availability_zone = local.azs[count.index]

  tags = {
    Name = "${local.name_prefix}-private-${local.azs[count.index]}"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-igw"
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${local.name_prefix}-nat"
  }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${local.name_prefix}-nat"
  }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${local.name_prefix}-public"
  }
}

resource "aws_route_table_association" "public" {
  count = 2

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${local.name_prefix}-private"
  }
}

resource "aws_route_table_association" "private" {
  count = 2

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
```

- [ ] **Step 2: validate を通す**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/terraform
terraform fmt -check -recursive && terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 3: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/terraform/network.tf
git commit -m "20261016_eks_ecr_nlb_iam_terraform: VPC/subnet/NAT/route tableを追加"
```

---

### Task 3: EKS クラスタと node group

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/eks.tf`

**Interfaces:**
- Consumes: `aws_subnet.private[*]`、`local.name_prefix`、`var.node_count`
- Produces: `aws_eks_cluster.main`(`.name`、`.vpc_config[0].cluster_security_group_id`)、`aws_eks_node_group.main`(`.resources[0].autoscaling_groups[0].name`)

- [ ] **Step 1: eks.tf を作る**

```hcl
# terraform/eks.tf
data "aws_iam_policy_document" "eks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cluster" {
  name               = "${local.name_prefix}-cluster"
  assume_role_policy = data.aws_iam_policy_document.eks_assume.json
}

resource "aws_iam_role_policy_attachment" "cluster" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  role_arn = aws_iam_role.cluster.arn

  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true
  }

  vpc_config {
    subnet_ids              = aws_subnet.private[*].id
    endpoint_public_access  = true
    endpoint_private_access = true
  }

  # CloudWatch ロググループを残さないため、コントロールプレーンログは有効にしない
  enabled_cluster_log_types = []

  depends_on = [aws_iam_role_policy_attachment.cluster]
}

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "node" {
  name               = "${local.name_prefix}-node"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "node" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly",
  ])

  role       = aws_iam_role.node.name
  policy_arn = each.value
}

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${local.name_prefix}-ng"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = aws_subnet.private[*].id
  instance_types  = ["t3.medium"]

  scaling_config {
    desired_size = var.node_count
    min_size     = 1
    max_size     = 3
  }

  update_config {
    max_unavailable = 1
  }

  depends_on = [aws_iam_role_policy_attachment.node]
}
```

- [ ] **Step 2: main.tf に kubernetes provider を追記する**

```hcl
# terraform/main.tf に追記
# builder はクラスタ作成者として cluster-admin を持つので、そのまま namespace を作れる
provider "kubernetes" {
  host                   = aws_eks_cluster.main.endpoint
  cluster_ca_certificate = base64decode(aws_eks_cluster.main.certificate_authority[0].data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", aws_eks_cluster.main.name, "--region", var.region]
  }
}
```

- [ ] **Step 3: validate を通す**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/terraform
terraform init -backend=false -upgrade
terraform fmt -check -recursive && terraform validate
```
Expected: `Success! The configuration is valid.`(kubernetes provider が追加されるので `-upgrade` 付きで init し直す)

- [ ] **Step 4: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/terraform/eks.tf 20261016_eks_ecr_nlb_iam_terraform/terraform/main.tf 20261016_eks_ecr_nlb_iam_terraform/terraform/.terraform.lock.hcl
git commit -m "20261016_eks_ecr_nlb_iam_terraform: EKSクラスタとmanaged node group、kubernetes providerを追加"
```

---

### Task 4: ECR と NLB

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/ecr.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/nlb.tf`

**Interfaces:**
- Consumes: `aws_vpc.main`、`aws_subnet.public[*]`、`aws_eks_cluster.main.vpc_config[0].cluster_security_group_id`、`aws_eks_node_group.main.resources[0].autoscaling_groups[0].name`
- Produces: `aws_ecr_repository.app`(`.repository_url`、`.arn`)、`aws_lb.main.dns_name`、`local.node_port = 30080`

- [ ] **Step 1: ecr.tf を作る**

```hcl
# terraform/ecr.tf
resource "aws_ecr_repository" "app" {
  name                 = var.ecr_repository_name
  image_tag_mutability = "MUTABLE"
  # destroy 時に image が残っていても消せるようにする
  force_delete = true

  image_scanning_configuration {
    scan_on_push = false
  }
}
```

- [ ] **Step 2: nlb.tf を作る**

```hcl
# terraform/nlb.tf
locals {
  node_port = 30080
}

resource "aws_security_group" "nlb" {
  name        = "${local.name_prefix}-nlb"
  description = "NLB: allow HTTP from the internet"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-nlb"
  }
}

resource "aws_vpc_security_group_ingress_rule" "nlb_http" {
  security_group_id = aws_security_group.nlb.id
  description       = "HTTP from anywhere"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "nlb_all" {
  security_group_id = aws_security_group.nlb.id
  description       = "all"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# EKS が自動生成するクラスタ SG(ノードにも付く)に、NLB からの NodePort を許可する
resource "aws_vpc_security_group_ingress_rule" "node_from_nlb" {
  security_group_id            = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
  description                  = "NodePort from NLB"
  referenced_security_group_id = aws_security_group.nlb.id
  from_port                    = local.node_port
  to_port                      = local.node_port
  ip_protocol                  = "tcp"
}

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-nlb"
  load_balancer_type = "network"
  internal           = false
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.nlb.id]
}

resource "aws_lb_target_group" "nodeport" {
  name        = "${local.name_prefix}-nodeport"
  port        = local.node_port
  protocol    = "TCP"
  target_type = "instance"
  vpc_id      = aws_vpc.main.id

  health_check {
    protocol = "TCP"
    port     = "traffic-port"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.nodeport.arn
  }
}

# node group が作る ASG を target group に紐づける(ノードの増減に追従する)
resource "aws_autoscaling_attachment" "nodeport" {
  autoscaling_group_name = aws_eks_node_group.main.resources[0].autoscaling_groups[0].name
  lb_target_group_arn    = aws_lb_target_group.nodeport.arn
}
```

Review Focus の 1 点目の代替案。Task 10 でヘルスチェックが `unhealthy` のままなら、`node_from_nlb` を次に差し替えます。

```hcl
resource "aws_vpc_security_group_ingress_rule" "node_from_nlb" {
  security_group_id = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
  description       = "NodePort from VPC (NLB preserves client IP)"
  cidr_ipv4         = aws_vpc.main.cidr_block
  from_port         = local.node_port
  to_port           = local.node_port
  ip_protocol       = "tcp"
}
```

- [ ] **Step 3: validate を通す**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/terraform
terraform fmt -check -recursive && terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/terraform/ecr.tf 20261016_eks_ecr_nlb_iam_terraform/terraform/nlb.tf
git commit -m "20261016_eks_ecr_nlb_iam_terraform: ECRとNLB(NodePort向けtarget group)を追加"
```

---

### Task 5: deployer ロール、namespace、output

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/deployer.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/namespace.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/outputs.tf`

**Interfaces:**
- Consumes: `local.deployer_trusted_principals`、`var.deployer_namespaces`、`aws_ecr_repository.app.arn`、`aws_eks_cluster.main.arn`、provider `kubernetes`
- Produces: `aws_iam_role.deployer.arn`、`kubernetes_namespace.deployer[*]`、output `cluster_name`、`nlb_dns_name`、`ecr_repository_url`、`deployer_role_arn`、`deployer_namespaces`、`region`、`node_port`、`nat_public_ip`

- [ ] **Step 1: deployer.tf を作る**

```hcl
# terraform/deployer.tf
data "aws_iam_policy_document" "deployer_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = local.deployer_trusted_principals
    }
  }
}

resource "aws_iam_role" "deployer" {
  name               = "app-deployer"
  description        = "ECR push and kubectl against ${var.cluster_name}"
  assume_role_policy = data.aws_iam_policy_document.deployer_assume.json
}

data "aws_iam_policy_document" "deployer" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPushPullAppRepo"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:DescribeImages",
      "ecr:ListImages",
      "ecr:DescribeRepositories",
    ]
    resources = [aws_ecr_repository.app.arn]
  }

  statement {
    sid       = "EksKubeconfig"
    actions   = ["eks:DescribeCluster"]
    resources = [aws_eks_cluster.main.arn]
  }
}

resource "aws_iam_policy" "deployer" {
  name   = "app-deployer-policy"
  policy = data.aws_iam_policy_document.deployer.json
}

resource "aws_iam_role_policy_attachment" "deployer" {
  role       = aws_iam_role.deployer.name
  policy_arn = aws_iam_policy.deployer.arn
}

resource "aws_eks_access_entry" "deployer" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_iam_role.deployer.arn
  type          = "STANDARD"
}

# namespace 限定の edit。RBAC や ResourceQuota の変更はできない
resource "aws_eks_access_policy_association" "deployer" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_iam_role.deployer.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"

  access_scope {
    type       = "namespace"
    namespaces = var.deployer_namespaces
  }

  depends_on = [aws_eks_access_entry.deployer]
}
```

- [ ] **Step 2: namespace.tf を作る**

```hcl
# terraform/namespace.tf
# deployer の namespace は platform(builder)が作る。
# ResourceQuota で、terraform 外にクラウド資源(ELB、EBS)ができる経路を塞ぐ。
resource "kubernetes_namespace" "deployer" {
  for_each = toset(var.deployer_namespaces)

  metadata {
    name = each.value

    labels = {
      "managed-by" = "terraform"
    }
  }

  # node group より先に消そうとすると API が応答しない場合があるため、cluster 本体に依存させる
  depends_on = [aws_eks_node_group.main]
}

resource "kubernetes_resource_quota" "no_cloud_resources" {
  for_each = toset(var.deployer_namespaces)

  metadata {
    name      = "no-cloud-resources"
    namespace = kubernetes_namespace.deployer[each.key].metadata[0].name
  }

  spec {
    hard = {
      "services.loadbalancers"  = "0"
      "persistentvolumeclaims"  = "0"
    }
  }
}
```

- [ ] **Step 3: outputs.tf を作る**

```hcl
# terraform/outputs.tf
output "region" {
  value = var.region
}

output "cluster_name" {
  value = aws_eks_cluster.main.name
}

output "nlb_dns_name" {
  description = "外部公開 URL のホスト名。http://<この値>/ でアクセスする"
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "deployer_role_arn" {
  description = "deployer に渡すスイッチロール先"
  value       = aws_iam_role.deployer.arn
}

output "node_port" {
  description = "deployer の Service が使う nodePort"
  value       = local.node_port
}

output "deployer_namespaces" {
  description = "deployer が edit 権限を持つ namespace"
  value       = var.deployer_namespaces
}

output "nat_public_ip" {
  description = "Pod の外向き通信の送信元 IP(通信先の許可リスト用)"
  value       = aws_eip.nat.public_ip
}
```

- [ ] **Step 4: deployer の信頼先を output に出す**

outputs.tf に追記します。信頼先が意図どおりか apply 後に目で確認するためです。

```hcl
output "deployer_trusted_principals" {
  description = "app-deployer にスイッチできる principal(空指定なら実行者の帽子)"
  value       = local.deployer_trusted_principals
}
```

- [ ] **Step 5: validate を通す**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/terraform
terraform fmt -check -recursive && terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 6: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/terraform/deployer.tf 20261016_eks_ecr_nlb_iam_terraform/terraform/namespace.tf 20261016_eks_ecr_nlb_iam_terraform/terraform/outputs.tf
git commit -m "20261016_eks_ecr_nlb_iam_terraform: deployerロール(namespace限定edit)、namespaceとResourceQuota、outputを追加"
```

---

### Task 6: bootstrap(マネージャーに渡す段 0 の一式)

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/bootstrap/tf-builder-policy.json`
- Create: `20261016_eks_ecr_nlb_iam_terraform/bootstrap/create-state-bucket.sh`
- Create: `20261016_eks_ecr_nlb_iam_terraform/bootstrap/delete-state-bucket.sh`
- Create: `20261016_eks_ecr_nlb_iam_terraform/bootstrap/create-builder-role.sh`
- Create: `20261016_eks_ecr_nlb_iam_terraform/bootstrap/delete-builder-role.sh`

**Interfaces:**
- Consumes: 環境変数 `AWS_PROFILE`(未指定なら `default`)、`AWS_REGION`(未指定なら `ap-northeast-1`)。terraform は使わない
- Produces: `create-state-bucket.sh` はバケット名を stdout に出す。`create-builder-role.sh <principal-arn>...` は `tf-builder` のロール ARN を stdout に出す。どちらも 2 回実行しても成功する(冪等)。`tf-builder-policy.json` は README に貼る申請用 JSON の原本

- [ ] **Step 1: tf-builder-policy.json を作る(申請候補の初版)**

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
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:PassRole"
      ],
      "Resource": [
        "arn:aws:iam::*:role/eks-exp-*",
        "arn:aws:iam::*:role/app-deployer"
      ]
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
      "Sid": "StateBucketList",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::tfstate-*-eks-exp"
    },
    {
      "Sid": "StateBucketObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::tfstate-*-eks-exp/*"
    }
  ]
}
```


- [ ] **Step 2: create-state-bucket.sh を作る(冪等)**

```bash
#!/usr/bin/env bash
# state 用 S3 バケットを作る。2 回実行しても成功する。
# 使い方: bootstrap/create-state-bucket.sh [bucket-name]
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${1:-tfstate-${ACCOUNT_ID}-eks-exp}"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "bucket already exists: $BUCKET" >&2
else
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  echo "created: $BUCKET" >&2
fi

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# 残骸チェック(Project=eks-exp)の対象から外すため、値を eks-exp-state にする
aws s3api put-bucket-tagging \
  --bucket "$BUCKET" \
  --tagging 'TagSet=[{Key=Project,Value=eks-exp-state}]'

echo "$BUCKET"
```


- [ ] **Step 3: delete-state-bucket.sh を作る(全バージョン削除)**

```bash
#!/usr/bin/env bash
# state 用 S3 バケットを、全オブジェクトバージョンと削除マーカーごと消す。
# 使い方: bootstrap/delete-state-bucket.sh [bucket-name]
set -euo pipefail

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${1:-tfstate-${ACCOUNT_ID}-eks-exp}"

if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "bucket not found: $BUCKET" >&2
  exit 0
fi

read -r -p "delete bucket ${BUCKET} and ALL versions? [y/N] " ans
[[ "$ans" == "y" ]] || { echo "aborted" >&2; exit 1; }

# 1000 件ずつしか返らないので、空になるまで繰り返す
while :; do
  objects="$(aws s3api list-object-versions --bucket "$BUCKET" --max-keys 1000 \
    --query '{Objects: [Versions[].{Key:Key,VersionId:VersionId}, DeleteMarkers[].{Key:Key,VersionId:VersionId}][] | [?Key != null], Quiet: `true`}' \
    --output json)"
  count="$(jq '.Objects | length' <<<"$objects")"
  [[ "$count" -eq 0 ]] && break
  aws s3api delete-objects --bucket "$BUCKET" --delete "$objects" >/dev/null
  echo "deleted $count versions" >&2
done

aws s3api delete-bucket --bucket "$BUCKET"
echo "deleted bucket: $BUCKET"
```


- [ ] **Step 4: create-builder-role.sh を作る(冪等。ポリシーは新バージョンとして更新)**

```bash
#!/usr/bin/env bash
# terraform を回すロール tf-builder を作る。マネージャーが管理者権限で実行する。
# 使い方: bootstrap/create-builder-role.sh <スイッチを許可する principal の ARN> [ARN...]
#   例: bootstrap/create-builder-role.sh arn:aws:iam::123456789012:role/aws-reserved/sso.amazonaws.com/ap-northeast-1/AWSReservedSSO_Foo_abc
# 2 回目以降は、ポリシーを新バージョンに更新し、信頼ポリシーを置き換える。
set -euo pipefail

[[ $# -ge 1 ]] || { echo "usage: $0 <principal-arn> [principal-arn...]" >&2; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
ROLE="tf-builder"
POLICY="tf-builder-policy"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY}"

principals="$(printf '"%s",' "$@")"
trust="$(cat <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":[${principals%,}]},"Action":"sts:AssumeRole"}]}
EOF
)"

if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  # カスタマー管理ポリシーはバージョンを 5 つまでしか持てないので、古い非既定版を 1 つ消してから足す
  n="$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" --query 'length(Versions)' --output text)"
  if [[ "$n" -ge 5 ]]; then
    old="$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
      --query 'Versions[?IsDefaultVersion==`false`] | sort_by(@, &CreateDate) | [0].VersionId' --output text)"
    aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$old"
  fi
  aws iam create-policy-version --policy-arn "$POLICY_ARN" \
    --policy-document "file://${DIR}/tf-builder-policy.json" --set-as-default >/dev/null
  echo "updated policy: $POLICY_ARN" >&2
else
  aws iam create-policy --policy-name "$POLICY" \
    --policy-document "file://${DIR}/tf-builder-policy.json" \
    --tags Key=Project,Value=eks-exp >/dev/null
  echo "created policy: $POLICY_ARN" >&2
fi

if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE" --policy-document "$trust"
  echo "updated trust policy: $ROLE" >&2
else
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document "$trust" \
    --description "Runs terraform/ for eks-exp" \
    --tags Key=Project,Value=eks-exp >/dev/null
  echo "created role: $ROLE" >&2
fi

aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$POLICY_ARN"
echo "arn:aws:iam::${ACCOUNT_ID}:role/${ROLE}"
```

- [ ] **Step 5: delete-builder-role.sh を作る**

```bash
#!/usr/bin/env bash
# tf-builder ロールとポリシーを消す。無ければ何もしない。
set -euo pipefail

ROLE="tf-builder"
POLICY="tf-builder-policy"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY}"

if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  for arn in $(aws iam list-attached-role-policies --role-name "$ROLE" \
      --query 'AttachedPolicies[].PolicyArn' --output text); do
    aws iam detach-role-policy --role-name "$ROLE" --policy-arn "$arn"
  done
  aws iam delete-role --role-name "$ROLE"
  echo "deleted role: $ROLE" >&2
fi

if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  for v in $(aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
      --query 'Versions[?IsDefaultVersion==`false`].VersionId' --output text); do
    aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$v"
  done
  aws iam delete-policy --policy-arn "$POLICY_ARN"
  echo "deleted policy: $POLICY_ARN" >&2
fi
```

- [ ] **Step 6: 構文チェック**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/bootstrap
chmod +x ./*.sh
jq empty tf-builder-policy.json && echo "json ok"
for f in ./*.sh; do bash -n "$f" && echo "syntax ok: $f"; done
./create-builder-role.sh; echo "exit=$?"
```
Expected: `json ok`、4 本とも `syntax ok`、引数なしの `create-builder-role.sh` は usage を出して `exit=1`(AWS は叩かない)。

- [ ] **Step 7: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/bootstrap/
git commit -m "20261016_eks_ecr_nlb_iam_terraform: マネージャーに渡すbootstrap一式(stateバケット、tf-builderロール)を追加"
```

---

### Task 7: 実験用スクリプト

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/scripts/check-leftovers.sh`
- Create: `20261016_eks_ecr_nlb_iam_terraform/scripts/preflight-destroy.sh`

**Interfaces:**
- Consumes: 環境変数 `AWS_PROFILE`、`AWS_REGION`、kubeconfig の current-context
- Produces: どちらも残骸があれば終了コード 1

- [ ] **Step 1: check-leftovers.sh を作る**

```bash
#!/usr/bin/env bash
# destroy 後に実験の資源が残っていないかを確認する。残骸があれば終了コード 1。
# state バケット(Project=eks-exp-state)は意図して対象外。
set -uo pipefail

REGION="${AWS_REGION:-ap-northeast-1}"
export AWS_DEFAULT_REGION="$REGION"
fail=0

check() {
  # check <label> <command...>  コマンドは残骸を 1 行 1 件で出す
  local label="$1"; shift
  local out
  out="$("$@" 2>&1)" || { echo "ERROR $label: $out"; fail=1; return; }
  if [[ -n "$out" ]]; then
    echo "LEFTOVER $label:"
    echo "$out" | sed 's/^/  /'
    fail=1
  else
    echo "ok $label"
  fi
}

check "tag Project=eks-exp" \
  aws resourcegroupstaggingapi get-resources --tag-filters Key=Project,Values=eks-exp \
  --query 'ResourceTagMappingList[].ResourceARN' --output text
check "eks clusters" \
  aws eks list-clusters --query 'clusters[]' --output text
check "ecr repositories" \
  aws ecr describe-repositories --query 'repositories[].repositoryName' --output text
check "load balancers" \
  aws elbv2 describe-load-balancers --query 'LoadBalancers[].LoadBalancerName' --output text
check "target groups" \
  aws elbv2 describe-target-groups --query 'TargetGroups[].TargetGroupName' --output text
check "auto scaling groups" \
  aws autoscaling describe-auto-scaling-groups --query 'AutoScalingGroups[].AutoScalingGroupName' --output text
check "nat gateways" \
  aws ec2 describe-nat-gateways --filter Name=state,Values=pending,available,deleting \
  --query 'NatGateways[].NatGatewayId' --output text
check "elastic ips" \
  aws ec2 describe-addresses --query 'Addresses[].AllocationId' --output text
check "non-default vpcs" \
  aws ec2 describe-vpcs --filters Name=is-default,Values=false --query 'Vpcs[].VpcId' --output text
check "non-default security groups" \
  aws ec2 describe-security-groups --query "SecurityGroups[?GroupName!='default'].GroupId" --output text
check "iam roles" \
  aws iam list-roles \
  --query "Roles[?starts_with(RoleName,'eks-exp') || RoleName=='app-deployer' || RoleName=='tf-builder'].RoleName" \
  --output text
check "iam policies" \
  aws iam list-policies --scope Local \
  --query "Policies[?starts_with(PolicyName,'eks-exp') || starts_with(PolicyName,'app-deployer') || starts_with(PolicyName,'tf-builder')].PolicyName" \
  --output text
check "eks log groups" \
  aws logs describe-log-groups --log-group-name-prefix /aws/eks/ \
  --query 'logGroups[].logGroupName' --output text

if [[ "$fail" -ne 0 ]]; then
  echo "RESULT: leftovers found"
  exit 1
fi
echo "RESULT: clean"
```


- [ ] **Step 2: preflight-destroy.sh を作る**

```bash
#!/usr/bin/env bash
# terraform destroy の前に、Kubernetes 側が terraform 外のクラウド資源を持っていないか確認する。
# 使い方: scripts/preflight-destroy.sh [cluster-name]
set -euo pipefail

CLUSTER="${1:-eks-exp}"
ctx="$(kubectl config current-context)"
if [[ "$ctx" != *"cluster/${CLUSTER}"* ]]; then
  echo "current kubeconfig context is not ${CLUSTER}: ${ctx}" >&2
  echo "run: aws eks update-kubeconfig --name ${CLUSTER}" >&2
  exit 1
fi

lbs="$(kubectl get svc -A -o json | jq -r '.items[] | select(.spec.type=="LoadBalancer") | "\(.metadata.namespace)/\(.metadata.name)"')"
if [[ -n "$lbs" ]]; then
  echo "Service type=LoadBalancer exists. delete them before terraform destroy:" >&2
  echo "$lbs" >&2
  exit 1
fi

pvcs="$(kubectl get pvc -A -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name)"')"
if [[ -n "$pvcs" ]]; then
  echo "PersistentVolumeClaim exists. delete them before terraform destroy:" >&2
  echo "$pvcs" >&2
  exit 1
fi

echo "preflight ok: no LoadBalancer services, no PVCs"
```


- [ ] **Step 3: 実行権限と構文チェック**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/scripts
chmod +x ./*.sh
for f in ./*.sh; do bash -n "$f" && echo "syntax ok: $f"; done
```
Expected: 2 本とも `syntax ok`。

- [ ] **Step 4: check-leftovers.sh を現状のアカウントで実行する(クリーンであることの基準点)**

この step から AWS を叩きます。先に `aws sso login` を済ませます。

Run:
```bash
aws sts get-caller-identity --query Arn --output text
cd 20261016_eks_ecr_nlb_iam_terraform
scripts/check-leftovers.sh
```
Expected: 全行 `ok`、最後に `RESULT: clean`。前回の実験(20260823_aws_gpu)の残骸が出たら、それは本実験の対象外なので README の実験ログに「実験前から存在」と記録し、`check-leftovers.sh` の結果の比較基準にします。

- [ ] **Step 5: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/scripts/
git commit -m "20261016_eks_ecr_nlb_iam_terraform: 残骸チェックとdestroy前チェックのスクリプトを追加"
```

---

### Task 8: deployer 用サンプルアプリ

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/app/Dockerfile`
- Create: `20261016_eks_ecr_nlb_iam_terraform/app/index.html`
- Create: `20261016_eks_ecr_nlb_iam_terraform/app/k8s.yaml`

**Interfaces:**
- Consumes: output `ecr_repository_url`(image 名の置換に使う)
- Produces: コンテナは 8080 で HTTP 応答。manifest は Deployment `web` と Service `web`(NodePort 30080)。namespace `app` は terraform が作るので manifest に含めない。image は `IMAGE_PLACEHOLDER` を sed で置換する

- [ ] **Step 1: Dockerfile と index.html を作る**

```dockerfile
# app/Dockerfile
FROM public.ecr.aws/docker/library/busybox:1.36
COPY index.html /www/index.html
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
```

```html
<!-- app/index.html -->
<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>eks-exp</title></head>
<body><h1>hello from eks-exp</h1><p>served by busybox httpd on EKS</p></body>
</html>
```

- [ ] **Step 2: k8s.yaml を作る**

```yaml
# app/k8s.yaml
# apply 前に IMAGE_PLACEHOLDER を ECR の image URL に置換する:
#   sed "s|IMAGE_PLACEHOLDER|${IMAGE}|" app/k8s.yaml | kubectl apply -f -
# namespace app は terraform(namespace.tf)が作る。deployer は namespace を作れない。
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: IMAGE_PLACEHOLDER
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /
              port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: app
spec:
  # NLB の target group は全ノードの 30080 を見る。この数字は terraform 側(local.node_port)と一致させる
  type: NodePort
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080
```

- [ ] **Step 3: ローカルで build して応答を確認する**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/app
docker build -t eks-exp-app:local .
docker run -d --rm --name eks-exp-app -p 18080:8080 eks-exp-app:local
sleep 1
curl -s http://localhost:18080/ | grep -o 'hello from eks-exp'
docker stop eks-exp-app
```
Expected: `hello from eks-exp` が 1 行出る。

- [ ] **Step 4: manifest の構文を確認する**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform
sed "s|IMAGE_PLACEHOLDER|example.invalid/app:v1|" app/k8s.yaml | kubectl apply --dry-run=client -f - 
```
Expected: `deployment.apps/web created (dry run)`、`service/web created (dry run)` の 2 行。kubeconfig が無いと失敗するので、その場合は `kubectl apply --dry-run=client --validate=false` ではなく、Task 10 の Step 9 で実クラスタに対して確認する。

- [ ] **Step 5: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/app/
git commit -m "20261016_eks_ecr_nlb_iam_terraform: deployer役が使うサンプルアプリ(busybox httpd)とmanifestを追加"
```

---

### Task 9: README の初版

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/README.md`

**Interfaces:**
- Consumes: 仕様書、Task 6 の `policy.json`、Task 5 の deployer ポリシー
- Produces: 実験ログの節(Task 10 以降が追記する)、権限リストの節(Task 12 が確定版に差し替える)

- [ ] **Step 1: README.md を書く**

次の構成で書きます。各節の本文は仕様書の対応する節を、ですます調で要約します。

```markdown
# EKS + ECR + NLB + デプロイ権限の terraform 実験

## 目的

(仕様「目的」を 5 行以内で)

## 役割

| 役割 | 誰 | やること | AWS 側の権限 | Kubernetes 側の権限 |
| --- | --- | --- | --- | --- |
| platform(builder) | 自分 | terraform apply/destroy、namespace と quota の管理 | 申請した権限(実験では `tf-builder`) | cluster-admin(クラスタ作成者) |
| deployer | その人物 | ECR push、namespace `app` への kubectl apply | ECR `app` への push と `eks:DescribeCluster` | namespace `app` の edit |

## 設計の方針

AWS の推奨に合わせた点を列挙します。

- IAM ユーザーではなくロールを使い、長期のアクセスキーを発行しない
- 権限は最小にし、IAM の対象は資源名の接頭辞(`eks-exp-*`、`app-*`)で限定する
- EKS の認可は aws-auth ConfigMap ではなく Access Entry で行う
- cluster-admin は platform だけが持ち、アプリ担当は namespace 限定にする
- namespace と ResourceQuota は platform が terraform で管理し、アプリ担当は変更できない
- deployer が terraform 外にクラウド資源を作れないよう、ResourceQuota で LoadBalancer と PVC を 0 にする

## 構成

(仕様「構成」の図と、NodePort 30080 の約束)

## 前提ツール

terraform 1.10 以上、aws cli v2、kubectl、docker、jq

## 手順(builder)

### 0. 段 0(マネージャーが実行)

```bash
bootstrap/create-state-bucket.sh
bootstrap/create-builder-role.sh <builder のログイン identity の ARN>
```

バケット名とロール ARN を builder に伝えてもらいます。

### 1. 固有値と init

本番では `terraform/variables.tf` の `deployer_trusted_principals` の `default` に、その人物の identity の ARN を書いて commit します。
空のままだと terraform を実行した本人が deployer になります(実験用)。

```bash
cd terraform
terraform init -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
```

### 2. apply

```bash
terraform apply
terraform output
```

### 3. deployer への引き渡し

渡すものは `deployer_role_arn`、`ecr_repository_url`、`cluster_name`、`region`、`node_port` の 5 つです。

## 手順(deployer)

### 1. プロファイル

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

### 4. できないこと

namespace `app` の外は見えません。namespace の作成、ノードの参照、他 namespace の Pod の参照は Forbidden になります。
Service type=LoadBalancer と PersistentVolumeClaim は ResourceQuota で 0 に制限されています。
terraform の外にクラウド資源ができるのを防ぐためです。

## 片付け(実験のみ)

```bash
aws eks update-kubeconfig --name eks-exp
scripts/preflight-destroy.sh
(cd terraform && terraform destroy)
bootstrap/delete-builder-role.sh
scripts/check-leftovers.sh
bootstrap/delete-state-bucket.sh
```

## builder の権限(申請用)

(Task 12 で確定版の JSON に差し替える。初版は bootstrap/tf-builder-policy.json と同じ)

## deployer の権限(terraform 管理)

(terraform/deployer.tf の 3 文を JSON で転記)

## 申請文のたたき台

(仕様「builder の権限」の README の申請文の形、を文章にする)

## 可逆性

(仕様「可逆性の規則」: 触らないもの、残ることを許容するもの)

## 実験ログ

(Task 10 以降で追記)
```

- [ ] **Step 2: 文書規約の確認**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform
grep -nE '\*\*[^*]+\*\*' README.md | grep -v '^.*For agentic' || echo "no bold"
grep -nE '(可能です|提供します|が求められます|において|に関して)' README.md || echo "no banned phrases"
```
Expected: `no bold`、`no banned phrases`。

- [ ] **Step 3: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/README.md
git commit -m "20261016_eks_ecr_nlb_iam_terraform: READMEの初版(手順、権限、申請文、可逆性)を追加"
```

---

### Task 10: 第 0〜1 段(tf-builder を作り、builder として apply して疎通まで)

**Files:**
- Modify: `20261016_eks_ecr_nlb_iam_terraform/bootstrap/tf-builder-policy.json`(AccessDenied が出た場合のみ Action を追記)
- Modify: `20261016_eks_ecr_nlb_iam_terraform/README.md`(実験ログ)
- Modify: `~/.aws/config`(プロファイル `builder` と `deployer` を追加)

**Interfaces:**
- Consumes: Task 1〜9 の全成果物
- Produces: `tf-builder` ロール、稼働中の環境(builder が作成者)、`terraform output` の値、実験ログの第 0〜1 段

管理者(`default`)が行うのは、残骸チェックの基準点取得と `create-builder-role.sh` だけです。
それ以外の AWS 操作は全て `builder` か `deployer` で行います。
許可ルールは前置き一致なので、`terraform apply` と `terraform destroy` はコマンド先頭に置き、`cd` は別の呼び出しで行います。
プロファイルは `--profile` か、kubeconfig の alias で指定します。

- [ ] **Step 1: 管理者で基準点を取る**

Run:
```bash
aws sts get-caller-identity --query Arn --output text
cd 20261016_eks_ecr_nlb_iam_terraform && scripts/check-leftovers.sh
```
Expected: ARN が `AWSReservedSSO_AdministratorAccess_...` を含む。`RESULT: clean`。

- [ ] **Step 2: 管理者で tf-builder を作る(マネージャー役)**

Run:
```bash
SSO_ROLE_ARN=$(aws iam list-roles --path-prefix /aws-reserved/sso.amazonaws.com/ \
  --query "Roles[?contains(RoleName,'AdministratorAccess')].Arn | [0]" --output text)
bootstrap/create-builder-role.sh "$SSO_ROLE_ARN"
bootstrap/create-builder-role.sh "$SSO_ROLE_ARN"   # 2 回目は updated で成功する(冪等の確認)
```
Expected: 2 回とも最後に `arn:aws:iam::<ACCOUNT_ID>:role/tf-builder`。1 回目は `created`、2 回目は `updated`。ARN はファイルに書かない。

SSO ロール ARN(`aws-reserved` パス付き)が信頼ポリシーで `Invalid principal` と拒否された場合は、スクリプトの信頼ポリシーを「Principal は `arn:aws:iam::<ACCOUNT_ID>:root`、`Condition.ArnLike.aws:PrincipalArn` に引数の ARN」に変更して commit し、実験ログに記録する。

- [ ] **Step 3: builder プロファイルを足し、帽子が替わったことを確認する**

`~/.aws/config` の末尾に追記します(既存の節は触らない)。

```ini
[profile builder]
role_arn       = <Step 2 の出力>
source_profile = default
region         = ap-northeast-1
```

Run:
```bash
aws sts get-caller-identity --profile builder --query Arn --output text
aws iam list-users --profile builder 2>&1 | head -1
```
Expected: 1 行目は `arn:aws:sts::<ACCOUNT_ID>:assumed-role/tf-builder/...`。2 行目は `AccessDenied`(管理者権限が外れている証拠)。

- [ ] **Step 4: builder で state バケットを作る(S3 権限の検証)**

Run:
```bash
AWS_PROFILE=builder bootstrap/create-state-bucket.sh
AWS_PROFILE=builder bootstrap/create-state-bucket.sh   # 2 回目は already exists
```
Expected: 2 回ともバケット名が出て終了コード 0。AccessDenied が出たら Step 7 の要領で `StateBucket*` に Action を足す。

- [ ] **Step 5: プロファイルをコマンド引数で渡せるようにする(小さなコード変更)**

許可ルール `Bash(terraform apply:*)` は前置き一致なので、環境変数を前に置いた形は一致しません。
backend には init 時の `-backend-config="profile=..."`、provider には `-var aws_profile=...` で渡せるようにします。
既定値は `null` なので、本番では何も指定せずに済み、コードは変わりません。

`terraform/variables.tf` に追記:
```hcl
variable "aws_profile" {
  description = "AWS CLI プロファイル名。null なら環境の既定を使う。実験で builder を指定するために使う"
  type        = string
  default     = null
}
```

`terraform/main.tf` の `provider "aws"` に `profile = var.aws_profile` を追加し、`provider "kubernetes"` の exec args を次に変更:
```hcl
    args = concat(
      ["eks", "get-token", "--cluster-name", aws_eks_cluster.main.name, "--region", var.region],
      var.aws_profile == null ? [] : ["--profile", var.aws_profile],
    )
```

`20261016_eks_ecr_nlb_iam_terraform/.gitignore` に `tfplan` を追記します。

Run:
```bash
cd terraform
terraform fmt -check -recursive && terraform validate
git add variables.tf main.tf ../.gitignore && git commit -m "20261016_eks_ecr_nlb_iam_terraform: aws_profile変数を追加(実験でbuilderプロファイルを引数で渡すため)"
```
Expected: validate 成功、commit 完了。

- [ ] **Step 6: builder で init、validation 確認、plan**

Run:
```bash
terraform init -backend-config="profile=builder" -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
terraform plan -var aws_profile=builder -var 'deployer_trusted_principals=["arn:aws:sts::123456789012:assumed-role/x/y"]' 2>&1 | grep -c 'arn:aws:iam::<account>:role'
terraform plan -var aws_profile=builder -out=tfplan 2>&1 | tail -3
```
Expected: init 成功。validation の grep は `1`。plan は `Plan: N to add, 0 to change, 0 to destroy`。plan は読み取り系 API だけなので、ここで AccessDenied が出たら `ReadOnlyDiscovery` に Action を足す(Step 7b)。

`deployer_trusted_principals` が空なので、`aws_iam_session_context` は実行者の帽子 `tf-builder` を deployer の信頼先にします。実験では builder が deployer 役を兼ねるのでこれで足ります。plan の出力で `deployer_trusted_principals` が `tf-builder` の ARN になっていることを確認します。

- [ ] **Step 7: builder で apply(AccessDenied の収集)**

Run(`cd terraform` 済みの状態で、コマンド先頭を `terraform apply` にする。`run_in_background` で実行):
```bash
terraform apply -auto-approve tfplan > /tmp/claude-1000/-home-kazufusa-src-github-com-kazufusa-til/180bb581-075b-430e-a024-0a949e7fa652/scratchpad/task10-apply.log 2>&1
grep -oE 'not authorized to perform: [a-zA-Z0-9:*-]+' /tmp/claude-1000/-home-kazufusa-src-github-com-kazufusa-til/180bb581-075b-430e-a024-0a949e7fa652/scratchpad/task10-apply.log | sort -u
```
Expected: 理想は `Apply complete!`(15〜20 分)。AccessDenied が出たら Step 7b へ。kubernetes provider の接続エラーなら `terraform apply -var aws_profile=builder -target=aws_eks_cluster.main -auto-approve` の後に全体を apply し直し、回避を使ったことを記録する。

- [ ] **Step 7b: 足りない Action を候補ポリシーに足して再試行**

`not authorized to perform: <service>:<Action>` の一覧を、`bootstrap/tf-builder-policy.json` の該当 Sid の `Action` 配列に足します(IAM 系は Resource を `eks-exp-*` / `app-deployer` に限定したまま。attach 対象のポリシーが増えたら `IamAttachOnlyKnownPolicies` の条件に足す)。その後:

```bash
(cd .. && bootstrap/create-builder-role.sh "$SSO_ROLE_ARN")   # 管理者。ポリシーの新バージョンを既定にする
sleep 10
terraform plan -var aws_profile=builder -out=tfplan >/dev/null
terraform apply -auto-approve tfplan
```

`Apply complete!` が出るまで繰り返します。足した Action は 1 回ごとに実験ログへ記録し、JSON の変更はその都度 commit します。

- [ ] **Step 8: output と NLB target の確認**

Run:
```bash
terraform output
TG=$(aws elbv2 describe-target-groups --names eks-exp-nodeport --profile builder --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 describe-target-health --target-group-arn "$TG" --profile builder
```
Expected: output に `cluster_name`、`nlb_dns_name`、`ecr_repository_url`、`deployer_role_arn`、`deployer_trusted_principals`(`tf-builder` の ARN)、`deployer_namespaces = ["app"]`、`node_port = 30080`、`nat_public_ip`。target は 1 台で `unhealthy`(まだ Pod が無い)。

- [ ] **Step 9: deployer プロファイルを足す**

`app-deployer` の信頼先は `tf-builder` なので、`source_profile = builder` にします(帽子の 2 段重ね)。

```ini
[profile deployer]
role_arn       = <terraform output -raw deployer_role_arn>
source_profile = builder
region         = ap-northeast-1
```

Run:
```bash
aws sts get-caller-identity --profile deployer --query Arn --output text
```
Expected: `arn:aws:sts::<ACCOUNT_ID>:assumed-role/app-deployer/...`。

- [ ] **Step 10: deployer 役で image を push する**

Run:
```bash
cd /home/kazufusa/src/github.com/kazufusa/til/20261016_eks_ecr_nlb_iam_terraform
ECR=$(cd terraform && terraform output -raw ecr_repository_url)
aws ecr get-login-password --profile deployer | docker login --username AWS --password-stdin "${ECR%/*}"
docker build -t "${ECR}:v1" app/
docker push "${ECR}:v1"
aws ecr describe-images --repository-name app --profile deployer --query 'imageDetails[].imageTags' --output text
```
Expected: `Login Succeeded`、push 完了、`v1`。

- [ ] **Step 11: deployer 役で kubectl apply する**

Run:
```bash
aws eks update-kubeconfig --name eks-exp --profile deployer --alias eks-exp-deployer
kubectl --context eks-exp-deployer get nodes; echo "exit=$?"
kubectl --context eks-exp-deployer -n app get resourcequota
sed "s|IMAGE_PLACEHOLDER|${ECR}:v1|" app/k8s.yaml | kubectl --context eks-exp-deployer apply -n app -f -
kubectl --context eks-exp-deployer -n app rollout status deploy/web --timeout=120s
kubectl --context eks-exp-deployer -n app get pod,svc
```
Expected: `get nodes` は `Forbidden` で `exit=1`。quota `no-cloud-resources` が見える。`successfully rolled out`。Service の `PORT(S)` が `80:30080/TCP`。

- [ ] **Step 12: 外部 URL と外向き通信を確認する**

Run:
```bash
NLB=$(cd terraform && terraform output -raw nlb_dns_name)
aws elbv2 describe-target-health --target-group-arn "$TG" --profile builder --query 'TargetHealthDescriptions[].TargetHealth.State' --output text
curl -s --max-time 10 "http://${NLB}/" | grep -o 'hello from eks-exp'
NAT_IP=$(cd terraform && terraform output -raw nat_public_ip)
POD_IP=$(kubectl --context eks-exp-deployer -n app exec deploy/web -- wget -qO- -T 5 http://checkip.amazonaws.com/)
echo "nat=${NAT_IP} seen_from_pod=${POD_IP}"
```
Expected: `healthy`、`hello from eks-exp`、2 つの IP が一致。`unhealthy` のまま curl がタイムアウトする場合は Task 4 の代替ルール(VPC CIDR からの 30080 許可)に差し替えて builder で apply し直し、commit と記録を行う。NLB の DNS 伝播で最初の 1〜2 分は失敗することがある。

- [ ] **Step 13: 実験ログを README に追記して commit**

日付、Step 2 の信頼ポリシーの可否、Step 6〜7b で足した Action、apply の所要時間、Step 8/12 の結果、回避策の有無。アカウント ID と ARN は書かない。

```bash
grep -rn "$(aws sts get-caller-identity --query Account --output text)" 20261016_eks_ecr_nlb_iam_terraform/ || echo clean
git add 20261016_eks_ecr_nlb_iam_terraform/README.md 20261016_eks_ecr_nlb_iam_terraform/bootstrap/tf-builder-policy.json
git commit -m "20261016_eks_ecr_nlb_iam_terraform: 第0〜1段(tf-builderで構築し疎通確認)の実験ログを追記"
```

---

### Task 11: 第 2 段(builder で destroy し、戻ることを確認)

**Files:**
- Modify: `20261016_eks_ecr_nlb_iam_terraform/README.md`(実験ログ)
- Modify: `bootstrap/tf-builder-policy.json`(destroy で AccessDenied が出た場合のみ)

**Interfaces:**
- Consumes: Task 10 で稼働中の環境
- Produces: 空のアカウント(`tf-builder` と state バケットのみ残る)、実験ログの第 2 段

- [ ] **Step 1: builder の kubeconfig と destroy 前チェック**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform
aws eks update-kubeconfig --name eks-exp --profile builder --alias eks-exp-builder
kubectl config use-context eks-exp-builder
scripts/preflight-destroy.sh
```
Expected: `preflight ok: no LoadBalancer services, no PVCs`。

- [ ] **Step 2: quota と preflight の陰性対照**

Run:
```bash
kubectl -n app expose deploy web --name=web-lb --type=LoadBalancer --port=80 --target-port=8080; echo "exit=$?"
kubectl -n default create deploy nc --image=public.ecr.aws/docker/library/busybox:1.36 -- sleep 3600
kubectl -n default expose deploy nc --name=nc-lb --type=LoadBalancer --port=80
sleep 5
scripts/preflight-destroy.sh; echo "exit=$?"
kubectl -n default delete svc nc-lb deploy nc
sleep 60
aws elbv2 describe-load-balancers --profile builder --query 'LoadBalancers[].LoadBalancerName' --output text
aws elb describe-load-balancers --profile builder --query 'LoadBalancerDescriptions[].LoadBalancerName' --output text
```
Expected: 最初の expose は `exceeded quota: no-cloud-resources` で `exit=1`。preflight は `default/nc-lb` を出して `exit=1`。削除後、elbv2 は `eks-exp-nlb` のみ、classic は空。classic が残っていれば `aws elb delete-load-balancer --load-balancer-name <name> --profile default` で消して記録する。

- [ ] **Step 3: image を残したまま builder で destroy する**

Run:
```bash
scripts/preflight-destroy.sh
cd terraform
terraform destroy -var aws_profile=builder -auto-approve > /tmp/claude-1000/-home-kazufusa-src-github-com-kazufusa-til/180bb581-075b-430e-a024-0a949e7fa652/scratchpad/task11-destroy.log 2>&1
grep -oE 'not authorized to perform: [a-zA-Z0-9:*-]+' /tmp/claude-1000/-home-kazufusa-src-github-com-kazufusa-til/180bb581-075b-430e-a024-0a949e7fa652/scratchpad/task11-destroy.log | sort -u
```
Expected: `Destroy complete!`。AccessDenied が出たら Task 10 Step 7b の要領で足して `destroy` を再実行する。所要時間を記録する。

- [ ] **Step 4: 残骸チェック**

Run:
```bash
cd .. && scripts/check-leftovers.sh; echo "exit=$?"
aws s3 ls --profile builder | grep tfstate
```
Expected: `LEFTOVER` は `tag Project=eks-exp`(tf-builder のロールとポリシー)、`iam roles`(tf-builder)、`iam policies`(tf-builder-policy)の 3 行だけで、他は全て `ok`。state バケットは残る。それ以外の LEFTOVER があれば原因を調べて記録する。

- [ ] **Step 5: 実験ログを追記して commit**

destroy の所要時間、残骸チェックの結果、陰性対照の結果、足した Action。

```bash
kubectl config delete-context eks-exp-deployer
git add README.md bootstrap/tf-builder-policy.json
git commit -m "20261016_eks_ecr_nlb_iam_terraform: 第2段(builderでdestroyし残骸なしを確認)の実験ログを追記"
```

---

### Task 12: 第 3 段(deployer の境界確認)

**Files:**
- Modify: `20261016_eks_ecr_nlb_iam_terraform/README.md`(実験ログ)

**Interfaces:**
- Consumes: Task 11 後の状態(`tf-builder` あり、環境なし)
- Produces: 稼働中の環境(再構築)、deployer の境界確認の記録

- [ ] **Step 1: builder で再 apply**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/terraform
terraform apply -var aws_profile=builder -auto-approve > /tmp/claude-1000/-home-kazufusa-src-github-com-kazufusa-til/180bb581-075b-430e-a024-0a949e7fa652/scratchpad/task12-apply.log 2>&1; tail -3 "$_"
```
Expected: `Apply complete!`(確定した権限だけで通る)。

- [ ] **Step 2: deployer の AWS 側の境界(全て拒否)**

Run:
```bash
for cmd in \
  "aws ec2 describe-instances" \
  "aws eks list-clusters" \
  "aws ecr create-repository --repository-name other" \
  "aws iam list-roles" \
  "aws elbv2 describe-load-balancers"; do
  echo "== $cmd"
  $cmd --profile deployer 2>&1 | grep -oE 'AccessDenied|UnauthorizedOperation|not authorized' | head -1 || echo "ALLOWED (unexpected)"
done
aws eks describe-cluster --name eks-exp --profile deployer --query cluster.status --output text
```
Expected: 5 つとも拒否。最後だけ `ACTIVE`。

- [ ] **Step 3: deployer の Kubernetes 側の境界**

Run:
```bash
aws eks update-kubeconfig --name eks-exp --profile deployer --alias eks-exp-deployer
K="kubectl --context eks-exp-deployer"
echo "--- 許可されるべき(書き込みは app、読み取りは全体)"; $K -n app auth can-i create deployments; $K -n app auth can-i create services; $K -n app auth can-i delete pods; $K -n app auth can-i create rolebindings; $K auth can-i list nodes; $K auth can-i list namespaces; $K -n kube-system auth can-i list pods
echo "--- 拒否されるべき"; $K auth can-i create namespaces; $K -n kube-system auth can-i delete pods; $K -n kube-system auth can-i get secrets; $K -n app auth can-i update resourcequotas; $K -n app auth can-i delete namespaces
$K get nodes; echo "exit=$?"
echo "--- quota で拒否されるべき"
$K -n app create deploy nc --image=public.ecr.aws/docker/library/busybox:1.36 -- sleep 3600
$K -n app expose deploy nc --name=nc-lb --type=LoadBalancer --port=80; echo "exit=$?"
$K -n app delete deploy nc
```
Expected: 許可側 7 つ `yes`。拒否側 5 つ `no`。`get nodes` はノード 1 台が表示され `exit=0`。quota は `exceeded quota: no-cloud-resources`。

- [ ] **Step 4: 実験ログを追記して commit**

```bash
cd .. && git add README.md && git commit -m "20261016_eks_ecr_nlb_iam_terraform: 第3段(deployerの境界確認)の実験ログを追記"
```

---

### Task 12b: builder 権限を「AWS 管理ポリシー 3 + カスタム 1」に組み替える(PR 向けの可読性)

**Files:**
- Modify: `20261016_eks_ecr_nlb_iam_terraform/bootstrap/create-builder-role.sh`(管理ポリシー 3 つの attach を追加。detach 側も `delete-builder-role.sh` で対応)
- Modify: `20261016_eks_ecr_nlb_iam_terraform/bootstrap/tf-builder-policy.json`(カスタム部分だけに縮める)
- Create: `20261016_eks_ecr_nlb_iam_terraform/bootstrap/tf-builder-policy.minimal.json`(実験で検証した細かい JSON。監査が厳しい環境向けの代替)

**Interfaces:**
- Consumes: Task 11/12 で確定した細かい JSON(2 つの発見 Action を含む)
- Produces: 粗い構成の `tf-builder`。Task 13 の destroy とバケット再作成で検証する

- [ ] **Step 1: minimal を退避する**

```bash
cd 20261016_eks_ecr_nlb_iam_terraform/bootstrap
cp tf-builder-policy.json tf-builder-policy.minimal.json
```

- [ ] **Step 2: tf-builder-policy.json をカスタム部分だけにする**

残す Sid: `Eks`(`eks:*` に置き換えて 1 Action に)、`AutoScalingAttach`、`IamRolesScoped`、`IamAttachOnlyKnownPolicies`、`IamPoliciesScoped`、`ServiceLinkedRoles`、`StateBucketAdmin`、`StateBucketObjects`、`StateBucketDiscovery`、`ReadOnlyDiscovery`(`iam:Get*`/`iam:List*`/`sts:GetCallerIdentity`/`eks:Describe*` 以外は管理ポリシー側で足りるが、残しても害はないのでそのまま)。
`Network`、`Ecr`、`Elb` の Sid は削除し、代わりに次の Sid を足す。

```json
{
  "Sid": "FoundByExperiment",
  "Effect": "Allow",
  "Action": [
    "ec2:GetSecurityGroupsForVpc",
    "ec2:DisassociateAddress"
  ],
  "Resource": "*"
}
```

`jq empty` で検証する。

- [ ] **Step 3: create-builder-role.sh に管理ポリシーの attach を足す**

`aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$POLICY_ARN"` の直前に次を足す。

```bash
for managed in \
  arn:aws:iam::aws:policy/AmazonVPCFullAccess \
  arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess \
  arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess; do
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$managed"
done
```

`delete-builder-role.sh` は attach 済みポリシーを全て detach する実装なので変更不要(確認する)。

- [ ] **Step 4: 管理者でロールを更新し、builder で plan が通ることを確認する**

```bash
bootstrap/create-builder-role.sh "$SSO_ROLE_ARN"
sleep 10
aws iam list-attached-role-policies --role-name tf-builder --query 'AttachedPolicies[].PolicyName' --output text
terraform -chdir=terraform plan -var aws_profile=builder 2>&1 | tail -3
```
Expected: 4 ポリシーが attach。plan は `No changes.`(環境が稼働中のため)。

- [ ] **Step 5: commit**

```bash
git add bootstrap/
git commit -m "20261016_eks_ecr_nlb_iam_terraform: builder権限をAWS管理ポリシー3つ+カスタム1つに組み替え、検証済み最小JSONはminimalとして保持"
```

粗い構成の検証は Task 13 で行う(destroy、バケット削除と再作成が builder で通ること)。

---

### Task 12c: 名前の一元化(本番で名前が変わっても動くように)

**Files:**
- Modify: `terraform/variables.tf`(`cluster_name` に validation: 1〜20 文字、`^[a-z][a-z0-9-]*[a-z0-9]$`。理由: NLB 名 32 文字制限に `-nodeport` 等の接尾辞を足しても収まる長さ)
- Modify: `terraform/main.tf`(`default_tags` の `Project = var.cluster_name`)
- Modify: `terraform/deployer.tf`(ロール名 `${var.cluster_name}-deployer`、ポリシー名 `${var.cluster_name}-deployer-policy`、Kubernetes グループ `${var.cluster_name}-deployers`)
- Modify: `terraform/namespace.tf`(ClusterRoleBinding の subject を同じグループ名に)
- Modify: `bootstrap/*.sh`、`scripts/check-leftovers.sh`、`scripts/preflight-destroy.sh`(環境変数 `PROJECT`、既定 `eks-exp`。バケット名、ロール名、タグ値、残骸の名前パターンに使う)
- Create: `scripts/render-policy.sh <PROJECT>`(`bootstrap/tf-builder-policy.json` と `.minimal.json` の `eks-exp` を置換して `bootstrap/rendered/<PROJECT>/` に出力。`create-builder-role.sh` は `PROJECT` が `eks-exp` 以外のときこの出力を使う)
- Modify: `docs/permissions.md`、`README.md`(名前を変える手順を「`cluster_name` を変える」「`PROJECT=<名前> scripts/render-policy.sh` で JSON を作る」「以後のスクリプトは `PROJECT=<名前>` 付きで実行」の 3 行に)

**Interfaces:**
- Produces: 名前の源は terraform の `var.cluster_name` と、スクリプトの `PROJECT` の 2 つ。両方に同じ値を入れる

検証は Task 13 の eks-exp2 周回で行う。`terraform validate` と `bash -n` は本タスクで通す。

---

### Task 13: 片付けと README の完成

**Files:**
- Modify: `20261016_eks_ecr_nlb_iam_terraform/README.md`(確定版 JSON、申請文、実験ログ)

**Interfaces:**
- Consumes: Task 12 後の稼働中の環境、確定した `bootstrap/tf-builder-policy.json`
- Produces: 空のアカウント、完成した README、push 済みの main

- [ ] **Step 1: builder で destroy**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform
kubectl config use-context eks-exp-builder && scripts/preflight-destroy.sh
cd terraform && terraform destroy -var aws_profile=builder -auto-approve > /tmp/claude-1000/-home-kazufusa-src-github-com-kazufusa-til/180bb581-075b-430e-a024-0a949e7fa652/scratchpad/task13-destroy.log 2>&1; tail -3 "$_"
```
Expected: `Destroy complete!`。

- [ ] **Step 2: builder で state バケットを消す(S3 削除権限の検証)**

Run:
```bash
cd .. && AWS_PROFILE=builder bootstrap/delete-state-bucket.sh
```
Expected: `y` を入力後、`deleted bucket: tfstate-<ACCOUNT_ID>-eks-exp`。対話入力が使えない場合は `yes y | AWS_PROFILE=builder bootstrap/delete-state-bucket.sh`。

- [ ] **Step 2b: builder でバケットを作り直して消す(CreateBucket の検証)**

第 0〜1 段ではバケットが管理者作成済みだったため、builder の `s3:CreateBucket` は未検証です。ここで一度作って消します。

Run:
```bash
AWS_PROFILE=builder bootstrap/create-state-bucket.sh
yes y | AWS_PROFILE=builder bootstrap/delete-state-bucket.sh
```
Expected: `created: tfstate-<ACCOUNT_ID>-eks-exp` の後にバケット名、続いて `deleted bucket: ...`。AccessDenied なら `StateBucketAdmin` に Action を足し、管理者が `create-builder-role.sh` を再実行して再試行する。S3 は削除直後の同名再作成が数秒〜数分遅れることがあるので、`OperationAborted` が出たら 1 分待って再実行する。

- [ ] **Step 2c: 名前を変えて 1 周する(eks-exp2)**

名前を変えても動くことの証明です。管理者がやるのは `tf-builder` のポリシー差し替えだけです。

```bash
PROJECT=eks-exp2 scripts/render-policy.sh eks-exp2
PROJECT=eks-exp2 bootstrap/create-builder-role.sh "$SSO_ROLE_ARN"     # 管理者。eks-exp2 用 JSON で tf-builder を更新
PROJECT=eks-exp2 AWS_PROFILE=builder bootstrap/create-state-bucket.sh
terraform -chdir=terraform init -reconfigure -backend-config="profile=builder" -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp2"
terraform -chdir=terraform apply -var aws_profile=builder -var cluster_name=eks-exp2 -auto-approve
```
deployer 役で push と apply を行い、curl で応答を確認したら destroy します。

```bash
terraform -chdir=terraform destroy -var aws_profile=builder -var cluster_name=eks-exp2 -auto-approve
PROJECT=eks-exp2 scripts/check-leftovers.sh
yes y | PROJECT=eks-exp2 AWS_PROFILE=builder bootstrap/delete-state-bucket.sh
```
Expected: apply と destroy が AccessDenied なしで通り、残骸は `tf-builder` のみ。結果を実験ログに記録する。

- [ ] **Step 3: 管理者で tf-builder を消し、残骸チェックを通す**

Run:
```bash
bootstrap/delete-builder-role.sh
scripts/check-leftovers.sh
aws s3 ls | grep -c tfstate || echo "no state bucket"
```
Expected: `deleted role: tf-builder`、`deleted policy: ...`、`RESULT: clean`、`no state bucket`。

- [ ] **Step 4: kubeconfig の後始末**

```bash
kubectl config delete-context eks-exp-builder; kubectl config delete-context eks-exp-deployer
kubectl config delete-cluster arn:aws:eks:ap-northeast-1:$(aws sts get-caller-identity --query Account --output text):cluster/eks-exp
```
`~/.aws/config` の `builder` と `deployer` は再実験に備えて残す(README に「不要なら手で消す」と記載)。

- [ ] **Step 5: 文書を README と docs/ に分割して完成させる**

README.md は 100 行前後の入口にし、詳細は `docs/` に移します。既存 README の内容は捨てずに移します。

| ファイル | 中身 |
| --- | --- |
| `README.md` | 何を作るか(5 要件の箇条書き)、2 つのロールの 1 行説明、最短手順(マネージャー 1 コマンド、builder: init/apply/output、deployer: profile/push/apply/確認)、名前を変えるときの注意(`cluster_name` と `PROJECT`)、docs への案内 |
| `docs/guide.md` | 初学者向け解説。項目: 1 ロールは帽子、SSO とスイッチロール / 2 段 0 と段 1 / 3 builder と deployer の分担 / 4 kubectl の認証と認可(get-token と Access Entry) / 5 ノードと Pod / 6 URL から Pod までの経路と 30080 / 7 namespace admin + cluster view と ResourceQuota の理由 / 8 ECR と Pod の紐付け(deployer は image 名を書く、pull 権限はノードの帽子) / 9 マネージャーへの頼み方。各項目 3〜6 文 |
| `docs/permissions.md` | builder: 申請構成の表(AWS 管理 3 + カスタム 1)と 3 行の説明、カスタム JSON、権限一覧表(サービス別の目的)、実験で見つかった権限の表、付録として `tf-builder-policy.minimal.json` の全文。deployer: AWS 側 JSON、Kubernetes 側(Admin namespace app + View cluster)、できる/できない表。設計の方針(AWS 推奨に沿った点)もここに移す |
| `docs/request.md` | 申請文のたたき台。依頼 1 件(`create-builder-role.sh <ARN>`)、添付 3 つ、範囲の説明 4 点、撤去手順、候補ポリシーは硬い境界ではない旨 |
| `docs/experiment-log.md` | 既存の実験ログを移し、第 3 段と片付けを追記。費用の概算を記入 |

書き方の規約(ですます調、一文 60 字目安、強調なし、見出しは体言止め、固有値なし)は全ファイルに適用します。
`docs/design.md` の「成果物」の節を、この分割に合わせて更新します。

確認:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform
wc -l README.md docs/*.md
for f in README.md docs/guide.md docs/permissions.md docs/request.md docs/experiment-log.md; do
  grep -nE '\*\*[^*]+\*\*' "$f" && echo "bold in $f"
  grep -nE '(可能です|提供します|が求められます|において|に関して)' "$f" && echo "banned in $f"
done; echo checks done
grep -rn "$(aws sts get-caller-identity --query Account --output text)" . || echo "no account id"
LC_ALL=C.UTF-8 gawk 'BEGIN{code=0} /^```/{code=!code; next} code||/^\|/||/^#/||/^$/{next} {if (length($0) > 90) print FILENAME":"NR": "length($0)}' README.md docs/guide.md docs/permissions.md docs/request.md docs/experiment-log.md
```
Expected: README が 120 行以下、`checks done` の前に出力なし、`no account id`、長文チェックの出力なし。

- [ ] **Step 6: commit と push**

```bash
cd /home/kazufusa/src/github.com/kazufusa/til
git add 20261016_eks_ecr_nlb_iam_terraform/
git commit -m "20261016_eks_ecr_nlb_iam_terraform: 片付け完了、確定版の申請ポリシーと申請文をREADMEに記載"
git push origin main
```
