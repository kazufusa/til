# terraform/ecr.tf
resource "aws_ecr_repository" "app" {
  name                 = var.ecr_repository_name
  image_tag_mutability = "MUTABLE"
  # destroy 時に image が残っていても消せるようにする
  force_delete = true

  image_scanning_configuration {
    scan_on_push = false
  }
}
