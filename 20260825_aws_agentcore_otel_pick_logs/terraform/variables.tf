variable "region" {
  description = "デプロイ先リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "prefix" {
  description = "リソース名のprefix"
  type        = string
  default     = "agentcore-otel-til"
}

variable "spans_log_group" {
  description = "Transaction Searchのスパン保存先ロググループ"
  type        = string
  default     = "aws/spans"
}

variable "runtime_log_group" {
  description = "AgentCore Runtimeのロググループ(agentcore launchが作る)"
  type        = string
  default     = "/aws/bedrock-agentcore/runtimes/agentcore_otel_til-25kLRAG8Io-DEFAULT"
}
