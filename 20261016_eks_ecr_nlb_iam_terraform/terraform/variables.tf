variable "region" {
  description = "AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "cluster_name" {
  description = "EKS クラスタ名。IAM ロールなどの名前の接頭辞にも使う"
  type        = string
  default     = "eks-exp"

  validation {
    condition     = length(var.cluster_name) <= 20 && can(regex("^[a-z][a-z0-9-]*[a-z0-9]$", var.cluster_name))
    error_message = "cluster_name は 2 から 20 文字の英小文字、数字、ハイフンで、先頭は英小文字、末尾は英小文字か数字にしてください。NLB の名前は 32 文字までなので、接尾辞(-nodeport など)を足しても収まる長さにしています。"
  }
}

variable "node_count" {
  description = "managed node group の desired サイズ"
  type        = number
  default     = 1

  validation {
    condition     = var.node_count >= 1 && var.node_count <= 3
    error_message = "node_count は 1 から 3 の範囲にしてください。"
  }
}

variable "ecr_repository_names" {
  description = "ECR リポジトリ名の一覧。先頭の 1 つが ecr_repository_url になる"
  type        = list(string)
  default     = ["app"]

  validation {
    condition     = length(var.ecr_repository_names) >= 1
    error_message = "ecr_repository_names は 1 つ以上必要です。"
  }
}

variable "deployer_namespaces" {
  description = "deployer が admin 権限を持つ namespace。terraform がこの namespace と ResourceQuota を作る"
  type        = list(string)
  default     = ["app"]

  validation {
    condition     = length(var.deployer_namespaces) >= 1
    error_message = "deployer_namespaces は 1 つ以上必要です。"
  }
}

variable "aws_profile" {
  description = "AWS CLI プロファイル名。null なら環境の既定を使う。実験で builder を指定するために使う"
  type        = string
  default     = null
}

variable "enable_log_shipping" {
  description = "Pod のログを CloudWatch Logs に転送するか"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch Logs の保存日数"
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90], var.log_retention_days)
    error_message = "log_retention_days は 1, 3, 5, 7, 14, 30, 60, 90 のいずれかにしてください。"
  }
}

variable "allowed_account_ids" {
  description = "構築を許可するアカウント ID。空なら制限しない。移植先では ID を直書きして、別のアカウントでは止まるようにする"
  type        = list(string)
  default     = []
}

variable "endpoint_public_access_cidrs" {
  description = "EKS の API サーバーに公開エンドポイント経由で接続できる CIDR。既定は全アドレス。移植先では社内の IP に絞る"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "deployer_role_arns" {
  description = "アプリ開発者の個人ロールの ARN。terraform がこのロールに EKS の Access Entry を作る(IAM のポリシーは管理者が attach-deployer-policy.sh で付ける)。移植先ではここに書いて commit する。SSO のロールはパス(aws-reserved/sso.amazonaws.com/<リージョン>/)を除いた ARN を書く"
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for arn in var.deployer_role_arns :
      can(regex("^arn:aws:iam::[0-9]{12}:role/[^/]+$", arn))
    ])
    error_message = "各要素は arn:aws:iam::<account>:role/<ロール名> の形式にしてください(パスは付けない)。"
  }
}
