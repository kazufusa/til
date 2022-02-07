# compare alpine and distroless

```sh
$ docker image build -f Dockerfile.alpine -t hello/alpine .
$ docker run --rm -t hello/alpine
Hello, world%

$ docker images hello/alpine --format "{{.Size}}"
7.37MB

$ docker image build -f Dockerfile.distroless -t hello/distroless .
$ docker run --rm -t hello/distroless
Hello, world%

$ docker images hello/distroless --format "{{.Size}}"
22MB
```
