# terraform/deployer.tf
# アプリ開発者(deployer)は、自分の個人ロールのまま作業する。スイッチ先のロールは作らない。
# IAM 側の権限(<cluster_name>-deployer-policy)は管理者が attach-deployer-policy.sh で個人ロールに付ける。
# terraform は EKS 側の権限(access entry と access policy)だけを、開発者ごとに作る。
# 開発者の追加と削除は、variables.tf の deployer_role_arns を変えて apply する
resource "aws_eks_access_entry" "deployer" {
  for_each = toset(var.deployer_role_arns)

  cluster_name  = aws_eks_cluster.main.name
  principal_arn = each.value
  type          = "STANDARD"

  kubernetes_groups = ["${var.cluster_name}-deployers"]
}

# namespace 内は admin(Role/RoleBinding も作れる。ResourceQuota と namespace 自体は変更不可)
resource "aws_eks_access_policy_association" "deployer" {
  for_each = toset(var.deployer_role_arns)

  cluster_name  = aws_eks_cluster.main.name
  principal_arn = each.value
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy"

  access_scope {
    type       = "namespace"
    namespaces = var.deployer_namespaces
  }

  depends_on = [aws_eks_access_entry.deployer]
}

# クラスタ全体の読み取り専用。ノードや他 namespace の Pod の状態を見て Pending の原因を追えるようにする。Secret の参照は含まれない
resource "aws_eks_access_policy_association" "deployer_view" {
  for_each = toset(var.deployer_role_arns)

  cluster_name  = aws_eks_cluster.main.name
  principal_arn = each.value
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.deployer]
}
