#!/bin/bash

umask 0077

CONFIG=openssl.cnf
CAROOT=./CA
CAKEY=cakey.pem
CACERT=cacert.pem
SVKEY=server/svkey.pem
SVREQ=server/svreq.pem
SVCERT=server/svcert.pem
SVX509=server/svcert.crt
SVSTART=130101000000Z # 2013/01/01 00:00:00 GMT
SVEND=230101000000Z # 2023/01/01 00:00:00 GMT
HOSTNAME=selfsigned.jssec.org
SVSUBJ="/CN="${HOSTNAME}"/O=JSSEC Secure Coding Group/ST=Tokyo/C=JP"

export HOSTNAME=${HOSTNAME}

openssl genrsa -out ${SVKEY} 2048
openssl req -new -key ${SVKEY} -subj "${SVSUBJ}" -out ${SVREQ}
openssl ca -md sha256 \
  -keyfile ${CAROOT}/private/${CAKEY} -cert ${CAROOT}/${CACERT} \
  -startdate ${SVSTART} -enddate ${SVEND} \
  -in ${SVREQ} -out ${SVCERT} -config ${CONFIG}
openssl x509 -in ${SVCERT} -outform DER -out ${SVX509}
