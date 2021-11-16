#!/bin/sh

go build -trimpath main.go
./main
rm -rf ./main
