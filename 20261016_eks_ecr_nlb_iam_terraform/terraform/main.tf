provider "aws" {
  region  = var.region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project = var.cluster_name
    }
  }
}

data "aws_caller_identity" "current" {}

# 実行者が assumed-role セッションなら、その IAM ロールの ARN を issuer_arn で得る
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

  # 空なら実行者自身のロールを信頼する(実験で自分が deployer 役を兼ねるため)
  deployer_trusted_principals = (
    length(var.deployer_trusted_principals) > 0
    ? var.deployer_trusted_principals
    : [data.aws_iam_session_context.current.issuer_arn]
  )
}

# builder はクラスタ作成者として cluster-admin を持つので、そのまま namespace を作れる
provider "kubernetes" {
  host                   = aws_eks_cluster.main.endpoint
  cluster_ca_certificate = base64decode(aws_eks_cluster.main.certificate_authority[0].data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args = concat(
      ["eks", "get-token", "--cluster-name", aws_eks_cluster.main.name, "--region", var.region],
      var.aws_profile == null ? [] : ["--profile", var.aws_profile],
    )
  }
}
