# compare alpine and distroless

```sh
$ export DOCKER_BUILDKIT=1
$ docker image build -f Dockerfile.alpine -t hello/alpine .
$ docker container run --rm -t hello/alpine
Hello, world%

$ docker images hello/alpine --format "{{.Size}}"
7.37MB

$ docker image build -f Dockerfile.distroless -t hello/distroless .
$ docker container run --rm -t hello/distroless
Hello, world%

$ docker images hello/distroless --format "{{.Size}}"
22MB
```
