# Use Variables

## 1. variable blok

```terraform
variable filename {
  type    = string
  default = "sample.txt"
}
```

## 2. empty variable block

```terraform
variable filename {} # `terraform apply` will ask
```

## 2.1. and Enter value

```sh
$ terraform apply
var.filename
  Enter a value: 
```

## 2.2. and provide value from cli

```sh
$ terraform apply -var "filename=sample.txt"
```

## 2.3. and provide value from environment variable

```sh
$ export TF_VAR_filename=sample.txt terraform apply
```

## 2.4. and provide value from tfvars

which variable will load first?

1. environment variable
2. terraform.tfvars
3. terraform.tfvars.json
4. *.auto.tfvars
5. *.auto.tfvars.json
6. `-var`
