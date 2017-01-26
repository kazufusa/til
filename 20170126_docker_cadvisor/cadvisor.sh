#!/bin/sh

set -Ceux

docker run \
  --rm \
  --volume=/:/rootfs:ro \
  --volume=/var/run:/var/run:rw \
  --volume=/sys:/sys:ro \
  --volume=/var/lib/docker/:/var/lib/docker:ro \
  --publish=8080:8080 \
  --name=cadvisor \
  google/cadvisor:latest
