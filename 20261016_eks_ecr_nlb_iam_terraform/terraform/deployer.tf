# terraform/deployer.tf
# deployer ロールは管理者が事前に作る(ECR push や eks:DescribeCluster などの IAM 権限もそちら)。
# terraform は EKS 側の権限(access entry と access policy)だけを付ける
data "aws_iam_role" "deployer" {
  name = "${var.cluster_name}-deployer"
}

resource "aws_eks_access_entry" "deployer" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = data.aws_iam_role.deployer.arn
  type          = "STANDARD"

  kubernetes_groups = ["${var.cluster_name}-deployers"]
}

# namespace 内は admin(Role/RoleBinding も作れる。ResourceQuota と namespace 自体は変更不可)
resource "aws_eks_access_policy_association" "deployer" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = data.aws_iam_role.deployer.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy"

  access_scope {
    type       = "namespace"
    namespaces = var.deployer_namespaces
  }

  depends_on = [aws_eks_access_entry.deployer]
}

# クラスタ全体の読み取り専用。ノードや他 namespace の Pod の状態を見て Pending の原因を追えるようにする。Secret の参照は含まれない
resource "aws_eks_access_policy_association" "deployer_view" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = data.aws_iam_role.deployer.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.deployer]
}
