resource "local_sensitive_file" "sample_res" {
  filename = "sample_args.txt"
  content = "I Love Terraform"
  file_permission =  "0700"
}
