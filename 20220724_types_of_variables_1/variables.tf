variable "filename1" {
  type    = string
  default = "sample1.txt"
}

# variable "content1" {
#   type    = string
#   default = "I am loving Terraform"
# }
#
# variable "content1" {
#   type    = number
#   default = 23
# }
#
# variable "content1" {
#   type    = bool
#   default = true
# }
#
# variable "content1" {
#   type    = list(string)
#   default = ["red", "blue", "green"]
# }
#
# variable "content1" {
#   type    = tuple([string, bool, number])
#   default = ["red", true, 23]
# }

variable "content1" {
  type    = map(any)
  default = { name = "Ankit", age = 32 }
}
