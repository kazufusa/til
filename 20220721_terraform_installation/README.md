# Terraformコマンドのインストール

docker使うと楽.

```sh
$ docker run --rm -it --env-file ./.env --mount type=bind,source="$(pwd)",target=/work -w /work hashicorp/terraform:latest --version
Terraform v1.2.5
on linux_amd64
```
