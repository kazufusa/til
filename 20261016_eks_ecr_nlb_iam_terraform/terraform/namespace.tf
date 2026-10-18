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
      "services.loadbalancers" = "0"
      "persistentvolumeclaims" = "0"
    }
  }
}

# deployer がノードの状態を見られるようにする。AmazonEKSViewPolicy は namespace 内の資源だけで、
# クラスタ直下の nodes を含まないため、読み取り専用の ClusterRole を別に用意する。
resource "kubernetes_cluster_role" "node_viewer" {
  metadata {
    name = "node-viewer"
  }

  rule {
    api_groups = [""]
    resources  = ["nodes"]
    verbs      = ["get", "list", "watch"]
  }

  depends_on = [aws_eks_node_group.main]
}

resource "kubernetes_cluster_role_binding" "deployer_node_viewer" {
  metadata {
    name = "${var.cluster_name}-deployers-node-viewer"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role.node_viewer.metadata[0].name
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = "${var.cluster_name}-deployers"
  }
}
