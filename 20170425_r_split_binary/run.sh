#!/bin/sh

set -Ceux

head -c 5001001 /dev/random >| dummy.bin
Rscript --vanilla --silent split.r dummy.bin tmp 1000001
cat tmp/dummy.bin.* >| restore.bin
(cmp dummy.bin restore.bin && echo succeeded) || echo failed
rm -rf dummy.bin restore.bin tmp
