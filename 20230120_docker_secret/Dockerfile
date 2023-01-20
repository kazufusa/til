FROM alpine

COPY .env .env

RUN --mount=type=secret,id=SOME_KEY \
  export SOME_KEY=$(cat /run/secrets/SOME_KEY) && \
  echo "SOME_KEY=${SOME_KEY}" >> .env

RUN cat .env
