#!/bin/bash

umask 0077

CONFIG=openssl.cnf
CAROOT=./CA
CAKEY=cakey.pem
CAREQ=careq.pem
CACERT=cacert.pem
CAX509=cacert.crt
CASTART=130101000000Z # 2013/01/01 00:00:00 GMT
CAEND=230101000000Z # 2023/01/01 00:00:00 GMT
CASUBJ="/CN=JSSEC Private CA/O=JSSEC/ST=Tokyo/C=JP"

mkdir -p ${CAROOT}
mkdir -p ${CAROOT}/certs
mkdir -p ${CAROOT}/crl
mkdir -p ${CAROOT}/newcerts
mkdir -p ${CAROOT}/private
touch ${CAROOT}/index.txt

export HOSTNAME=""

openssl req -new -newkey rsa:2048 -sha256 -subj "${CASUBJ}" \
  -keyout ${CAROOT}/private/${CAKEY} -out ${CAROOT}/${CAREQ}

openssl ca -selfsign -md sha256 -create_serial -batch \
  -keyfile ${CAROOT}/private/${CAKEY} \
  -startdate ${CASTART} -enddate ${CAEND} -extensions v3_ca \
  -in ${CAROOT}/${CAREQ} -out ${CAROOT}/${CACERT} \
  -config ${CONFIG}

openssl x509 -in ${CAROOT}/${CACERT} -outform DER -out ${CAROOT}/${CAX509}
