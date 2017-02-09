#!/bin/sh

set -Ceux

if [ 0 -eq `docker images | grep latex | wc -l` ]; then
cat << EOS | docker build -t latex -
FROM ubuntu:latest
RUN sed -i.bak -e "s%http://archive.ubuntu.com/ubuntu/%http://ftp.iij.ad.jp/pub/linux/ubuntu/archive/%g" /etc/apt/sources.list \
 && apt-get update && apt-get install -y \
    texlive-lang-japanese \
    texlive-lang-cjk \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    xdvik-ja \
    dvipsk-ja \
    gv \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*
EOS
fi

docker run \
  --rm \
  -v "$PWD":/usr/src/myapp \
  -w /usr/src/myapp \
  latex \
  sh -x -c "uplatex test.tex && dvipdfmx test"
