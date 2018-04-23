#!/bin/sh
set -Ceux

docker stop ssl-test || :
docker rm ssl-test || :
docker rmi ssl-test || :
docker build -t ssl-test server

docker run -p 8443:443 -p 8080:80 -v $PWD:/log --rm --name ssl-test ssl-test
