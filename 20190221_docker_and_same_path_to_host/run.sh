#!/bin/sh
set -Ceux

rm -rf hello-world*

echo "Hello world" > hello-world.txt
ln -s $PWD/hello-world.txt hello-world.txt.link
cat hello-world.txt.link

docker run -v ${PWD}:${PWD} -w ${PWD} python:latest bash -c "pwd"
docker run -v ${PWD}:${PWD} -w ${PWD} python:latest bash -c "ls -lht"
docker run -v ${PWD}:${PWD} -w ${PWD} python:latest bash -c "cat hello-world.txt.link"

rm -rf hello-world*
