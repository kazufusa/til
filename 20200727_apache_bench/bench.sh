#!/bin/sh

set -Ceux

NAME=ab
HOST=`ip route get 8.8.8.8 | head -n 1 | awk '{print $7}'`

if [ 0 -eq `docker images | grep ${NAME} | wc -l` ]; then
cat << EOS | docker build -t ${NAME} -
FROM alpine
RUN apk --no-cache add apache2-utils
ENTRYPOINT ["/usr/bin/ab"]
EOS
fi

docker run --rm --network host ${NAME} -n 1000 -c 100 http://${HOST}:8080/
