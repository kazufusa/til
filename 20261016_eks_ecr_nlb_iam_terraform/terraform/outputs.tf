# terraform/outputs.tf
output "region" {
  value = var.region
}

output "cluster_name" {
  value = aws_eks_cluster.main.name
}

output "nlb_dns_name" {
  description = "外部公開 URL のホスト名。http://<この値>/ でアクセスする"
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "deployer_role_arn" {
  description = "deployer に渡すスイッチロール先"
  value       = aws_iam_role.deployer.arn
}

output "node_port" {
  description = "deployer の Service が使う nodePort"
  value       = local.node_port
}

output "deployer_namespaces" {
  description = "deployer が edit 権限を持つ namespace"
  value       = var.deployer_namespaces
}

output "nat_public_ip" {
  description = "Pod の外向き通信の送信元 IP(通信先の許可リスト用)"
  value       = aws_eip.nat.public_ip
}

output "deployer_trusted_principals" {
  description = "app-deployer にスイッチできる principal(空指定なら実行者の帽子)"
  value       = local.deployer_trusted_principals
}
