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
