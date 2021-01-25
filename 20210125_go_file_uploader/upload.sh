#!/bin/sh

set -Ceux

date >| A.txt
curl -v -X POST -F "name=A.txt" -F "file=@A.txt" localhost:8080/upload
rm -rf A.txt
