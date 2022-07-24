resource "random_integer" "num" {
  min = 10
  max = 160

  lifecycle {
    # create_before_destroy = true
    # prevent_destroy = true
    ignore_changes = [min]
  }
}
