#!/bin/sh

set -eux
docker run \
  --rm --name go-build \
  -v "$PWD":/usr/src/myapp \
  -w /usr/src/myapp golang:latest \
  sh -c "\
    apt-get update; \
    apt-get install -y gcc-multilib gcc-mingw-w64; \
    go get -v github.com/mattn/go-sqlite3; \
    env CGO_ENABLED=1 GOOS=windows GOARCH=amd64 CC=x86_64-w64-mingw32-gcc go build -v -o sample.exe"
