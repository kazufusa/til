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
  # 東京の apne1-az3 は CloudFront の VPC origin に対応していない。
  # AZ 名と ID の対応はアカウントごとに違うので、ID で除いてから先頭 2 つを選ぶ
  exclude_zone_ids = ["apne1-az3"]

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  name_prefix = var.cluster_name
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)
}

# builder はクラスタ作成者として cluster-admin を持つので、そのまま namespace を作れる。
# API サーバーはプライベートエンドポイントだけなので、手元のトンネル(scripts/eks-tunnel.sh)を通して接続する。
# 証明書はエンドポイントのホスト名で検証する
provider "kubernetes" {
  host                   = "https://127.0.0.1:${var.api_tunnel_port}"
  tls_server_name        = trimprefix(aws_eks_cluster.main.endpoint, "https://")
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
