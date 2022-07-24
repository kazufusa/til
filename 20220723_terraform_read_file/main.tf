data "local_file" "name" {
  filename = "sample1.txt"
}

output "name1" {
  value = data.local_file.name.content
}
