# Ruby and C ext

```
$ ruby extconf.rb
creating Makefile
$ make site-install
compiling hello.c
linking shared-object hello.bundle
/usr/bin/instalcl -c -m 0755 hello.bundle /usr/local/lib/ruby/site_ruby/2.3.0/x86_64-darwin15
$ ls /usr/local/lib/ruby/site_ruby/2.3.0/x86_64-darwin15
hello.bundle
$ ruby -r hello -e Hello.hello
Hello, world!
```
