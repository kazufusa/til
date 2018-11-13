#!/bin/sh
set -Ceux

docker stop cron_test || :
docker rm cron_test || :
docker rmi cron_test || :

if [ 0 -eq `docker images | grep cron_test | wc -l` ]; then
docker build -t cron_test .
fi

docker create \
  --name cron_test \
  -v "$PWD":/usr/src/myapp \
  -w /usr/src/myapp \
  cron_test
docker start cron_test
docker exec -it cron_test tail -F /tmp/crontest.txt
