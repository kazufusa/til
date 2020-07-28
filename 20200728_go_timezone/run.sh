#!/bin/sh
set -Ceux

docker run --rm -it -w /app -v $PWD:/app golang:1.15-rc-alpine sh -c \
  "GOOS=linux GOARCH=amd64 go build -o jst ./unknown_timezone.go"
docker run --rm -it -w /app -v $PWD:/app alpine ./jst || :

docker run --rm -it -w /app -v $PWD:/app golang:1.15-rc-alpine sh -c \
  "GOOS=linux GOARCH=amd64 go build -o jst ./tzdata_example.go"
docker run --rm -it -w /app -v $PWD:/app alpine ./jst || :
