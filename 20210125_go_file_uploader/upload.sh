#!/bin/sh

set -Ceux

date >| A.txt
curl --trace-ascii - -X POST -F "aaa[name]=A.txt" -F "aaa[file]=@A.txt" -F "n=\"1\"" localhost:8080/upload
rm -rf A.txt
