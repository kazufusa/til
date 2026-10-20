# terraform/logging.tf
# ログ転送: 全 Pod の標準出力などを CloudWatch Logs に送る
locals {
  log_group_kinds = var.enable_log_shipping ? toset(["application", "dataplane", "host", "performance"]) : toset([])
}

# アドオンに任せると terraform の管理外で作られて destroy で残るため、保存期間つきで先に作る
resource "aws_cloudwatch_log_group" "insights" {
  for_each = local.log_group_kinds

  name              = "/aws/containerinsights/${var.cluster_name}/${each.value}"
  retention_in_days = var.log_retention_days
}

# AWS 公式アドオン。全 Pod の標準出力を CloudWatch Logs の /aws/containerinsights/<cluster>/application に送る。
# メトリクス(Container Insights)も有効になり、少額の課金がある
resource "aws_eks_addon" "cloudwatch" {
  count = var.enable_log_shipping ? 1 : 0

  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "amazon-cloudwatch-observability"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  # 既定では Application Signals の Auto-monitor が Service を持つ Pod に計測エージェントを差し込む。
  # アプリの挙動が変わり課金も増えるので、ログ転送だけにする
  configuration_values = jsonencode({
    manager = {
      applicationSignals = {
        autoMonitor = {
          monitorAllServices = false
        }
      }
    }
  })

  depends_on = [
    aws_eks_node_group.main,
    aws_cloudwatch_log_group.insights,
  ]
}
