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
