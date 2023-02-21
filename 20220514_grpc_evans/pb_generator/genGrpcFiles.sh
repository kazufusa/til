#!/usr/bin/env bash
set -eu

protoc -I="/input" \
  --go_opt=module=grpc_evans/pb --go_out="/output" \
  --go-grpc_opt=module=grpc_evans/pb --go-grpc_out="/output" \
  /input/*.proto
