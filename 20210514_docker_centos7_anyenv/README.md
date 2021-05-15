# Docker, Centos7, and anyenv

```sh
$ docker build -t anyenv:centos7 .
...
$ docker run --rm anyenv:centos7
+ ruby --version
ruby 2.6.3p62 (2019-04-16 revision 67580) [x86_64-linux]
+ python --version
Python 2.7.5

$ docker run --rm -it anyenv:centos7 irb
irb(main):001:0> exit

$ docker run --rm -it anyenv:centos7 python
Python 2.7.5 (default, Oct 14 2020, 14:45:30)
[GCC 4.8.5 20150623 (Red Hat 4.8.5-44)] on linux2
Type "help", "copyright", "credits" or "license" for more information.
>>> exit()
```
