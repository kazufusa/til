variable "access_key" {}

variable "secret_key" {}

provider "aws" {
  region  = "ap-northeast-1"
  access_key = var.access_key
  secret_key = var.secret_key
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"

  tags = {
    Name = "main"
  }
}
