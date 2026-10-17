# バケット名はアカウント ID を含むので init の引数で渡す:
#   terraform init -backend-config="bucket=tfstate-$(aws sts get-caller-identity --query Account --output text)-eks-exp"
terraform {
  backend "s3" {
    key          = "terraform/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
  }
}
