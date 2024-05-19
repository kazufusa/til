#!/bin/sh
set -Ceux
cd ./tmp

gsutil rm -r gs://kazufusa-_test/test || :

rm -rf ./test
mkdir ./test
cd ./test

echo 00 > 00.txt
echo 01 > 01.txt
echo 02 > 02.txt
echo 03 > 03.txt
echo 04 > 04.txt
echo 05 > 05.txt
echo 06 > 06.txt
echo 07 > 07.txt
echo 08 > 08.txt
echo 09 > 09.txt
echo 10 > 10.txt
echo 11 > 11.txt
echo 12 > 12.txt
echo 13 > 13.txt
echo 14 > 14.txt
echo 15 > 15.txt
echo 16 > 16.txt
echo 17 > 17.txt
echo 18 > 18.txt
echo 19 > 19.txt
echo 20 > 20.txt
echo 21 > 21.txt
echo 22 > 22.txt
echo 23 > 23.txt
echo 24 > 24.txt
echo 25 > 25.txt
echo 26 > 26.txt
echo 27 > 27.txt
echo 28 > 28.txt
echo 29 > 29.txt
echo 30 > 30.txt
echo 31 > 31.txt
echo 32 > 32.txt
echo 33 > 33.txt
echo 34 > 34.txt
echo 35 > 35.txt
echo 36 > 36.txt
echo 37 > 37.txt
cd ..

gsutil -m cp -r ./test gs://kazufusa-_test/
cd ..
export $(cat .env | xargs) && deno run -A main.ts
gsutil ls gs://kazufusa-_test/test/
gsutil cp gs://kazufusa-_test/test/_combined ./tmp
cat ./tmp/_combined

