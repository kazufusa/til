# Docker, Centos7, and anyenv

```sh
$ docker build -t anyenv:centos7 .
$ docker run --rm -it anyenv:centos7 bash -lc "ruby --version"
ruby 2.6.3p62 (2019-04-16 revision 67580) [x86_64-linux]
$ docker run --rm -it anyenv:centos7 bash -lc "python --version"
Python 2.7.5
```
