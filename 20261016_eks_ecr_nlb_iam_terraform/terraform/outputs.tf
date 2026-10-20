# terraform/outputs.tf
output "region" {
  value = var.region
}

output "cluster_name" {
  value = aws_eks_cluster.main.name
}

output "nlb_dns_name" {
  description = "CloudFront のオリジン。外から直接は届きません"
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  description = "先頭のリポジトリの URL"
  value       = aws_ecr_repository.app[var.ecr_repository_names[0]].repository_url
}

output "ecr_repository_urls" {
  description = "リポジトリ名から URL への対応"
  value       = { for name, r in aws_ecr_repository.app : name => r.repository_url }
}

output "deployer_role_arn" {
  description = "deployer に渡すスイッチロール先"
  value       = data.aws_iam_role.deployer.arn
}

output "node_port" {
  description = "deployer の Service が使う nodePort"
  value       = local.node_port
}

output "deployer_namespaces" {
  description = "deployer が admin 権限を持つ namespace"
  value       = var.deployer_namespaces
}

output "nat_public_ip" {
  description = "Pod の外向き通信の送信元 IP(通信先の許可リスト用)"
  value       = aws_eip.nat.public_ip
}

output "https_url" {
  description = "HTTPS の公開 URL(CloudFront の既定ドメイン)"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}/"
}

output "log_group_application" {
  description = "全 Pod の標準出力が入る CloudWatch Logs のロググループ。転送を止めていれば null"
  value       = var.enable_log_shipping ? aws_cloudwatch_log_group.insights["application"].name : null
}
