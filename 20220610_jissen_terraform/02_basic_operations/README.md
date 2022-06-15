#!/bin/sh

```sh
$ docker run --rm --env-file ./.env --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:1.2.2 init

docker run --rm --env-file ./.env --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:1.2.2 plan

$ docker run --rm --env-file ./.env --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:1.2.2 apply
...
aws_instance.example: Creating...
aws_instance.example: Still creating... [10s elapsed]
aws_instance.example: Creation complete after 13s [id=i-0a9278404ba915805]

Apply complete! Resources: 1 added, 0 changed, 0 destroyed.

$ aws ec2 describe-instances --profile jissen --query "Reservations[].Instances[].InstanceId"
[
    "i-0a9278404ba915805"
]

$ docker run --rm -it --env-file ./.env --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:1.2.2 apply
...

$ aws ec2 describe-instances --profile jissen --query "Reservations[].Instances[].Tags"
[
    [
        {
            "Key": "Name",
            "Value": "example"
        }
    ]
]

$ $ docker run --rm -it --env-file ./.env --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:1.2.2 destroy
```
