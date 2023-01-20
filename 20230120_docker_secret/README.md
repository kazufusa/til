# Add secret to .env in Docker build process

```sh
$ cat Dockerfile
FROM alpine

COPY .env .env

RUN --mount=type=secret,id=SOME_KEY \
    export SOME_KEY=$(cat /run/secrets/SOME_KEY) && \
    echo "SOME_KEY=${SOME_KEY}" >> .env

RUN cat .env

$ SOME_KEY=I_am_a_secret_key docker build --no-cache --progress=plain --secret id=SOME_KEY,env=SOME_KEY .
#1 [internal] load build definition from Dockerfile
#1 sha256:01b143e38fc89d39d7081c17df8ddbf88f14d5a525f0f899ddc378a49134889b
#1 transferring dockerfile: 38B 0.0s done
#1 DONE 0.0s

#2 [internal] load .dockerignore
#2 sha256:6300f2bf2f93e54984aa78f7bb76eb1d71ddfc9515b37915d8f296d9707a3dac
#2 transferring context: 2B done
#2 DONE 0.0s

#3 [internal] load metadata for docker.io/library/alpine:latest
#3 sha256:d4fb25f5b5c00defc20ce26f2efc4e288de8834ed5aa59dff877b495ba88fda6
#3 DONE 1.5s

#4 [1/4] FROM docker.io/library/alpine@sha256:f271e74b17ced29b915d351685fd4644785c6d1559dd1f2d4189a5e851ef753a
#4 sha256:5a3eea7f0dd9f8f97486076c344776efa97be6241b4106b612083e7ab0516c1c
#4 CACHED

#5 [internal] load build context
#5 sha256:a0168648cafa353ce409dd887c0a9f679db2f4513dd8df26accff432a4aee61c
#5 transferring context: 25B done
#5 DONE 0.0s

#6 [2/4] COPY .env .env
#6 sha256:1a9710803755bc434d677476531271bc5fbc94ec13911d56360e747421e82838
#6 DONE 0.1s

#7 [3/4] RUN --mount=type=secret,id=SOME_KEY     export SOME_KEY=$(cat /run/secrets/SOME_KEY) &&     echo "SOME_KEY=${SOME_KEY}" >> .env
#7 sha256:00f12fa51a5c16d94e465cbde5744b45cbcc266624cb866ccd36c96c95e129f8
#7 DONE 0.6s

#8 [4/4] RUN cat .env
#8 sha256:98a6be7ad253a5e3a77cfde0fa0fd853a0303bfd016f5b2d19fe0ed7b0252af8
#8 0.683 AAA=BBB
#8 0.683 CCC=DDD
#8 0.683 SOME_KEY=I_am_a_secret_key
#8 DONE 0.7s

#9 exporting to image
#9 sha256:e8c613e07b0b7ff33893b694f7759a10d42e180f2b4dc349fb57dc6b71dcab00
#9 exporting layers 0.1s done
#9 writing image sha256:51663eaad43368fade4ceedce9129ab769c4c8c4560a76062284c8a5bb10d47e done
#9 DONE 0.1s

$ docker version
Client: Docker Engine - Community
 Cloud integration: v1.0.29
 Version:           20.10.21
 API version:       1.41
 Go version:        go1.18.7
 Git commit:        baeda1f
 Built:             Tue Oct 25 18:02:28 2022
 OS/Arch:           linux/amd64
 Context:           default
 Experimental:      true

Server: Docker Desktop
 Engine:
  Version:          20.10.21
  API version:      1.41 (minimum version 1.12)
  Go version:       go1.18.7
  Git commit:       3056208
  Built:            Tue Oct 25 18:00:19 2022
  OS/Arch:          linux/amd64
  Experimental:     false
 containerd:
  Version:          1.6.10
  GitCommit:        770bd0108c32f3fb5c73ae1264f7e503fe7b2661
 runc:
  Version:          1.1.4
  GitCommit:        v1.1.4-0-g5fd4c4d
 docker-init:
  Version:          0.19.0
  GitCommit:        de40ad0
```

## references

- https://docs.docker.com/build/ci/github-actions/examples/#secrets
