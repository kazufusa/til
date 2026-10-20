# terraform/eks.tf
# IAM ロールは管理者が事前に作る。terraform は名前で参照するだけで、作成も変更もしない
data "aws_iam_role" "cluster" {
  name = "${var.cluster_name}-cluster"
}

data "aws_iam_role" "node" {
  name = "${var.cluster_name}-node"
}

resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  role_arn = data.aws_iam_role.cluster.arn

  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true
  }

  vpc_config {
    subnet_ids              = aws_subnet.private[*].id
    endpoint_public_access  = true
    endpoint_private_access = true
    public_access_cidrs     = var.endpoint_public_access_cidrs
  }

  # CloudWatch ロググループを残さないため、コントロールプレーンログは有効にしない
  enabled_cluster_log_types = []
}

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${local.name_prefix}-ng"
  node_role_arn   = data.aws_iam_role.node.arn
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

  # ノードはNAT経由の出口がないと起動に失敗するため、
  # privateルートテーブルの関連付けが済んでから作成する
  depends_on = [aws_route_table_association.private]
}
