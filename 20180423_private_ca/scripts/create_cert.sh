#!/bin/sh
set -eux

CLNT=$1
CA_ROOT=./demoCA
REPOS=${CA_ROOT}/repository
CONF=./scripts/openssl.cnf
mkdir -p $REPOS/${CLNT}

# key : 秘密鍵生成
openssl genrsa -rand /var/log/messages -out ${REPOS}/${CLNT}/${CLNT}-client.key -des3 2048

# key -> csr : 署名要求
openssl req -new -key ${REPOS}/${CLNT}/${CLNT}-client.key -out ${REPOS}/${CLNT}/${CLNT}-client.csr -config ${CONF}

# csr -> pem : 署名(Base64形式)
openssl ca -config ${CONF} -keyfile ${CA_ROOT}/private/cakey.pem -cert ${CA_ROOT}/cacert.pem -in ${REPOS}/${CLNT}/${CLNT}-client.csr -out ${REPOS}/${CLNT}/${CLNT}-client.pem

# pem -> crt : 証明書
openssl x509 -in ${REPOS}/${CLNT}/${CLNT}-client.pem -out ${REPOS}/${CLNT}/${CLNT}-client.crt

# crl (失効リスト更新)
openssl ca -config ${CONF} -gencrl -out ${CA_ROOT}/ca.crl -keyfile ${CA_ROOT}/private/cakey.pem -cert ${CA_ROOT}/cacert.pem -verbose -crldays 3650

# p12 (webブラウザ用。秘密鍵と公開鍵(証明書)を PKCS #12ファイルにまとめる)
openssl pkcs12 -export -in ${REPOS}/${CLNT}/${CLNT}-client.crt -inkey ${REPOS}/${CLNT}/${CLNT}-client.key -out ${REPOS}/${CLNT}/${CLNT}-client.p12 -certfile ${CA_ROOT}/cacert.pem -name 'demoCA Client Cert' -caname 'demoCA'

#p12.txt (p12のパスワードをtxtに保存)
echo -n "enter ${CLNT}.p12 pass : "
read P12PASS
echo ${P12PASS} > ${REPOS}/${CLNT}/${CLNT}-client.p12.txt
