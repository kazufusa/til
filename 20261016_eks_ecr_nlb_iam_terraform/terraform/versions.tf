terraform {
  required_version = ">= 1.11" # S3 backend の use_lockfile が正式機能になった版

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.35"
    }
  }
}
