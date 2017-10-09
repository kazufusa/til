#!/bin/sh
# create and start postgis server (the first time)
# $sh ./start_db.sh

# stop postgis server (the first time)
# CTRL-C

# restart postgis server (the second and subsequent times)
# $ docker start postgis_calcgreen

# stop postgis server (the second and subsequent times)
# $ docker stop postgis_calcgreen

# remove postgis server
# $ docker rm -v postgis_calcgreen

set -Ceux

docker images | grep -q postgis_calcgreen || docker build --no-cache -t postgis_calcgreen .

docker run \
  -e POSTGRES_DB=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -v "$PWD":/usr/src/myapp \
  -w /usr/src/myapp \
  --name postgis_calcgreen \
  -p 5432:5432 \
  postgis_calcgreen

