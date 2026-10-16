# EKS + ECR + NLB + デプロイ権限の terraform 実験 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** terraform で EKS、ECR、NLB、deployer ロールを作る本番同等のコードと、実験で検証済みの権限リスト 2 つ(builder の申請用、deployer の付与用)を作ります。

**Architecture:** 1 つの terraform ルート(`terraform/`)が VPC、EKS、node group、ECR、NLB、deployer の IAM ロールと Access Entry を持ちます。state は管理者がスクリプトで作る S3 バケットに置きます。実験専用の `builder/` が申請候補の権限だけを持つロールを作り、そのロールで本体を apply/destroy して権限を確定させます。

**Tech Stack:** Terraform 1.15(backend s3 + use_lockfile)、hashicorp/aws provider 6 系、AWS CLI v2(SSO)、kubectl 1.34、docker、jq、bash

**Spec:** `docs/superpowers/specs/2026-10-16-eks-ecr-nlb-iam-terraform-design.md`

## Global Constraints

- リージョンは `ap-northeast-1`、管理者プロファイルは `default`(SSO、AdministratorAccess)
- 追加プロファイルは `builder`(`tf-builder` ロール)と `deployer`(`app-deployer` ロール)、どちらも `source_profile = default`
- 全資源に `Project = eks-exp` タグ(provider の `default_tags`)
- クラスタ名 `eks-exp`、IAM ロール名は `eks-exp-cluster`、`eks-exp-node`、`app-deployer`、`tf-builder`、ポリシー名は `app-deployer-policy`、`tf-builder-policy`
- ECR リポジトリ名 `app`、NodePort は `30080`、ノードは `t3.medium` x1
- state バケット名は `tfstate-<アカウントID>-eks-exp`、タグは `Project = eks-exp-state`(残骸チェックの対象外にするため値を変える)
- EKS コントロールプレーンログは全て無効、KMS カスタマーキーは使わない、アカウント設定・Service Quotas・Identity Center・Organizations・CloudTrail・AWS Config は触らない
- 日本語文書は `~/.claude/CLAUDE.md` の規約(ですます調、一文 60 字目安、強調表現なし、見出しは体言止め)に従う
- commit に Co-Authored-By と Generated with は書かない
- AWS に課金が発生するタスク(Task 10 以降)は、着手前に `aws sts get-caller-identity` で `default` プロファイルが生きていることを確認する

## Review Focus

- NLB のヘルスチェックが node SG の「NLB SG 参照」ルールで通らず、curl がタイムアウトする。期待は target が `healthy` になること。Task 10 の Step 7 で `describe-target-health` を確認し、`unhealthy` のときは Task 4 の代替ルール(VPC CIDR からの 30080 許可)に切り替える
- `deployer_trusted_principals` に `arn:aws:sts::...:assumed-role/...` を渡すと IAM が `Invalid principal` で失敗する。期待は plan 時に分かりやすく落ちること。Task 5 の変数 validation で `arn:aws:iam::` 始まりを強制し、Task 10 の Step 3 で ARN 変換を手順化する
- `create-state-bucket.sh` を 2 回実行すると `BucketAlreadyOwnedByYou` で落ちる。期待は冪等に成功すること。Task 7 の Step 1 で `head-bucket` による存在確認を入れる
- `preflight-destroy.sh` が別クラスタの kubeconfig を見て「問題なし」と答える。期待は対象クラスタ以外なら拒否すること。Task 7 の Step 4 で current-context の ARN にクラスタ名が含まれることを確認する
- ECR に image が残ったまま destroy すると `RepositoryNotEmptyException` で止まる。期待は `force_delete = true` で消えること。Task 11 の Step 2 は image を push したまま destroy して確認する

---

### Task 1: ディレクトリと terraform の骨組み

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/.gitignore`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/versions.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/backend.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/backend.hcl.example`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/variables.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/main.tf`

**Interfaces:**
- Consumes: なし
- Produces: 変数 `region`、`cluster_name`、`node_count`、`ecr_repository_name`、`deployer_trusted_principals`。`locals.name_prefix = var.cluster_name`。data `aws_caller_identity.current`、`aws_availability_zones.available`

- [ ] **Step 1: .gitignore を作る**

```gitignore
# 20261016_eks_ecr_nlb_iam_terraform/.gitignore
.terraform/
*.tfstate
*.tfstate.*
backend.hcl
*.tfvars
!*.tfvars.example
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
  }
}
```

- [ ] **Step 3: backend.tf と backend.hcl.example を作る**

```hcl
# terraform/backend.tf
terraform {
  backend "s3" {}
}
```

```hcl
# terraform/backend.hcl.example
# cp backend.hcl.example backend.hcl して <ACCOUNT_ID> を埋める
bucket       = "tfstate-<ACCOUNT_ID>-eks-exp"
key          = "terraform/terraform.tfstate"
region       = "ap-northeast-1"
use_lockfile = true
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
  description = "app-deployer ロールにスイッチできる IAM principal の ARN。sts の assumed-role ARN ではなく iam のロール/ユーザー ARN を渡す"
  type        = list(string)

  validation {
    condition = alltrue([
      for arn in var.deployer_trusted_principals :
      can(regex("^arn:aws:iam::[0-9]{12}:(role|user)/", arn))
    ])
    error_message = "各要素は arn:aws:iam::<account>:role/... または :user/... の形式にしてください。"
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
}
```

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

- [ ] **Step 2: validate を通す**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/terraform
terraform fmt -check -recursive && terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 3: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/terraform/eks.tf
git commit -m "20261016_eks_ecr_nlb_iam_terraform: EKSクラスタとmanaged node groupを追加"
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

### Task 5: deployer ロールと output

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/deployer.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/outputs.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/terraform/terraform.tfvars.example`

**Interfaces:**
- Consumes: `var.deployer_trusted_principals`、`aws_ecr_repository.app.arn`、`aws_eks_cluster.main.arn`
- Produces: `aws_iam_role.deployer.arn`、output `cluster_name`、`nlb_dns_name`、`ecr_repository_url`、`deployer_role_arn`、`region`

- [ ] **Step 1: deployer.tf を作る**

```hcl
# terraform/deployer.tf
data "aws_iam_policy_document" "deployer_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = var.deployer_trusted_principals
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

resource "aws_eks_access_policy_association" "deployer" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_iam_role.deployer.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.deployer]
}
```

- [ ] **Step 2: outputs.tf を作る**

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
```

- [ ] **Step 3: terraform.tfvars.example を作る**

```hcl
# terraform/terraform.tfvars.example
# cp terraform.tfvars.example terraform.tfvars して ARN を埋める
# SSO の場合は arn:aws:iam::<ACCOUNT_ID>:role/aws-reserved/sso.amazonaws.com/ap-northeast-1/AWSReservedSSO_AdministratorAccess_<hash>
deployer_trusted_principals = [
  "arn:aws:iam::<ACCOUNT_ID>:role/<ROLE_NAME>",
]
```

- [ ] **Step 4: validate を通す**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/terraform
terraform fmt -check -recursive && terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 5: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/terraform/deployer.tf 20261016_eks_ecr_nlb_iam_terraform/terraform/outputs.tf 20261016_eks_ecr_nlb_iam_terraform/terraform/terraform.tfvars.example
git commit -m "20261016_eks_ecr_nlb_iam_terraform: deployerロール/ポリシー/Access Entryとoutputを追加"
```

---

### Task 6: builder ロール(実験専用)

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/builder/versions.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/builder/backend.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/builder/backend.hcl.example`
- Create: `20261016_eks_ecr_nlb_iam_terraform/builder/main.tf`
- Create: `20261016_eks_ecr_nlb_iam_terraform/builder/policy.json`
- Create: `20261016_eks_ecr_nlb_iam_terraform/builder/terraform.tfvars.example`

**Interfaces:**
- Consumes: なし(管理者が単独で apply する)
- Produces: IAM ロール `tf-builder`、output `builder_role_arn`。`policy.json` は README に貼る申請用 JSON の原本

- [ ] **Step 1: versions.tf、backend.tf、backend.hcl.example を作る**

```hcl
# builder/versions.tf
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
```

```hcl
# builder/backend.tf
terraform {
  backend "s3" {}
}
```

```hcl
# builder/backend.hcl.example
bucket       = "tfstate-<ACCOUNT_ID>-eks-exp"
key          = "builder/terraform.tfstate"
region       = "ap-northeast-1"
use_lockfile = true
```

- [ ] **Step 2: policy.json を作る(申請候補の初版)**

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

- [ ] **Step 3: main.tf と terraform.tfvars.example を作る**

```hcl
# builder/main.tf
provider "aws" {
  region = "ap-northeast-1"

  default_tags {
    tags = {
      Project = "eks-exp"
    }
  }
}

variable "trusted_principals" {
  description = "tf-builder にスイッチできる IAM principal の ARN"
  type        = list(string)

  validation {
    condition = alltrue([
      for arn in var.trusted_principals :
      can(regex("^arn:aws:iam::[0-9]{12}:(role|user)/", arn))
    ])
    error_message = "各要素は arn:aws:iam::<account>:role/... または :user/... の形式にしてください。"
  }
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = var.trusted_principals
    }
  }
}

resource "aws_iam_role" "builder" {
  name               = "tf-builder"
  description        = "Candidate permissions for running terraform/ (experiment only)"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_policy" "builder" {
  name   = "tf-builder-policy"
  policy = file("${path.module}/policy.json")
}

resource "aws_iam_role_policy_attachment" "builder" {
  role       = aws_iam_role.builder.name
  policy_arn = aws_iam_policy.builder.arn
}

output "builder_role_arn" {
  value = aws_iam_role.builder.arn
}
```

```hcl
# builder/terraform.tfvars.example
trusted_principals = [
  "arn:aws:iam::<ACCOUNT_ID>:role/<ROLE_NAME>",
]
```

- [ ] **Step 4: JSON の構文と validate を通す**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/builder
jq empty policy.json && echo "json ok"
terraform init -backend=false
terraform fmt -check -recursive && terraform validate
```
Expected: `json ok` と `Success! The configuration is valid.`

- [ ] **Step 5: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/builder/
git commit -m "20261016_eks_ecr_nlb_iam_terraform: 申請候補の権限を持つtf-builderロール(実験用)を追加"
```

---

### Task 7: 運用スクリプト

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/scripts/create-state-bucket.sh`
- Create: `20261016_eks_ecr_nlb_iam_terraform/scripts/delete-state-bucket.sh`
- Create: `20261016_eks_ecr_nlb_iam_terraform/scripts/check-leftovers.sh`
- Create: `20261016_eks_ecr_nlb_iam_terraform/scripts/preflight-destroy.sh`

**Interfaces:**
- Consumes: 環境変数 `AWS_PROFILE`(未指定なら `default`)、`AWS_REGION`(未指定なら `ap-northeast-1`)
- Produces: `create-state-bucket.sh` はバケット名を stdout に出す。`check-leftovers.sh` と `preflight-destroy.sh` は残骸があれば終了コード 1

- [ ] **Step 1: create-state-bucket.sh を作る(冪等)**

```bash
#!/usr/bin/env bash
# state 用 S3 バケットを作る。2 回実行しても成功する。
# 使い方: scripts/create-state-bucket.sh [bucket-name]
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

- [ ] **Step 2: delete-state-bucket.sh を作る(全バージョン削除)**

```bash
#!/usr/bin/env bash
# state 用 S3 バケットを、全オブジェクトバージョンと削除マーカーごと消す。
# 使い方: scripts/delete-state-bucket.sh [bucket-name]
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

- [ ] **Step 3: check-leftovers.sh を作る**

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

- [ ] **Step 4: preflight-destroy.sh を作る**

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

- [ ] **Step 5: 実行権限と構文チェック**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/scripts
chmod +x ./*.sh
for f in ./*.sh; do bash -n "$f" && echo "syntax ok: $f"; done
```
Expected: 4 本とも `syntax ok`。

- [ ] **Step 6: check-leftovers.sh を現状のアカウントで実行する(クリーンであることの基準点)**

この step から AWS を叩きます。先に `aws sso login` を済ませます。

Run:
```bash
aws sts get-caller-identity --query Arn --output text
cd 20261016_eks_ecr_nlb_iam_terraform
scripts/check-leftovers.sh
```
Expected: 全行 `ok`、最後に `RESULT: clean`。前回の実験(20260823_aws_gpu)の残骸が出たら、それは本実験の対象外なので README の実験ログに「実験前から存在」と記録し、`check-leftovers.sh` の結果の比較基準にします。

- [ ] **Step 7: commit**

```bash
git add 20261016_eks_ecr_nlb_iam_terraform/scripts/
git commit -m "20261016_eks_ecr_nlb_iam_terraform: stateバケット作成/削除、残骸チェック、destroy前チェックのスクリプトを追加"
```

---

### Task 8: deployer 用サンプルアプリ

**Files:**
- Create: `20261016_eks_ecr_nlb_iam_terraform/app/Dockerfile`
- Create: `20261016_eks_ecr_nlb_iam_terraform/app/index.html`
- Create: `20261016_eks_ecr_nlb_iam_terraform/app/k8s.yaml`

**Interfaces:**
- Consumes: output `ecr_repository_url`(image 名の置換に使う)
- Produces: コンテナは 8080 で HTTP 応答。manifest は namespace `app`、Deployment `web`、Service `web`(NodePort 30080)。image は `IMAGE_PLACEHOLDER` を sed で置換する

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
apiVersion: v1
kind: Namespace
metadata:
  name: app
---
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
Expected: `namespace/app created (dry run)`、`deployment.apps/web created (dry run)`、`service/web created (dry run)` の 3 行。kubeconfig が無いと失敗するので、その場合は `kubectl apply --dry-run=client --validate=false` ではなく、Task 10 の Step 9 で実クラスタに対して確認する。

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

| 役割 | 誰 | やること | 認証 |
| --- | --- | --- | --- |
| builder | 自分 | terraform apply/destroy | 本番: 申請した権限 / 実験: `tf-builder` にスイッチ |
| deployer | その人物 | ECR push、kubectl apply | `app-deployer` にスイッチ |

## 構成

(仕様「構成」の図と、NodePort 30080 の約束)

## 前提ツール

terraform 1.10 以上、aws cli v2、kubectl、docker、jq

## 手順(builder)

### 0. state バケット

```bash
scripts/create-state-bucket.sh
```

### 1. backend と tfvars

```bash
cd terraform
cp backend.hcl.example backend.hcl       # <ACCOUNT_ID> を埋める
cp terraform.tfvars.example terraform.tfvars  # 信頼する principal の ARN を埋める
terraform init -backend-config=backend.hcl
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

### 4. 禁止事項

Service type=LoadBalancer と PersistentVolumeClaim は作らないでください。
terraform の外にクラウド資源ができ、builder が環境を戻せなくなります。

## 片付け(builder、実験のみ)

```bash
aws eks update-kubeconfig --name eks-exp
scripts/preflight-destroy.sh
cd terraform && terraform destroy
scripts/check-leftovers.sh
```

## builder の権限(申請用)

(Task 12 で確定版の JSON に差し替える。初版は builder/policy.json と同じ)

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

### Task 10: 第 0〜1 段(管理者で通し確認)

**Files:**
- Modify: `20261016_eks_ecr_nlb_iam_terraform/README.md`(実験ログ)
- Create(gitignore 済): `terraform/backend.hcl`、`terraform/terraform.tfvars`
- Modify: `~/.aws/config`(プロファイル `deployer` を追加)

**Interfaces:**
- Consumes: Task 1〜9 の全成果物
- Produces: 稼働中の環境、`terraform output` の値、実験ログの第 1 段

- [ ] **Step 1: SSO ログインと残骸チェック**

Run:
```bash
aws sso login
aws sts get-caller-identity
cd 20261016_eks_ecr_nlb_iam_terraform && scripts/check-leftovers.sh
```
Expected: `RESULT: clean`(Task 7 Step 6 と同じ結果)。

- [ ] **Step 2: state バケットを作る**

Run:
```bash
scripts/create-state-bucket.sh
scripts/create-state-bucket.sh   # 2 回目は "bucket already exists" で成功する
```
Expected: 2 回ともバケット名が stdout に出て終了コード 0。

- [ ] **Step 3: 信頼する principal の ARN を求める**

Run:
```bash
aws sts get-caller-identity --query Arn --output text
```
Expected: `arn:aws:sts::<ACCOUNT_ID>:assumed-role/AWSReservedSSO_AdministratorAccess_<hash>/<user>` の形。これを次の形の IAM ロール ARN に変換します。

```
arn:aws:iam::<ACCOUNT_ID>:role/aws-reserved/sso.amazonaws.com/ap-northeast-1/AWSReservedSSO_AdministratorAccess_<hash>
```

確認:
```bash
aws iam list-roles --path-prefix /aws-reserved/sso.amazonaws.com/ --query 'Roles[].Arn' --output text
```
Expected: 上の ARN が含まれる。

- [ ] **Step 4: backend.hcl と terraform.tfvars を書いて init**

Run:
```bash
cd terraform
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
sed "s/<ACCOUNT_ID>/${ACCOUNT_ID}/" backend.hcl.example > backend.hcl
cat > terraform.tfvars <<EOF
deployer_trusted_principals = ["<Step 3 の IAM ロール ARN>"]
EOF
terraform init -backend-config=backend.hcl
```
Expected: `Terraform has been successfully initialized!`。S3 に `terraform/terraform.tfstate` はまだ無い。

- [ ] **Step 5: 変数 validation が効くことを確認する**

Run:
```bash
terraform plan -var 'deployer_trusted_principals=["arn:aws:sts::123456789012:assumed-role/x/y"]' 2>&1 | grep -c 'arn:aws:iam::<account>:role'
```
Expected: `1`(validation の error_message が出て plan が止まる)。

- [ ] **Step 6: apply**

Run:
```bash
terraform plan -out=tfplan
terraform apply tfplan
terraform output
```
Expected: 約 15〜20 分で完了。output に `cluster_name = "eks-exp"`、`nlb_dns_name`、`ecr_repository_url`、`deployer_role_arn`、`node_port = 30080` が出る。

- [ ] **Step 7: NLB の target が登録されていることを確認する**

Run:
```bash
TG=$(aws elbv2 describe-target-groups --names eks-exp-nodeport --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 describe-target-health --target-group-arn "$TG"
```
Expected: ノード 1 台が `State: unhealthy`(まだ 30080 で listen する Pod がない)。Step 11 で `healthy` になる。`Targets` が空なら `aws_autoscaling_attachment` を疑う。

- [ ] **Step 8: deployer プロファイルを `~/.aws/config` に足す**

```ini
[profile deployer]
role_arn       = <terraform output -raw deployer_role_arn の値>
source_profile = default
region         = ap-northeast-1
```

Run:
```bash
aws sts get-caller-identity --profile deployer --query Arn --output text
```
Expected: `arn:aws:sts::<ACCOUNT_ID>:assumed-role/app-deployer/...`。

- [ ] **Step 9: deployer 役で image を push する**

Run:
```bash
cd /home/kazufusa/src/github.com/kazufusa/til/20261016_eks_ecr_nlb_iam_terraform
export AWS_PROFILE=deployer
ECR=$(cd terraform && AWS_PROFILE=default terraform output -raw ecr_repository_url)
aws ecr get-login-password | docker login --username AWS --password-stdin "${ECR%/*}"
docker build -t "${ECR}:v1" app/
docker push "${ECR}:v1"
aws ecr describe-images --repository-name app --query 'imageDetails[].imageTags' --output text
```
Expected: `Login Succeeded`、push が完了し、`v1` が表示される。

- [ ] **Step 10: deployer 役で kubectl apply する**

Run:
```bash
export AWS_PROFILE=deployer
aws eks update-kubeconfig --name eks-exp --alias eks-exp-deployer
kubectl get nodes
sed "s|IMAGE_PLACEHOLDER|${ECR}:v1|" app/k8s.yaml | kubectl apply -f -
kubectl -n app rollout status deploy/web --timeout=120s
kubectl -n app get pod,svc
```
Expected: `kubectl get nodes` でノード 1 台が `Ready`。`deployment "web" successfully rolled out`。Service `web` の `PORT(S)` が `80:30080/TCP`。

- [ ] **Step 11: 外部 URL で応答を確認する**

Run:
```bash
NLB=$(cd terraform && AWS_PROFILE=default terraform output -raw nlb_dns_name)
aws elbv2 describe-target-health --target-group-arn "$TG" --profile default --query 'TargetHealthDescriptions[].TargetHealth.State' --output text
curl -s --max-time 10 "http://${NLB}/" | grep -o 'hello from eks-exp'
```
Expected: `healthy`、`hello from eks-exp`。`unhealthy` のままで curl がタイムアウトする場合は、Task 4 Step 2 の代替ルール(VPC CIDR からの 30080 許可)に差し替えて `terraform apply` し、再確認する。NLB の DNS 伝播で最初の 1〜2 分は名前解決に失敗することがある。

- [ ] **Step 12: 実験ログを README に追記して commit**

README の「実験ログ」に、日付、apply の所要時間、Step 7 と Step 11 の結果、SG ルールを差し替えたかどうかを書きます。

```bash
git add README.md
git commit -m "20261016_eks_ecr_nlb_iam_terraform: 第1段(管理者で通し確認)の実験ログを追記"
```

---

### Task 11: 第 2 段(可逆性の確認)

**Files:**
- Modify: `20261016_eks_ecr_nlb_iam_terraform/README.md`(実験ログ)

**Interfaces:**
- Consumes: Task 10 で稼働中の環境
- Produces: 空のアカウント(state バケットのみ残る)、実験ログの第 2 段

- [ ] **Step 1: destroy 前チェック**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform
export AWS_PROFILE=default
aws eks update-kubeconfig --name eks-exp --alias eks-exp-admin
scripts/preflight-destroy.sh
```
Expected: `preflight ok: no LoadBalancer services, no PVCs`。

- [ ] **Step 2: preflight が LoadBalancer を検出することを確認する(陰性対照)**

Run:
```bash
kubectl -n app expose deploy web --name=web-lb --type=LoadBalancer --port=80 --target-port=8080
sleep 5
scripts/preflight-destroy.sh; echo "exit=$?"
kubectl -n app delete svc web-lb
sleep 60   # in-tree controller が CLB を消すのを待つ
aws elbv2 describe-load-balancers --query 'LoadBalancers[].LoadBalancerName' --output text
aws elb describe-load-balancers --query 'LoadBalancerDescriptions[].LoadBalancerName' --output text
```
Expected: preflight が `app/web-lb` を出して `exit=1`。削除後、elbv2 には `eks-exp-nlb` のみ、elb(classic)は空。classic が残っていれば `aws elb delete-load-balancer --load-balancer-name <name>` で消し、実験ログに記録する。

- [ ] **Step 3: image を残したまま destroy する**

Run:
```bash
scripts/preflight-destroy.sh
cd terraform && time terraform destroy
```
Expected: `Destroy complete!`。ECR は `force_delete` で image ごと消える。所要時間を記録する。

- [ ] **Step 4: 残骸チェック**

Run:
```bash
cd .. && scripts/check-leftovers.sh
aws s3 ls | grep tfstate
```
Expected: `RESULT: clean`。state バケットだけが残る。

- [ ] **Step 5: kubeconfig の後始末と実験ログの追記、commit**

Run:
```bash
kubectl config delete-context eks-exp-admin
kubectl config delete-context eks-exp-deployer
kubectl config delete-cluster arn:aws:eks:ap-northeast-1:$(aws sts get-caller-identity --query Account --output text):cluster/eks-exp
```

README の「実験ログ」に、destroy の所要時間、残骸チェックの結果、Step 2 の陰性対照の結果を書きます。

```bash
git add README.md
git commit -m "20261016_eks_ecr_nlb_iam_terraform: 第2段(可逆性の確認)の実験ログを追記"
```

---

### Task 12: 第 3 段(builder 権限の検証と確定)

**Files:**
- Modify: `20261016_eks_ecr_nlb_iam_terraform/builder/policy.json`(足りない Action を追記)
- Modify: `20261016_eks_ecr_nlb_iam_terraform/README.md`(確定版 JSON、実験ログ)
- Create(gitignore 済): `builder/backend.hcl`、`builder/terraform.tfvars`
- Modify: `~/.aws/config`(プロファイル `builder` を追加)

**Interfaces:**
- Consumes: Task 6 の `builder/`、Task 10〜11 の手順
- Produces: 検証済みの `builder/policy.json`、README の「builder の権限(申請用)」確定版

- [ ] **Step 1: 管理者で builder/ を apply する**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/builder
export AWS_PROFILE=default
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
sed "s/<ACCOUNT_ID>/${ACCOUNT_ID}/" backend.hcl.example > backend.hcl
cat > terraform.tfvars <<EOF
trusted_principals = ["<Task 10 Step 3 の IAM ロール ARN>"]
EOF
terraform init -backend-config=backend.hcl
terraform apply
terraform output -raw builder_role_arn
```
Expected: `arn:aws:iam::<ACCOUNT_ID>:role/tf-builder`。

- [ ] **Step 2: builder プロファイルを足して確認する**

```ini
[profile builder]
role_arn       = arn:aws:iam::<ACCOUNT_ID>:role/tf-builder
source_profile = default
region         = ap-northeast-1
```

Run:
```bash
aws sts get-caller-identity --profile builder --query Arn --output text
```
Expected: `arn:aws:sts::<ACCOUNT_ID>:assumed-role/tf-builder/...`。

- [ ] **Step 3: builder で apply する(AccessDenied の収集)**

Run:
```bash
cd ../terraform
export AWS_PROFILE=builder
terraform init -backend-config=backend.hcl -reconfigure
terraform apply 2>&1 | tee /tmp/claude-1000/-home-kazufusa-src-github-com-kazufusa-til/180bb581-075b-430e-a024-0a949e7fa652/scratchpad/builder-apply-1.log
grep -oE 'not authorized to perform: [a-zA-Z0-9:*-]+' "$_" | sort -u
```
Expected: 理想は `Apply complete!`。AccessDenied が出たら、`not authorized to perform: <service>:<Action>` の一覧が出る。

- [ ] **Step 4: 足りない Action を policy.json に足して再試行**

Step 3 で出た Action を、該当する Sid の `Action` 配列に追加します(IAM 系はリソースを `eks-exp-*` / `app-deployer` に限定したまま)。その後:

```bash
cd ../builder && AWS_PROFILE=default terraform apply
cd ../terraform && AWS_PROFILE=builder terraform apply
```

`Apply complete!` が出るまで Step 3〜4 を繰り返します。IAM の反映に数秒かかるので、同じエラーが続いたら 10 秒待って再実行します。

- [ ] **Step 5: builder で第 1 段の deployer 手順を通す**

Task 10 の Step 8〜11 を、`terraform output` の読み取りを `AWS_PROFILE=builder` で行って繰り返します。deployer 役の操作は `AWS_PROFILE=deployer` のままです。

Expected: curl で `hello from eks-exp`。

- [ ] **Step 6: builder で destroy する**

Run:
```bash
export AWS_PROFILE=builder
aws eks update-kubeconfig --name eks-exp --alias eks-exp-builder
../scripts/preflight-destroy.sh
terraform destroy 2>&1 | tee /tmp/claude-1000/-home-kazufusa-src-github-com-kazufusa-til/180bb581-075b-430e-a024-0a949e7fa652/scratchpad/builder-destroy-1.log
grep -oE 'not authorized to perform: [a-zA-Z0-9:*-]+' "$_" | sort -u
AWS_PROFILE=default ../scripts/check-leftovers.sh
```
Expected: `Destroy complete!`、残骸チェックは `tf-builder` ロールと `tf-builder-policy` だけが `LEFTOVER`(次の Step で消す)。AccessDenied が出たら Step 4 と同じ要領で足し、管理者で残りを destroy してから Step 3 からやり直します。

- [ ] **Step 7: policy.json を確定版として README に転記する**

Run:
```bash
cd ../builder
jq . policy.json > /tmp/claude-1000/-home-kazufusa-src-github-com-kazufusa-til/180bb581-075b-430e-a024-0a949e7fa652/scratchpad/policy-final.json
```

README の「builder の権限(申請用)」を、この JSON のコードブロックと、次の 3 項目の説明に差し替えます。

- このポリシーで作れるもの(VPC、EKS、ECR、NLB、`eks-exp-*` と `app-deployer` の IAM ロール、`app-deployer-policy`)
- 作れないもの(他の名前の IAM ロール・ポリシー、EC2 インスタンスの直接起動、上記以外のサービス)
- 名前の prefix による限定(`eks-exp-*`、`app-deployer`、`tfstate-*-eks-exp`)

実験ログに、Step 3〜6 で追加した Action の一覧と回数を書きます。

- [ ] **Step 8: commit**

```bash
cd /home/kazufusa/src/github.com/kazufusa/til
git add 20261016_eks_ecr_nlb_iam_terraform/builder/policy.json 20261016_eks_ecr_nlb_iam_terraform/README.md
git commit -m "20261016_eks_ecr_nlb_iam_terraform: builder権限をtf-builderロールで検証し確定版をREADMEに記載"
```

---

### Task 13: 第 4 段(deployer の境界確認)と最終片付け

**Files:**
- Modify: `20261016_eks_ecr_nlb_iam_terraform/README.md`(実験ログ、申請文の最終化)

**Interfaces:**
- Consumes: Task 12 で `tf-builder` が残った状態(環境は destroy 済み)
- Produces: 空のアカウント(state バケットも削除)、完成した README

- [ ] **Step 1: builder で環境をもう一度 apply する**

Run:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform/terraform
AWS_PROFILE=builder terraform apply
```
Expected: `Apply complete!`(Task 12 で確定した権限だけで通る)。

- [ ] **Step 2: deployer の境界を確認する(全て拒否されること)**

Run:
```bash
export AWS_PROFILE=deployer
for cmd in \
  "aws ec2 describe-instances" \
  "aws eks list-clusters" \
  "aws ecr create-repository --repository-name other" \
  "aws iam list-roles" \
  "aws elbv2 describe-load-balancers"; do
  echo "== $cmd"
  $cmd 2>&1 | grep -oE 'AccessDenied|UnauthorizedOperation|not authorized' | head -1 || echo "ALLOWED (unexpected)"
done
echo "== allowed: eks describe-cluster"
aws eks describe-cluster --name eks-exp --query cluster.status --output text
```
Expected: 5 つとも `AccessDenied` か `UnauthorizedOperation` か `not authorized`。最後だけ `ACTIVE`。

- [ ] **Step 3: deployer が Kubernetes では全権であることを確認する**

Run:
```bash
aws eks update-kubeconfig --name eks-exp --alias eks-exp-deployer
kubectl auth can-i create namespaces
kubectl auth can-i '*' '*' --all-namespaces
kubectl create namespace scratch && kubectl delete namespace scratch
```
Expected: `yes`、`yes`、namespace の作成と削除が成功。

- [ ] **Step 4: builder で destroy し、残骸チェックを通す**

Run:
```bash
export AWS_PROFILE=builder
aws eks update-kubeconfig --name eks-exp --alias eks-exp-builder
../scripts/preflight-destroy.sh
terraform destroy
cd ../builder && AWS_PROFILE=default terraform destroy
cd .. && AWS_PROFILE=default scripts/check-leftovers.sh
```
Expected: 2 回とも `Destroy complete!`、`RESULT: clean`。

- [ ] **Step 5: state バケットを消す**

Run:
```bash
AWS_PROFILE=default scripts/delete-state-bucket.sh
aws s3 ls --profile default | grep -c tfstate || echo "no state bucket"
```
Expected: `deleted bucket: tfstate-<ACCOUNT_ID>-eks-exp`、`no state bucket`。

- [ ] **Step 6: kubeconfig と AWS プロファイルの後始末**

Run:
```bash
kubectl config delete-context eks-exp-builder
kubectl config delete-context eks-exp-deployer
kubectl config delete-cluster arn:aws:eks:ap-northeast-1:$(aws sts get-caller-identity --query Account --output text):cluster/eks-exp
```

`~/.aws/config` の `[profile builder]` と `[profile deployer]` は、再実験に備えて残します(README に「不要なら手で消す」と記載)。

- [ ] **Step 7: README を完成させる**

次を書き加えます。

- 実験ログ: 第 4 段の結果(Step 2〜3 の出力)、最終 destroy とバケット削除の結果
- 申請文のたたき台: 依頼 1(`scripts/create-state-bucket.sh` を実行してバケット名を教えてほしい)、依頼 2(確定版 JSON を自分に付与してほしい。直接付与でもスイッチロール先のロール新設でもよい)、範囲の説明、期間と撤去
- deployer への引き渡し文: `deployer_role_arn` と手順(deployer)の節への案内

文書規約の確認:
```bash
cd 20261016_eks_ecr_nlb_iam_terraform
grep -nE '\*\*[^*]+\*\*' README.md || echo "no bold"
grep -nE '(可能です|提供します|が求められます|において|に関して)' README.md || echo "no banned phrases"
```
Expected: `no bold`、`no banned phrases`。

- [ ] **Step 8: commit と push**

```bash
cd /home/kazufusa/src/github.com/kazufusa/til
git add 20261016_eks_ecr_nlb_iam_terraform/README.md
git commit -m "20261016_eks_ecr_nlb_iam_terraform: 第4段(deployer境界確認)と最終片付けの実験ログ、申請文を完成"
git push origin main
```
