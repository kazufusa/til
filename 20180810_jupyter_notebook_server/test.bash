#!/bin/bash
set -eux

docker build -t jupyter-test ./
docker run \
  --rm --name jupyter-build \
  -v "$PWD":/usr/work \
  -w /usr/work \
  -p 8888:8888 \
  jupyter-test

# docker run \
#   --rm --name go-build \
#   -v "$PWD":/usr/src/myapp \
#   -w /usr/src/myapp \
#   golang:latest \
#   sh -x -c "\
#     apt-get update; \
#     apt-get install -y libgdal-dev; \
#     curl -ks 'https://gist.githubusercontent.com/nicerobot/5160658/raw/install-gdalpc.sh' | bash -; \
#     apt-get install -y gcc-mingw-w64; \
#     pkg-config gdal --cflags; \
#     go build -v -o sample && \
#     env CGO_ENABLED=1 GOOS=windows GOARCH=amd64 CC=x86_64-w64-mingw32-gcc go build -v -o sample.exe"


# docker run \
#   --rm --name go-build \
#   -v "$PWD":/usr/src/myapp \
#   -w /usr/src/myapp \
#   go-build \
#   sh -x -c "\
#     env CGO_ENABLED=1 GOOS=windows GOARCH=amd64 CC=x86_64-w64-mingw32-gcc go build -x -o sample.exe; \
#     "
#
#
# gcc gdaltest.c -static $(pkg-config gdal --cflags --libs)
#
# docker run \
#   --rm --name go-build \
#   -v "$PWD":/usr/src/myapp \
#   -w /usr/src/myapp \
#   go-build \
#   sh -x -c "\
#     x86_64-w64-mingw32-gcc ./gdaltest.c -o gdaltest.exe -static -Bstatic \
#     -I ./release-1800-x64-gdal-1-11-4-mapserver-6-4-3-libs/include \
#     -L ./release-1800-x64-gdal-1-11-4-mapserver-6-4-3-libs/lib/ -lgdal_i \
#     "
#
