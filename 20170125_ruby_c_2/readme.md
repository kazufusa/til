# Ruby and C ext 2

```
$ ruby extconf.rb
creating Makefile
$ make site-install
compiling calc.c
compiling module.c
linking shared-object mmath.bundle
/usr/bin/install -c -m 0755 mmath.bundle /usr/local/lib/ruby/site_ruby/2.3.0/x86_64-darwin15
$ ls /usr/local/lib/ruby/site_ruby/2.3.0/x86_64-darwin15
mmath.bundle
$ ruby -r mmath -e "p Math.add(1,2)"
3.0
```
