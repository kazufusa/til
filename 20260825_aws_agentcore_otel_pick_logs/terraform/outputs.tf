output "otel_dump_bucket" {
  description = "NG時jsonlの保存先バケット名"
  value       = aws_s3_bucket.otel_dumps.bucket
}

output "code_bucket" {
  description = "agentcore configure --s3へ渡すコードzip置き場バケット名"
  value       = aws_s3_bucket.code_artifacts.bucket
}

output "runtime_role_arn" {
  description = "agentcore configureへ渡す実行ロールARN"
  value       = aws_iam_role.runtime.arn
}

output "cw_dump_bucket" {
  description = "CloudWatch復元経路のjsonl保存先バケット名"
  value       = aws_s3_bucket.cw_dumps.bucket
}

output "region" {
  value = var.region
}
