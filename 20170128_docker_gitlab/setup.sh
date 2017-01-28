#!/bin/sh
set -Ceux

wget https://raw.githubusercontent.com/sameersbn/docker-gitlab/master/docker-compose.yml
# [ "$(uname)" == 'Darwin' ] && patch -u < osx.patch
docker-compose up -d
