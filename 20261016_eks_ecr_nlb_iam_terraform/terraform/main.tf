provider "aws" {
  region              = var.region
  profile             = var.aws_profile
  allowed_account_ids = var.allowed_account_ids

  default_tags {
    tags = {
      Project = var.cluster_name
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
