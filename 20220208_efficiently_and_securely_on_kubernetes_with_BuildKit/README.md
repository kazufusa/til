# Building Images Efficiently and Securely on Kubernetes with Buildkit

Akihiro Suda, NTT Corporation

- https://www.youtube.com/watch?v=JKbPzUnAZ1Y
- https://static.sched.com/hosted_files/kccnceu19/12/Building%20images%20%20efficiently%20and%20securely%20on%20Kubernetes%20with%20BuildKit.pdf
- https://medium.com/nttlabs/buildkit-on-kubernetes-d37a03150192
- https://github.com/moby/buildkit/blob/master/frontend/dockerfile/docs/syntax.md
- https://github.com/moby/buildkit/tree/master/examples/kubernetes/consistenthash

- Part2 Deploying
  - insecure build on Kubernetes, docker Pod with /var/run/docker.sock hostPath or docker:dind Pod with securityContext.privileged
  - secure Rootless mode
      - BuildKit can be executed as a non-root user



