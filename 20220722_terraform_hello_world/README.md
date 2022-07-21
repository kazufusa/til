# Hello Terraform

```sh
❯ docker run --rm -it --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:latest init

Initializing the backend...

Initializing provider plugins...
- Finding latest version of hashicorp/local...
- Installing hashicorp/local v2.2.3...
- Installed hashicorp/local v2.2.3 (signed by HashiCorp)

Terraform has created a lock file .terraform.lock.hcl to record the provider
selections it made above. Include this file in your version control repository
so that Terraform can guarantee to make the same selections by default when
you run "terraform init" in the future.

Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.


❯ docker run --rm -it --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:latest plan

Terraform used the selected providers to generate the following execution plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # local_file.sample_res will be created
  + resource "local_file" "sample_res" {
      + content              = "I Love Terraform"
      + directory_permission = "0777"
      + file_permission      = "0777"
      + filename             = "sample.txt"
      + id                   = (known after apply)
    }

Plan: 1 to add, 0 to change, 0 to destroy.

─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Note: You didn't use the -out option to save this plan, so Terraform can't guarantee to take exactly these actions if you run "terraform apply" now.

❯ docker run --rm -it --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:latest apply

Terraform used the selected providers to generate the following execution plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # local_file.sample_res will be created
  + resource "local_file" "sample_res" {
      + content              = "I Love Terraform"
      + directory_permission = "0777"
      + file_permission      = "0777"
      + filename             = "sample.txt"
      + id                   = (known after apply)
    }

Plan: 1 to add, 0 to change, 0 to destroy.

Do you want to perform these actions?
  Terraform will perform the actions described above.
  Only 'yes' will be accepted to approve.

  Enter a value: yes

local_file.sample_res: Creating...
local_file.sample_res: Creation complete after 0s [id=dee17a7fff03d081884253c9c46ae1d5beeaa36a]

Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
```
