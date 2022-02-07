#!/bin/sh
set -Ceux

export DOCKER_BUILDKIT=1

for from in alpine distroless; do
  echo ${from}
  docker image build -f Dockerfile.${from} -t hello/${from} .
  docker run --rm -t hello/${from}
  docker images hello/${from} --format "{{.Size}}"
done
