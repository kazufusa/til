FROM golang:1.18.2-alpine3.15

ARG PROTOC_VERSION=3.20.1
ARG PROTOC_GEN_GO_VERSION=1.28.0
ARG PROTOC_GEN_GO_GRPC_VERSION=1.2.0
ARG GLIBC_VERSION=2.35

WORKDIR /
# install curl unzip
RUN apk --update add curl unzip

# install alpine-pkg-glibc for execute protoc
RUN wget -q -O /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub \
    && wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/"$GLIBC_VERSION"-r0/glibc-"$GLIBC_VERSION"-r0.apk \
    && apk add glibc-"$GLIBC_VERSION"-r0.apk

# install protoc
RUN curl -o $lib/protoc.zip --create-dirs -L \
    "https://github.com/protocolbuffers/protobuf/releases/download/v$PROTOC_VERSION/protoc-$PROTOC_VERSION-linux-x86_64.zip" \
    && unzip -q $lib/protoc.zip -d $lib/protoc \
    && cp -rp $lib/protoc/. /usr/local/.

# install plugin
RUN GO111MODULE=on go get \
  "google.golang.org/protobuf/cmd/protoc-gen-go@v$PROTOC_GEN_GO_VERSION" \
  "google.golang.org/grpc/cmd/protoc-gen-go-grpc@v$PROTOC_GEN_GO_GRPC_VERSION"

COPY ./pb_generator/genGrpcFiles.sh .

CMD ["/bin/ash", "./genGrpcFiles.sh"]
