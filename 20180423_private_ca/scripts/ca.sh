#!/bin/bash

set -Ceux

rm -rf demoCA
mkdir -p demoCA/private
mkdir -p demoCA/newcerts
cd demoCA
echo 01 > serial

openssl req \
  -x509 \
  -days 3650 \
  -newkey rsa:2048 \
  -keyout private/cakey.pem \
  -out cacert.pem \
  -subj "/C=JP/ST=Tokyo/O=localhost/OU=test/CN=$(hostname)"
# cakey.pem のパスワードを入力

openssl req \
  -newkey rsa:2048 \
  -keyout newkey.pem \
  -out newreq.pem \
  -subj "/C=JP/ST=Tokyo/O=localhost/OU=test/CN=$(hostname)"

# * newkey.pem のパスワードを入力

openssl rsa -in newkey.pem -out nokey.pem
# newkey.pem のパスワードを入力

touch index.txt
cd ..

openssl ca \
  -in demoCA/newreq.pem \
  -days 3650 \
  -out demoCA/cert.pem \
  -notext
# /opt/demoCA/private/cakey.pem のパスワードを入力

cd ./demoCA

echo "00" > crlnumber

cp cert.pem ../server
cp nokey.pem ../server
cp cacert.pem ../server

cd ..
