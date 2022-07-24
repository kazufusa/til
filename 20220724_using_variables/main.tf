resource "local_file" "sample_res" {
  filename = var.filename
  content  = "I love Terraform"
}
