# ruby and c

```
$ ruby extconf.rb
creating Makefile
$ make
compiling unyo.c
linking shared-object Unyo.bundle
$ ruby -r './Unyo' -e 'p Hoge.new.gunyo(1,2,3)'
6
```
