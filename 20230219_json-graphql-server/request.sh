#!/bin/sh
set -Ceu

curl 'http://localhost:3000/' \
  -H 'Content-Type: application/json' \
  -s \
  -d '{"query":"query {  Post(id:1){id User { id name}}}"}' \
  | jq .
