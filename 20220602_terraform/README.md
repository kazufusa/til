# Terraform hands-on

```sh
$ docker run --rm hashicorp/terraform:1.2.2 --version
Unable to find image 'hashicorp/terraform:1.2.2' locally
1.2.2: Pulling from hashicorp/terraform
2408cc74d12b: Pull complete
2e1a85f9480e: Pull complete
5012ae4dce4a: Pull complete
Digest: sha256:02214c4408e9af68e4a3b886eb423ec6330718f9f73a2d6abb460cf8a35c3108
Status: Downloaded newer image for hashicorp/terraform:1.2.2
Terraform v1.2.2
on linux_amd64

$ docker run --rm --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:1.2.2 fmt
main.tf

$ docker run --rm --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:1.2.2 init

Initializing the backend...

Initializing provider plugins...
- Reusing previous version of hashicorp/aws from the dependency lock file
- Using previously-installed hashicorp/aws v2.67.0

Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.

$ docker run --rm --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:1.2.2 plan --var-file=aws.tfvars

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # aws_vpc.main will be created
  + resource "aws_vpc" "main" {
      + arn                              = (known after apply)
      + assign_generated_ipv6_cidr_block = false
      + cidr_block                       = "10.0.0.0/16"
      + default_network_acl_id           = (known after apply)
      + default_route_table_id           = (known after apply)
      + default_security_group_id        = (known after apply)
      + dhcp_options_id                  = (known after apply)
      + enable_classiclink               = (known after apply)
      + enable_classiclink_dns_support   = (known after apply)
      + enable_dns_hostnames             = (known after apply)
      + enable_dns_support               = true
      + id                               = (known after apply)
      + instance_tenancy                 = "default"
      + ipv6_association_id              = (known after apply)
      + ipv6_cidr_block                  = (known after apply)
      + main_route_table_id              = (known after apply)
      + owner_id                         = (known after apply)
      + tags                             = {
          + "Name" = "main"
        }
    }

Plan: 1 to add, 0 to change, 0 to destroy.

─────────────────────────────────────────────────────────────────────────────

Note: You didn't use the -out option to save this plan, so Terraform can't
guarantee to take exactly these actions if you run "terraform apply" now.

$ docker run --rm --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:1.2.2 apply -auto-approve --var-file=aws.tfvars

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # aws_vpc.main will be created
  + resource "aws_vpc" "main" {
      + arn                              = (known after apply)
      + assign_generated_ipv6_cidr_block = false
      + cidr_block                       = "10.0.0.0/16"
      + default_network_acl_id           = (known after apply)
      + default_route_table_id           = (known after apply)
      + default_security_group_id        = (known after apply)
      + dhcp_options_id                  = (known after apply)
      + enable_classiclink               = (known after apply)
      + enable_classiclink_dns_support   = (known after apply)
      + enable_dns_hostnames             = (known after apply)
      + enable_dns_support               = true
      + id                               = (known after apply)
      + instance_tenancy                 = "default"
      + ipv6_association_id              = (known after apply)
      + ipv6_cidr_block                  = (known after apply)
      + main_route_table_id              = (known after apply)
      + owner_id                         = (known after apply)
      + tags                             = {
          + "Name" = "main"
        }
    }

Plan: 1 to add, 0 to change, 0 to destroy.
aws_vpc.main: Creating...
aws_vpc.main: Creation complete after 3s [id=vpc-06f7de1fd44a5c740]

Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
```

