#!/bin/sh

set -Ceux


if [ 0 -eq `docker images | grep fortran-build | wc -l` ]; then
cat << EOS | docker build -t fortran-build -
FROM ubuntu:latest
RUN sed -i.bak -e "s%http://archive.ubuntu.com/ubuntu/%http://ftp.iij.ad.jp/pub/linux/ubuntu/archive/%g" /etc/apt/sources.list \
 && apt-get update && apt-get install -y \
    gfortran \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*
EOS
fi

docker run \
  --name heavytask \
  --rm \
  -v "$PWD":/usr/src/myapp \
  -w /usr/src/myapp \
  fortran-build \
  sh -x -c "\
    gfortran -fopenmp main.f90 -o main \
    && OMP_NUM_THREADS=3 ./main \
    "

rm -rf ./main
