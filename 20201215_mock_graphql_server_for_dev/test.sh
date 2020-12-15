#!/bin/sh
# exec `node_modules/.bin/json-graphql-server db.js` in another terminal

set -Ceux

curl http://localhost:3000 -s -X POST \
  -H "Content-Type: application/json" \
  -d '{ "query": "{ Post(id: 1) { title views user_id} }" }' | jq .

curl http://localhost:3000 -s -X POST \
  -H "Content-Type: application/json" \
  -d '{ "query": "{ allUsers { id name } }" }' | jq .
