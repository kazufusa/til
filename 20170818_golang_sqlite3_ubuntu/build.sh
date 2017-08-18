#!/bin/sh

set -Ceux

if [ 0 -eq `docker images | grep go-build | wc -l` ]; then
cat << EOS | docker build -t go-build -
FROM ubuntu:latest
RUN sed -i.bak -e "s%http://archive.ubuntu.com/ubuntu/%http://ftp.iij.ad.jp/pub/linux/ubuntu/archive/%g" /etc/apt/sources.list \
 && apt-get update && apt-get install -y \
    wget \
    gcc-multilib \
    gcc-mingw-w64 \
    git \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*
RUN wget https://storage.googleapis.com/golang/go1.8.3.linux-amd64.tar.gz
RUN tar -C /usr/local -xzf go1.8.3.linux-amd64.tar.gz
ENV PATH $PATH:/usr/local/go/bin
RUN go get -v github.com/mattn/go-sqlite3
EOS
fi

docker run \
  --name run \
  --rm \
  -v "$PWD":/usr/src/myapp \
  -w /usr/src/myapp \
  go-build \
  sh -x -c "\
    env CGO_ENABLED=1 GOOS=windows GOARCH=amd64 CC=x86_64-w64-mingw32-gcc go build -v -o sample.exe ;\
    go build -v -o sample ;\
    ./sample ;\
    "
