#!/bin/bash
docker run \
  --rm \
  --name test \
  -v "$PWD":/usr/work \
  -w /usr/work \
  ubuntu:latest \
  /bin/bash -c "./R.bash"
